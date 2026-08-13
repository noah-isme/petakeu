#!/usr/bin/env node

/** Fail a release gate when Vitest reports pending/skipped tests. */

import { readFile } from "node:fs/promises";

const reportPath = process.argv[2];

if (!reportPath) {
  console.error("Usage: node scripts/assert-vitest-no-skips.mjs <json-report>");
  process.exit(2);
}

let report;
try {
  report = JSON.parse(await readFile(reportPath, "utf8"));
} catch (error) {
  console.error(
    `Unable to read Vitest JSON report ${reportPath}: ${
      error instanceof Error ? error.message : String(error)
    }`
  );
  process.exit(1);
}

const pending = Number(report?.numPendingTests ?? report?.numSkippedTests ?? 0);
const todo = Number(report?.numTodoTests ?? 0);
const total = Number(report?.numTotalTests ?? 0);

if (!Number.isFinite(total) || total <= 0) {
  console.error(`Vitest JSON report contains no tests: ${reportPath}`);
  process.exit(1);
}

if (pending > 0 || todo > 0) {
  console.error(`Vitest release gate found ${pending} pending/skipped and ${todo} todo test(s).`);
  process.exit(1);
}

console.log(`Vitest release gate passed: ${total} tests ran with no skips.`);
