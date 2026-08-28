#!/usr/bin/env node

/**
 * Run the real PostgreSQL/PostGIS, Redis, MinIO, and BullMQ integration gate
 * against a disposable Compose project. The project name and random host
 * ports prevent collisions with developer services; the finally block removes
 * the containers and volumes after every run.
 */

import { chmod, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const composeFile = path.join(rootDir, "docker-compose.integration.yml");
const runId = `${Date.now()}-${process.pid}`;
const projectName = `petakeu-it-${runId}`;
const evidenceDir = path.resolve(
  process.env.INTEGRATION_EVIDENCE_DIR ?? path.join(".r4-evidence", `integration-${runId}`)
);

await mkdir(evidenceDir, { recursive: true, mode: 0o700 });
await chmod(evidenceDir, 0o700);

function commandLabel(command, args) {
  return [command, ...args].join(" ");
}

function runCommand(command, args, options = {}) {
  const { capture = false, logFile, env = process.env } = options;
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: rootDir,
      env,
      stdio: capture || logFile ? ["ignore", "pipe", "pipe"] : "inherit"
    });
    let stdout = "";
    let stderr = "";
    const append = (chunk, stream) => {
      const text = chunk.toString();
      if (stream === "stdout") stdout += text;
      else stderr += text;
    };
    if (child.stdout) child.stdout.on("data", (chunk) => append(chunk, "stdout"));
    if (child.stderr) child.stderr.on("data", (chunk) => append(chunk, "stderr"));
    child.once("error", reject);
    child.once("close", async (code, signal) => {
      const output = `${stdout}${stderr}`;
      if (logFile) {
        await writeFile(path.join(evidenceDir, logFile), output, { mode: 0o600 });
      }
      if (code !== 0) {
        reject(
          new Error(`${commandLabel(command, args)} exited with ${signal ?? code}\n${output}`)
        );
        return;
      }
      resolve({ stdout, stderr, output });
    });
  });
}

function compose(args, options = {}) {
  return runCommand(
    "docker",
    ["compose", "--project-name", projectName, "--file", composeFile, ...args],
    options
  );
}

async function composePort(service, containerPort) {
  const result = await compose(["port", service, String(containerPort)], { capture: true });
  const match = result.stdout.trim().match(/:(\d+)\s*$/m);
  if (!match) {
    throw new Error(`Unable to discover host port for ${service}:${containerPort}`);
  }
  return Number(match[1]);
}

async function writeJson(filename, value) {
  await writeFile(path.join(evidenceDir, filename), `${JSON.stringify(value, null, 2)}\n`, {
    mode: 0o600
  });
}

let composeStarted = false;
let exitCode = 0;

try {
  await compose(["up", "--detach", "--wait", "--wait-timeout", "120"], {
    logFile: "compose-up.log"
  });
  composeStarted = true;

  const [postgresPort, redisPort, minioPort] = await Promise.all([
    composePort("postgres", 5432),
    composePort("redis", 6379),
    composePort("minio", 9000)
  ]);
  const integrationEnv = {
    ...process.env,
    NODE_ENV: "test",
    OTEL_SDK_DISABLED: "true",
    PETAKEU_INTEGRATION: "1",
    AUTH_DISABLED: "false",
    AUTH_SECRET: "petakeu-integration-secret-012345678901234567890",
    DATABASE_URL: `postgresql://petakeu:petakeu-integration@127.0.0.1:${postgresPort}/petakeu`,
    REDIS_URL: `redis://127.0.0.1:${redisPort}`,
    STORAGE_ENDPOINT: `http://127.0.0.1:${minioPort}`,
    STORAGE_ACCESS_KEY: "admin",
    STORAGE_SECRET_KEY: "password123",
    STORAGE_BUCKET: "uploads",
    STORAGE_REPORTS_BUCKET: "reports"
  };

  await writeJson("run-manifest.json", {
    projectName,
    composeFile,
    services: { postgresPort, redisPort, minioPort },
    migrationCommand: "pnpm --filter @petakeu/server migrate (twice)",
    integrationCommand: "vitest lifecycle, upload-pipeline, report-generation (serialized)"
  });

  await runCommand("pnpm", ["--filter", "@petakeu/server", "migrate"], {
    env: integrationEnv,
    logFile: "migrate-first.log"
  });
  await runCommand("pnpm", ["--filter", "@petakeu/server", "migrate"], {
    env: integrationEnv,
    logFile: "migrate-second.log"
  });

  const migrationCheck = await compose(
    [
      "exec",
      "--no-TTY",
      "postgres",
      "psql",
      "-U",
      "petakeu",
      "-d",
      "petakeu",
      "-Atc",
      "SELECT count(*) FROM _migrations; SELECT to_regclass('public.report_templates'); SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='report_jobs' AND column_name='template_id');"
    ],
    { capture: true, logFile: "migration-check.log" }
  );
  const migrationLines = migrationCheck.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (
    migrationLines[0] !== "9" ||
    migrationLines[1] !== "report_templates" ||
    migrationLines[2] !== "t"
  ) {
    throw new Error(`Migration idempotency/schema check failed: ${migrationLines.join(", ")}`);
  }

  await runCommand("pnpm", ["--filter", "@petakeu/server", "seed:regions"], {
    env: integrationEnv,
    logFile: "seed-regions.log"
  });

  const integrationReport = path.join(evidenceDir, "server-integration.json");
  await runCommand(
    "pnpm",
    [
      "--filter",
      "@petakeu/server",
      "exec",
      "vitest",
      "run",
      "src/integration/lifecycle.integration.test.ts",
      "src/integration/upload-pipeline.integration.test.ts",
      "src/integration/report-generation.integration.test.ts",
      "--no-file-parallelism",
      "--reporter=json",
      `--outputFile=${integrationReport}`
    ],
    { env: integrationEnv, logFile: "server-integration.log" }
  );
  await runCommand("node", ["scripts/assert-vitest-no-skips.mjs", integrationReport], {
    logFile: "server-integration-gate.log"
  });
  console.log(`Isolated integration gate passed; evidence: ${evidenceDir}`);
} catch (error) {
  exitCode = 1;
  console.error(error instanceof Error ? error.message : String(error));
} finally {
  if (composeStarted) {
    try {
      await compose(["logs", "--no-color"], { logFile: "compose.log" });
    } catch (error) {
      console.error(
        `Unable to capture Compose logs: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
  try {
    await compose(["down", "--volumes", "--remove-orphans"], { logFile: "compose-down.log" });
  } catch (error) {
    exitCode = 1;
    console.error(
      `Unable to tear down isolated Compose project: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

process.exitCode = exitCode;
