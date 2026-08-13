#!/usr/bin/env node

/**
 * Execute the opt-in R4 live suites with release-gate semantics.
 *
 * The repository's integration and Playwright contracts deliberately skip
 * when their staging dependencies are absent. That behavior is useful for a
 * normal local test run, but a release gate must turn a skip into a failure.
 * This wrapper validates the required environment, records command output in
 * a private evidence directory, and requires a structured report with at
 * least one executed test and no skipped tests.
 *
 * It never prints secret values and it does not mutate staging data itself.
 * The child test commands may of course write their normal test fixtures.
 */

import { chmod, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const { values } = parseArgs({
  options: {
    suite: { type: "string" },
    "evidence-dir": { type: "string" },
    "api-url": { type: "string" },
    period: { type: "string" },
    "pnpm-bin": { type: "string" },
    "dry-run": { type: "boolean" },
    json: { type: "boolean" },
    help: { type: "boolean", short: "h" }
  },
  allowPositionals: false
});

if (values.help) {
  console.log(`
R4 live-suite gate

Usage:
  node scripts/run-r4-live-suite.mjs --suite integration --evidence-dir .r4-evidence/live
  node scripts/run-r4-live-suite.mjs --suite security --evidence-dir .r4-evidence/live
  node scripts/run-r4-live-suite.mjs --suite all --evidence-dir .r4-evidence/live --json
  node scripts/run-r4-live-suite.mjs --suite all --evidence-dir /tmp/r4 --dry-run --json

Suites:
  integration   Real PostgreSQL/Redis/MinIO/BullMQ upload and report contracts
  security      Live Playwright API RBAC, redaction, and report-expiry contracts
  all           Run integration and security sequentially

The evidence directory is required and must be owner-only (0700 or stricter).
--dry-run validates configuration and records the commands without running them;
its verdict is DRY_RUN and is not a release pass.
`);
  process.exit(0);
}

const suite = String(values.suite ?? process.env.R4_SUITE ?? "all");
const evidenceDirValue = values["evidence-dir"] ?? process.env.R4_EVIDENCE_DIR;
const evidenceDir = evidenceDirValue ? path.resolve(String(evidenceDirValue)) : undefined;
const dryRun = values["dry-run"] === true;
const jsonOutput = values.json === true;
const apiUrlOverride = values["api-url"] ? String(values["api-url"]) : undefined;
const period = String(values.period ?? process.env.PETAKEU_E2E_PERIOD ?? "2025-08");
const pnpmBin = String(values["pnpm-bin"] ?? process.env.R4_PNPM_BIN ?? "pnpm");
const runId = `${Date.now()}-${process.pid}`;

const allowedSuites = new Set(["integration", "security", "all"]);
const secretEnvNames = [
  "AUTH_SECRET",
  "DATABASE_URL",
  "REDIS_URL",
  "STORAGE_ACCESS_KEY",
  "STORAGE_SECRET_KEY",
  "PETAKEU_PUBLIC_TOKEN",
  "PETAKEU_VIEWER_TOKEN",
  "PETAKEU_OPERATOR_TOKEN",
  "PETAKEU_ADMIN_TOKEN"
];

const requirements = {
  integration: [
    ["PETAKEU_INTEGRATION", "1"],
    ["AUTH_DISABLED", "false"],
    ["DATABASE_URL"],
    ["REDIS_URL"],
    ["STORAGE_ENDPOINT"],
    ["STORAGE_BUCKET"],
    ["STORAGE_REPORTS_BUCKET"],
    ["AUTH_SECRET"]
  ],
  security: [
    ["PETAKEU_RUN_LIVE_E2E", "1"],
    ["AUTH_DISABLED", "false"],
    ["PETAKEU_E2E_API_BASE_URL"],
    ["PETAKEU_PUBLIC_TOKEN"],
    ["PETAKEU_VIEWER_TOKEN"],
    ["PETAKEU_OPERATOR_TOKEN"],
    ["PETAKEU_ADMIN_TOKEN"]
  ]
};

function selectedSuites() {
  if (suite === "all") return ["integration", "security"];
  return allowedSuites.has(suite) ? [suite] : [];
}

function requiredEnvironment() {
  const names = new Map();
  for (const selected of selectedSuites()) {
    for (const [name, expected] of requirements[selected]) {
      if (!names.has(name)) names.set(name, expected);
    }
  }

  // An API origin supplied on the command line is normalized into the same
  // /api base URL expected by security-contracts.spec.ts.
  if (apiUrlOverride && !process.env.PETAKEU_E2E_API_BASE_URL) {
    names.delete("PETAKEU_E2E_API_BASE_URL");
  }
  return names;
}

function missingEnvironment() {
  const missing = [];
  const mismatched = [];
  for (const [name, expected] of requiredEnvironment()) {
    const actual = process.env[name];
    if (typeof actual !== "string" || actual.trim().length === 0) {
      missing.push(name);
    } else if (expected && actual !== expected) {
      mismatched.push({ name, expected });
    }
  }

  const authSecret = process.env.AUTH_SECRET;
  if (
    selectedSuites().includes("integration") &&
    typeof authSecret === "string" &&
    authSecret.length < 32
  ) {
    mismatched.push({ name: "AUTH_SECRET", expected: "at least 32 characters" });
  }

  const apiBaseUrl = apiUrlOverride ?? process.env.PETAKEU_E2E_API_BASE_URL;
  if (selectedSuites().includes("security")) {
    if (typeof apiBaseUrl === "string" && apiBaseUrl.trim().length > 0) {
      try {
        const parsed = new URL(apiBaseUrl);
        if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("unsupported protocol");
      } catch {
        mismatched.push({ name: "PETAKEU_E2E_API_BASE_URL", expected: "an http(s) URL" });
      }
    }
  }

  return { missing, mismatched };
}

function redact(value) {
  let result = String(value);
  for (const name of secretEnvNames) {
    const secret = process.env[name];
    if (typeof secret === "string" && secret.length >= 4) {
      result = result.split(secret).join("[REDACTED]");
    }
  }
  return result;
}

async function ensureEvidenceDirectory() {
  if (!evidenceDir) {
    throw new Error(
      "pass --evidence-dir or set R4_EVIDENCE_DIR; live results without evidence are not a release pass"
    );
  }

  await mkdir(evidenceDir, { recursive: true, mode: 0o700 });
  const details = await stat(evidenceDir);
  const mode = details.mode & 0o777;
  if ((mode & 0o077) !== 0) {
    throw new Error(
      `evidence directory ${evidenceDir} has mode ${mode.toString(8).padStart(3, "0")}; expected owner-only access`
    );
  }
  return mode;
}

async function writeEvidence(filename, content) {
  const target = path.join(evidenceDir, filename);
  await writeFile(target, content, { mode: 0o600 });
  await chmod(target, 0o600);
  return target;
}

function apiBaseUrl() {
  const raw = apiUrlOverride ?? process.env.PETAKEU_E2E_API_BASE_URL;
  if (!raw) return undefined;
  const parsed = new URL(raw);
  if (!["http:", "https:"].includes(parsed.protocol))
    throw new Error("API URL must use http or https");
  const pathname = parsed.pathname.replace(/\/+$/, "");
  parsed.pathname = pathname === "/api" || pathname.endsWith("/api") ? pathname : `${pathname}/api`;
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString().replace(/\/+$/, "");
}

function commandsFor(selected) {
  const commonEnv = { PETAKEU_E2E_PERIOD: period };
  if (selected === "integration") {
    const prefix = `r4-live-${runId}-server-live-integration`;
    return {
      name: "server-live-integration",
      args: [
        "--filter",
        "@petakeu/server",
        "exec",
        "vitest",
        "run",
        "src/integration/upload-pipeline.integration.test.ts",
        "src/integration/report-generation.integration.test.ts",
        "--reporter=json",
        `--outputFile=${path.join(evidenceDir, `${prefix}.results.json`)}`
      ],
      env: commonEnv,
      resultFile: `${prefix}.results.json`
    };
  }

  const prefix = `r4-live-${runId}-security-contracts`;
  return {
    name: "security-contracts",
    args: [
      "--filter",
      "@petakeu/web",
      "exec",
      "playwright",
      "test",
      "e2e/security-contracts.spec.ts",
      "--project=chromium-desktop",
      "--reporter=json"
    ],
    env: {
      ...commonEnv,
      PETAKEU_E2E_API_BASE_URL: apiBaseUrl(),
      PLAYWRIGHT_JSON_OUTPUT_FILE: path.join(evidenceDir, `${prefix}.results.json`)
    },
    resultFile: `${prefix}.results.json`
  };
}

function countStatuses(value, counts = { passed: 0, failed: 0, skipped: 0, other: 0 }) {
  if (!value || typeof value !== "object") return counts;
  if (Array.isArray(value)) {
    for (const entry of value) countStatuses(entry, counts);
    return counts;
  }

  const object = value;
  if (typeof object.status === "string") {
    if (object.status === "passed") counts.passed += 1;
    else if (object.status === "failed" || object.status === "unexpected") counts.failed += 1;
    else if (object.status === "skipped" || object.status === "pending" || object.status === "todo")
      counts.skipped += 1;
    else if (object.status !== "running") counts.other += 1;
  }
  for (const [key, child] of Object.entries(object)) {
    // Playwright result objects include a status for each retry result and a
    // parent status. Counting all of them is conservative for skip detection;
    // any skipped result is still a gate failure.
    if (key !== "status") countStatuses(child, counts);
  }
  return counts;
}

function summarizeReport(report) {
  if (report && typeof report === "object") {
    const stats = report.stats;
    if (
      stats &&
      typeof stats === "object" &&
      ["expected", "skipped", "unexpected"].some((key) => key in stats)
    ) {
      const expected = Number(stats.expected ?? 0);
      const skipped = Number(stats.skipped ?? 0);
      const failed = Number(stats.unexpected ?? 0) + Number(stats.flaky ?? 0);
      return {
        passed: Math.max(0, expected - skipped - failed),
        failed,
        skipped,
        total: expected + skipped + failed
      };
    }

    if ("numTotalTests" in report || "numPassedTests" in report || "numPendingTests" in report) {
      const total = Number(report.numTotalTests ?? 0);
      const passed = Number(report.numPassedTests ?? 0);
      const failed = Number(report.numFailedTests ?? 0);
      const skipped = Number(report.numPendingTests ?? 0) + Number(report.numTodoTests ?? 0);
      return { passed, failed, skipped, total: Math.max(total, passed + failed + skipped) };
    }
  }

  const counts = countStatuses(report);
  return { ...counts, total: counts.passed + counts.failed + counts.skipped + counts.other };
}

async function readStructuredReport(resultFile) {
  try {
    const content = await readFile(path.join(evidenceDir, resultFile), "utf8");
    return JSON.parse(content);
  } catch {
    return undefined;
  }
}

function spawnCommand(command, envOverrides, stdoutFile, stderrFile) {
  return new Promise((resolve) => {
    const child = spawn(pnpmBin, command.args, {
      cwd: rootDir,
      env: { ...process.env, ...envOverrides },
      stdio: ["ignore", "pipe", "pipe"]
    });
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(Buffer.from(chunk)));
    child.stderr.on("data", (chunk) => stderr.push(Buffer.from(chunk)));
    child.on("error", (error) =>
      resolve({ code: 1, signal: undefined, stdout: "", stderr: String(error) })
    );
    child.on("close", (code, signal) =>
      resolve({
        code: code ?? 1,
        signal,
        stdout: redact(Buffer.concat(stdout).toString("utf8")),
        stderr: redact(Buffer.concat(stderr).toString("utf8"))
      })
    );
  }).then(async (result) => {
    await writeEvidence(stdoutFile, result.stdout);
    await writeEvidence(stderrFile, result.stderr);
    return result;
  });
}

