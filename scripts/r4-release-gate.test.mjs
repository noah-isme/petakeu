import { mkdtemp, readFile, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const preflightScript = path.join(rootDir, "scripts", "verify-r4-staging.mjs");
const liveSuiteScript = path.join(rootDir, "scripts", "run-r4-live-suite.mjs");
const secretValues = {
  AUTH_SECRET: "01234567890123456789012345678901",
  PETAKEU_PUBLIC_TOKEN: "public-token",
  PETAKEU_VIEWER_TOKEN: "viewer-token",
  PETAKEU_OPERATOR_TOKEN: "operator-token",
  PETAKEU_ADMIN_TOKEN: "admin-token"
};

function stagingEnv(overrides = {}) {
  return {
    PATH: process.env.PATH ?? "/usr/bin:/bin",
    NODE_ENV: "production",
    AUTH_DISABLED: "false",
    UPLOAD_REQUIRE_CONFIRMATION: "false",
    PETAKEU_INTEGRATION: "1",
    PETAKEU_RUN_LIVE_E2E: "1",
    PETAKEU_E2E_API_BASE_URL: "https://api.staging.example/api",
    DATABASE_URL: "postgres://staging.example/petakeu",
    REDIS_URL: "redis://staging.example:6379",
    STORAGE_ENDPOINT: "https://storage.staging.example",
    STORAGE_BUCKET: "uploads",
    STORAGE_REPORTS_BUCKET: "reports",
    ...secretValues,
    ...overrides
  };
}

function run(script, args, env) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: rootDir,
    env,
    encoding: "utf8"
  });
}

async function tempEvidenceDir() {
  return mkdtemp(path.join(os.tmpdir(), "petakeu-r4-gate-"));
}

test("R4 preflight fails when required HTTP checks are skipped", async () => {
  const evidenceDir = await tempEvidenceDir();
  const result = run(
    preflightScript,
    ["--phase", "baseline", "--skip-http", "--evidence-dir", evidenceDir, "--json"],
    stagingEnv()
  );

  assert.equal(result.status, 1);
  const evidence = JSON.parse(result.stdout);
  assert.equal(evidence.verdict, "FAIL");
  assert.deepEqual(evidence.blockingSkippedChecks, [
    "http:/live",
    "http:/ready",
    "http:/healthz",
    "http:/metrics"
  ]);

  const artifact = await stat(path.join(evidenceDir, "preflight-baseline.json"));
  assert.equal(artifact.mode & 0o777, 0o600);
});

test("R4 preflight can explicitly allow skipped probes only for diagnostics", async () => {
  const evidenceDir = await tempEvidenceDir();
  const result = run(
    preflightScript,
    [
      "--phase",
      "baseline",
      "--skip-http",
      "--allow-skipped",
      "--evidence-dir",
      evidenceDir,
      "--json"
    ],
    stagingEnv()
  );

  assert.equal(result.status, 0);
  const evidence = JSON.parse(result.stdout);
  assert.equal(evidence.verdict, "PASS");
  assert.equal(evidence.allowSkipped, true);
});

test("R4 live-suite wrapper reports missing staging configuration without secrets", async () => {
  const evidenceDir = await tempEvidenceDir();
  const result = run(
    liveSuiteScript,
    ["--suite", "security", "--evidence-dir", evidenceDir, "--json"],
    { PATH: process.env.PATH ?? "/usr/bin:/bin" }
  );

  assert.equal(result.status, 1);
  const output = JSON.parse(result.stdout);
  assert.equal(output.verdict, "FAIL");
  assert.ok(output.validation.missing.missing.includes("PETAKEU_RUN_LIVE_E2E"));
  assert.ok(!result.stdout.includes(secretValues.AUTH_SECRET));
  const artifact = await stat(path.join(evidenceDir, "live-suite-validation.json"));
  assert.equal(artifact.mode & 0o777, 0o600);
});

test("R4 live-suite dry run records both commands and never reports a pass", async () => {
  const evidenceDir = await tempEvidenceDir();
  const result = run(
    liveSuiteScript,
    ["--suite", "all", "--evidence-dir", evidenceDir, "--dry-run", "--json"],
    stagingEnv()
  );

  assert.equal(result.status, 0);
  const output = JSON.parse(result.stdout);
  assert.equal(output.verdict, "DRY_RUN");
  assert.deepEqual(
    output.results.map((item) => item.status),
    ["DRY_RUN", "DRY_RUN"]
  );

  const manifest = await readFile(path.join(evidenceDir, "live-suite-manifest.json"), "utf8");
  assert.ok(!manifest.includes(secretValues.AUTH_SECRET));
  assert.ok(!manifest.includes(secretValues.PETAKEU_OPERATOR_TOKEN));
  const artifact = await stat(path.join(evidenceDir, "live-suite-result.json"));
  assert.equal(artifact.mode & 0o777, 0o600);
});
