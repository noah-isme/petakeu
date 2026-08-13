#!/usr/bin/env node

/**
 * Make an opt-in Playwright suite a release gate.
 *
 * Playwright exits successfully when tests are skipped. Staging has all of the
 * credentials and services needed by the live contracts, so a skipped test is
 * a missing release prerequisite rather than a pass.
 */

import { readFile } from "node:fs/promises";

const reportPath = process.argv[2];

if (!reportPath) {
  console.error("Usage: node scripts/assert-playwright-no-skips.mjs <json-report>");
  process.exit(2);
}

let report;
try {
  report = JSON.parse(await readFile(reportPath, "utf8"));
} catch (error) {
  console.error(
    `Unable to read Playwright JSON report ${reportPath}: ${
      error instanceof Error ? error.message : String(error)
    }`
  );
  process.exit(1);
}

const skipped = [];
let testCount = 0;

function inspectSuite(suite, parents = []) {
  const suiteTitle = typeof suite?.title === "string" ? suite.title : undefined;
  const titlePath = suiteTitle ? [...parents, suiteTitle] : parents;

  for (const spec of suite?.specs ?? []) {
    const specTitle = typeof spec?.title === "string" ? spec.title : "(untitled test)";
    for (const test of spec?.tests ?? []) {
      testCount += 1;
      const resultStatuses = (test.results ?? [])
        .map((result) => result?.status)
        .filter((status) => typeof status === "string");
      const isSkipped =
        test.status === "skipped" ||
        test.expectedStatus === "skipped" ||
        resultStatuses.includes("skipped");

      if (isSkipped) {
        skipped.push({
          project: test.projectName ?? "unknown-project",
          title: [...titlePath, specTitle].join(" › ")
        });
      }
    }
  }

  for (const child of suite?.suites ?? []) {
    inspectSuite(child, titlePath);
  }
}

for (const suite of report?.suites ?? []) {
  inspectSuite(suite);
}

if (testCount === 0) {
  console.error(`Playwright JSON report contains no executed tests: ${reportPath}`);
  process.exit(1);
}

if (skipped.length > 0) {
  console.error(`Playwright release gate found ${skipped.length} skipped test(s):`);
  for (const test of skipped) {
    console.error(`- [${test.project}] ${test.title}`);
  }
  process.exit(1);
}

console.log(`Playwright release gate passed: ${testCount} tests ran with no skips.`);