async function main() {
  const startedAt = new Date().toISOString();
  let mode;
  try {
    mode = await ensureEvidenceDirectory();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const output = { verdict: "FAIL", suite, error: message };
    if (jsonOutput) console.log(JSON.stringify(output, null, 2));
    else console.error(`R4 live-suite gate: FAIL (${message})`);
    process.exitCode = 1;
    return;
  }

  const validation = {
    missing: missingEnvironment(),
    suite,
    evidenceDir,
    evidenceMode: mode.toString(8).padStart(3, "0")
  };

  if (!allowedSuites.has(suite)) {
    validation.missing.mismatched.push({
      name: "suite",
      expected: "integration, security, or all"
    });
  }
  if (validation.missing.missing.length > 0 || validation.missing.mismatched.length > 0) {
    const output = {
      verdict: "FAIL",
      suite,
      validation,
      message: "required R4 live-suite configuration is missing or mismatched"
    };
    await writeEvidence("live-suite-validation.json", `${JSON.stringify(output, null, 2)}\n`);
    if (jsonOutput) console.log(JSON.stringify(output, null, 2));
    else {
      console.error("R4 live-suite gate: FAIL (configuration)");
      for (const name of validation.missing.missing) console.error(`MISSING ${name}`);
      for (const item of validation.missing.mismatched)
        console.error(`INVALID ${item.name}: expected ${item.expected}`);
    }
    process.exitCode = 1;
    return;
  }

  const commands = selectedSuites().map(commandsFor);
  const manifest = {
    generatedAt: startedAt,
    suite,
    dryRun,
    evidenceDir,
    commands: commands.map((command) => ({
      name: command.name,
      executable: pnpmBin,
      args: command.args
    })),
    environmentKeys: Object.keys(process.env)
      .filter(
        (name) =>
          requirements.integration.some(([required]) => required === name) ||
          requirements.security.some(([required]) => required === name)
      )
      .sort()
  };
  await writeEvidence("live-suite-manifest.json", `${JSON.stringify(manifest, null, 2)}\n`);

  const results = [];
  for (const command of commands) {
    if (dryRun) {
      results.push({ name: command.name, status: "DRY_RUN", command: command.args });
      continue;
    }

    const processResult = await spawnCommand(
      command,
      command.env,
      `${command.resultFile.replace(/\.results\.json$/, "")}.stdout.log`,
      `${command.resultFile.replace(/\.results\.json$/, "")}.stderr.log`
    );
    const report = await readStructuredReport(command.resultFile);
    const summary = summarizeReport(report);
    const reportMissing = !report;
    const skipped = summary.skipped > 0;
    const noTests = summary.total === 0;
    const passed =
      processResult.code === 0 && !reportMissing && !skipped && !noTests && summary.failed === 0;
    results.push({
      name: command.name,
      status: passed ? "PASS" : "FAIL",
      exitCode: processResult.code,
      signal: processResult.signal,
      summary,
      report: command.resultFile,
      failureReasons: [
        processResult.code !== 0 ? `child exited with code ${processResult.code}` : undefined,
        reportMissing ? "structured test report is missing or invalid" : undefined,
        skipped ? `${summary.skipped} test(s) skipped` : undefined,
        noTests ? "no tests executed" : undefined,
        summary.failed > 0 ? `${summary.failed} test(s) failed` : undefined
      ].filter(Boolean)
    });
  }

  const verdict = dryRun
    ? "DRY_RUN"
    : results.every((result) => result.status === "PASS")
      ? "PASS"
      : "FAIL";
  const output = {
    generatedAt: startedAt,
    completedAt: new Date().toISOString(),
    verdict,
    suite,
    evidenceDir,
    results
  };
  await writeEvidence("live-suite-result.json", `${JSON.stringify(output, null, 2)}\n`);

  if (jsonOutput) console.log(JSON.stringify(output, null, 2));
  else {
    console.log(`R4 live-suite gate: ${verdict} (${suite})`);
    for (const result of results) {
      const details = result.failureReasons?.length ? `: ${result.failureReasons.join("; ")}` : "";
      console.log(`${result.status.padEnd(7)} ${result.name}${details}`);
    }
  }

  process.exitCode = verdict === "PASS" || verdict === "DRY_RUN" ? 0 : 1;
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  if (jsonOutput)
    console.log(JSON.stringify({ verdict: "FAIL", suite, error: redact(message) }, null, 2));
  else console.error(`R4 live-suite gate: FAIL (${redact(message)})`);
  process.exitCode = 1;
});
