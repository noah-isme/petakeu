#!/usr/bin/env node

import { performance } from "node:perf_hooks";
import { spawnSync } from "node:child_process";

const scriptPath = new URL("./choropleth-load.k6.js", import.meta.url).pathname;

if (spawnSync("k6", ["version"], { stdio: "ignore" }).status === 0) {
  const result = spawnSync("k6", ["run", scriptPath, ...process.argv.slice(2)], { stdio: "inherit" });
  process.exit(result.status ?? 1);
}

const env = process.env;
const baseUrl = (env.BASE_URL || env.PETAKEU_BASE_URL || "http://localhost:4000").replace(/\/+$/, "");
const endpoint = env.CHOROPLETH_PATH || "/api/geo/choropleth";
const warmPeriod = env.WARM_PERIOD || env.PERIOD || "2025-08";
const rateValue = Number(env.RPS || env.RATE || 10);
const rate = Number.isFinite(rateValue) ? Math.max(10, rateValue) : 10;
const durationSeconds = Math.max(1, Number(env.DURATION_SECONDS || 5));
const warmSlaMs = Number(env.HIT_SLA_MS || 300);
const coldSlaMs = Number(env.COLD_SLA_MS || 2000);
const coldStartYear = Number(env.COLD_START_YEAR || 1900);
const headers = { Accept: "application/json" };

if (env.BEARER_TOKEN) {
  headers.Authorization = `Bearer ${env.BEARER_TOKEN}`;
}

function targetUrl(period) {
  return `${baseUrl}${endpoint}?period=${encodeURIComponent(period)}`;
}

function coldPeriod(index) {
  const year = coldStartYear + Math.floor(index / 12);
  const month = String((index % 12) + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function percentile(values, percentileValue) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.max(0, Math.ceil(sorted.length * percentileValue) - 1);
  return sorted[index];
}

async function request(period, bucket) {
  const started = performance.now();
  try {
    const response = await fetch(targetUrl(period), { headers });
    await response.arrayBuffer();
    bucket.push({ duration: performance.now() - started, ok: response.ok });
  } catch {
    bucket.push({ duration: performance.now() - started, ok: false });
  }
}

async function main() {
  try {
    await request(warmPeriod, []);
    const totalRequests = Math.max(rate * durationSeconds, 10);
    const warm = [];
    const cold = [];
    const pending = [];
    const started = performance.now();

    for (let index = 0; index < totalRequests; index += 1) {
      const dueAt = started + (index * 1000) / rate;
      const delay = dueAt - performance.now();
      if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));

      if (index % 2 === 0) {
        pending.push(request(warmPeriod, warm));
      } else {
        pending.push(request(coldPeriod(Math.floor(index / 2)), cold));
      }
    }

    await Promise.all(pending);

    const warmP95Ms = percentile(warm.map((item) => item.duration), 0.95);
    const coldP95Ms = percentile(cold.map((item) => item.duration), 0.95);
    const report = {
      runner: "node-fallback",
      baseUrl,
      endpoint,
      requestedRate: rate,
      durationSeconds,
      warmRequests: warm.length,
      coldRequests: cold.length,
      warmFailures: warm.filter((item) => !item.ok).length,
      coldFailures: cold.filter((item) => !item.ok).length,
      warmP95Ms,
      coldP95Ms,
      warmSlaMs,
      coldSlaMs,
      verdict:
        warmP95Ms !== null &&
        coldP95Ms !== null &&
        warm.every((item) => item.ok) &&
        cold.every((item) => item.ok) &&
        warmP95Ms < warmSlaMs &&
        coldP95Ms < coldSlaMs
          ? "PASS"
          : "FAIL"
    };

    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.verdict === "PASS" ? 0 : 1;
  } catch (error) {
    console.error(JSON.stringify({ runner: "node-fallback", verdict: "FAIL", error: String(error) }, null, 2));
    process.exitCode = 1;
  }
}

main();
