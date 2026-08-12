#!/usr/bin/env node

/**
 * Non-destructive R4 staging preflight.
 *
 * This script only reads local migration files and performs HTTP GET requests
 * against the configured API. It never deploys, writes to PostgreSQL/Redis/
 * object storage, or deletes test data. The live integration, browser, and
 * performance commands remain explicit steps in the R4 runbook.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const { values } = parseArgs({
  options: {
    'api-url': { type: 'string' },
    phase: { type: 'string' },
    'timeout-ms': { type: 'string' },
    'skip-http': { type: 'boolean' },
    json: { type: 'boolean' },
    help: { type: 'boolean', short: 'h' },
  },
  allowPositionals: false,
});

if (values.help) {
  console.log(`
R4 staging preflight (read-only)

Usage:
  node scripts/verify-r4-staging.mjs --phase baseline --api-url https://api.staging.example
  node scripts/verify-r4-staging.mjs --phase confirmation --api-url https://api.staging.example
  node scripts/verify-r4-staging.mjs --phase baseline --skip-http --json

Phases:
  baseline      UPLOAD_REQUIRE_CONFIRMATION must be explicitly false
  confirmation  UPLOAD_REQUIRE_CONFIRMATION must be explicitly true

The script reads migration files and required environment variables. Unless
--skip-http is supplied, it also GETs /live, /ready, /healthz, and /metrics.
`);
  process.exit(0);
}

const phase = String(values.phase ?? process.env.R4_PHASE ?? 'baseline');
const validPhases = new Set(['baseline', 'confirmation']);
const timeoutMs = Math.max(500, Number(values['timeout-ms'] ?? process.env.R4_TIMEOUT_MS ?? 5000));
const skipHttp = values['skip-http'] === true;
const jsonOutput = values.json === true;
const explicitApiUrl = values['api-url'] ?? process.env.R4_API_URL;
const apiUrl = explicitApiUrl ? String(explicitApiUrl).replace(/\/+$/, '') : undefined;

const checks = [];

function addCheck(name, passed, details, status = passed ? 'PASS' : 'FAIL') {
  checks.push({ name, status, details });
}

function envPresent(name) {
  const value = process.env[name];
  const present = typeof value === 'string' && value.trim().length > 0;
  addCheck(`env:${name}`, present, present ? 'set' : 'missing');
  return present;
}

function envEquals(name, expected) {
  const actual = process.env[name];
  const passed = actual === expected;
  addCheck(`env:${name}`, passed, passed ? `set to ${expected}` : `expected ${expected}, received ${actual ?? 'unset'}`);
}

async function checkMigration(filename, markers) {
  const migrationPath = path.join(rootDir, 'apps', 'server', 'migrations', filename);
  try {
    const sql = await readFile(migrationPath, 'utf8');
    const missing = markers.filter((marker) => !sql.includes(marker));
    addCheck(
      `migration:${filename}`,
      missing.length === 0,
      missing.length === 0 ? `found ${markers.length} required markers` : `missing markers: ${missing.join(', ')}`,
    );
  } catch (error) {
    addCheck(`migration:${filename}`, false, error instanceof Error ? error.message : String(error));
  }
}

function apiOrigin(value) {
  const parsed = new URL(value);
  const pathname = parsed.pathname.replace(/\/+$/, '');
  parsed.pathname = pathname === '/api' || pathname.endsWith('/api')
    ? pathname.slice(0, -4) || '/'
    : pathname || '/';
  parsed.search = '';
  parsed.hash = '';
  return parsed.toString().replace(/\/$/, '');
}

async function fetchEndpoint(baseUrl, endpoint) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${baseUrl}${endpoint}`, {
      method: 'GET',
      headers: { Accept: 'application/json, text/plain;q=0.9' },
      signal: controller.signal,
    });
    const text = await response.text();
    let body = text;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      // Keep a plain-text response available for diagnostics.
    }
    return { response, body };
  } finally {
    clearTimeout(timer);
  }
}

async function probeHttp() {
  if (skipHttp) {
    for (const endpoint of ['/live', '/ready', '/healthz', '/metrics']) {
      addCheck(`http:${endpoint}`, true, 'skipped by --skip-http', 'SKIP');
    }
    return;
  }

  if (!apiUrl) {
    addCheck('http:api-url', false, 'set R4_API_URL or pass --api-url');
    return;
  }

  let baseUrl;
  try {
    baseUrl = apiOrigin(apiUrl);
    addCheck('http:api-url', true, baseUrl);
  } catch (error) {
    addCheck('http:api-url', false, error instanceof Error ? error.message : String(error));
    return;
  }

  const probes = [
    {
      endpoint: '/live',
      validate: (body, response) => response.status === 200 && body?.alive === true,
      describe: (body, response) => `HTTP ${response.status}; alive=${String(body?.alive)}`,
    },
    {
      endpoint: '/ready',
      validate: (body, response) => response.status === 200 && body?.ready === true,
      describe: (body, response) => `HTTP ${response.status}; ready=${String(body?.ready)}`,
    },
    {
      endpoint: '/healthz',
      validate: (body, response) => response.status === 200 && body?.status === 'healthy',
      describe: (body, response) => `HTTP ${response.status}; status=${String(body?.status)}`,
    },
    {
      endpoint: '/metrics',
      validate: (body, response) => response.status === 200 && typeof body === 'string' && body.includes('petakeu_'),
      describe: (_body, response) => `HTTP ${response.status}; Petakeu metrics=${response.status === 200 ? 'present' : 'missing'}`,
    },
  ];

  let healthBody;
  for (const probe of probes) {
    try {
      const { response, body } = await fetchEndpoint(baseUrl, probe.endpoint);
      const passed = probe.validate(body, response);
      addCheck(`http:${probe.endpoint}`, passed, probe.describe(body, response));
      if (probe.endpoint === '/healthz') healthBody = body;
    } catch (error) {
      addCheck(`http:${probe.endpoint}`, false, error instanceof Error ? error.message : String(error));
    }
  }

  if (healthBody && typeof healthBody === 'object') {
    for (const component of ['database', 'redis', 'storage', 'queue']) {
      const status = healthBody.checks?.[component]?.status;
      addCheck(
        `health:${component}`,
        status === 'healthy',
        `status=${String(status ?? 'missing')}`,
      );
    }
  } else {
    addCheck('health:components', false, 'healthz did not return a JSON health payload');
  }

  const storageHealthUrl = process.env.R4_STORAGE_HEALTH_URL;
  if (!storageHealthUrl) {
    addCheck('storage:direct-health', true, 'skipped; API healthz is the configured storage probe', 'SKIP');
  } else {
    try {
      const { response } = await fetchEndpoint(storageHealthUrl.replace(/\/+$/, ''), '');
      addCheck('storage:direct-health', response.status === 200, `HTTP ${response.status}`);
    } catch (error) {
      addCheck('storage:direct-health', false, error instanceof Error ? error.message : String(error));
    }
  }
}

async function main() {
  if (!validPhases.has(phase)) {
    addCheck('phase', false, `unsupported phase ${phase}; use baseline or confirmation`);
  } else {
    addCheck('phase', true, phase);
  }

  for (const name of [
    'DATABASE_URL',
    'REDIS_URL',
    'STORAGE_ENDPOINT',
    'STORAGE_BUCKET',
    'STORAGE_REPORTS_BUCKET',
    'AUTH_SECRET',
    'PETAKEU_INTEGRATION',
    'PETAKEU_RUN_LIVE_E2E',
    'PETAKEU_E2E_API_BASE_URL',
    'PETAKEU_PUBLIC_TOKEN',
    'PETAKEU_VIEWER_TOKEN',
    'PETAKEU_OPERATOR_TOKEN',
    'PETAKEU_ADMIN_TOKEN',
  ]) {
    envPresent(name);
  }

  addCheck(
    'env:AUTH_SECRET-strength',
    (process.env.AUTH_SECRET?.length ?? 0) >= 32,
    (process.env.AUTH_SECRET?.length ?? 0) >= 32 ? 'at least 32 characters' : 'must be at least 32 characters',
  );
  envEquals('AUTH_DISABLED', 'false');
  envEquals('PETAKEU_INTEGRATION', '1');
  envEquals('PETAKEU_RUN_LIVE_E2E', '1');
  envEquals('UPLOAD_REQUIRE_CONFIRMATION', phase === 'confirmation' ? 'true' : 'false');

  await checkMigration('007_staged_ingestion.sql', [
    'staged_upload_rows',
    'upload_validation_findings',
    'uploads_status_check_007',
    'gross_amount',
  ]);
  await checkMigration('008_report_filters.sql', [
    'period_from',
    'province_ids',
    'report_jobs_ranking_criterion_008',
    'report_type',
  ]);

  await probeHttp();

  const failed = checks.filter((check) => check.status === 'FAIL');
  const evidence = {
    generatedAt: new Date().toISOString(),
    phase,
    apiUrl: apiUrl ?? null,
    checks,
    verdict: failed.length === 0 ? 'PASS' : 'FAIL',
  };

  if (jsonOutput) {
    console.log(JSON.stringify(evidence, null, 2));
  } else {
    console.log(`R4 staging preflight: ${evidence.verdict} (${phase})`);
    for (const check of checks) {
      console.log(`${check.status.padEnd(4)} ${check.name}: ${check.details}`);
    }
    if (failed.length > 0) {
      console.log(`Failed checks: ${failed.length}`);
    }
  }

  process.exitCode = failed.length === 0 ? 0 : 1;
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  if (jsonOutput) {
    console.log(JSON.stringify({ verdict: 'FAIL', error: message }, null, 2));
  } else {
    console.error(`R4 staging preflight: FAIL (${message})`);
  }
  process.exitCode = 1;
});
