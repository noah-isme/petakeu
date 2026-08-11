import http from "k6/http";
import { check } from "k6";
import { Trend, Rate } from "k6/metrics";

const warmLatency = new Trend("choropleth_warm_latency", true);
const coldLatency = new Trend("choropleth_cold_latency", true);
const warmErrors = new Rate("choropleth_warm_errors");
const coldErrors = new Rate("choropleth_cold_errors");

const baseUrl = (__ENV.BASE_URL || __ENV.PETAKEU_BASE_URL || "http://localhost:3001").replace(/\/+$/, "");
const endpoint = __ENV.CHOROPLETH_PATH || "/api/geo/choropleth";
const warmPeriod = __ENV.WARM_PERIOD || __ENV.PERIOD || "2025-08";
const requestedRate = Number(__ENV.RPS || __ENV.RATE || 10);
const rate = Number.isFinite(requestedRate) ? Math.max(10, requestedRate) : 10;
const duration = __ENV.DURATION || "30s";
const hitSlaMs = Number(__ENV.HIT_SLA_MS || 300);
const coldSlaMs = Number(__ENV.COLD_SLA_MS || 2000);
const coldStartYear = Number(__ENV.COLD_START_YEAR || 1900);

export const options = {
  scenarios: {
    choropleth_load: {
      executor: "constant-arrival-rate",
      rate,
      timeUnit: "1s",
      duration,
      preAllocatedVUs: Math.max(10, Math.ceil(rate)),
      maxVUs: Math.max(20, Math.ceil(rate * 4))
    }
  },
  thresholds: {
    choropleth_warm_latency: [`p(95)<${hitSlaMs}`],
    choropleth_cold_latency: [`p(95)<${coldSlaMs}`],
    choropleth_warm_errors: ["rate<0.01"],
    choropleth_cold_errors: ["rate<0.01"]
  }
};

function headers() {
  const result = { Accept: "application/json" };
  if (__ENV.BEARER_TOKEN) {
    result.Authorization = `Bearer ${__ENV.BEARER_TOKEN}`;
  }
  return result;
}

function urlFor(period) {
  return `${baseUrl}${endpoint}?period=${encodeURIComponent(period)}`;
}

function coldPeriod() {
  const sequence = (__VU - 1) * 100000 + __ITER;
  const year = coldStartYear + Math.floor(sequence / 12);
  const month = String((sequence % 12) + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export function setup() {
  // Prime the warm key before the arrival-rate scenario starts.
  const response = http.get(urlFor(warmPeriod), { headers: headers() });
  check(response, { "warm-cache prime returned a response": (res) => res.status > 0 });
}

export default function () {
  const isWarm = (__VU + __ITER) % 2 === 0;
  const response = http.get(urlFor(isWarm ? warmPeriod : coldPeriod()), { headers: headers() });
  const ok = check(response, {
    "choropleth request succeeded": (res) => res.status >= 200 && res.status < 300,
    "choropleth response is JSON": (res) => String(res.headers["Content-Type"] || "").includes("application/json")
  });

  if (isWarm) {
    warmLatency.add(response.timings.duration);
    warmErrors.add(ok ? 0 : 1);
  } else {
    coldLatency.add(response.timings.duration);
    coldErrors.add(ok ? 0 : 1);
  }
}

export function handleSummary(data) {
  const warm = data.metrics.choropleth_warm_latency?.values?.["p(95)"] ?? null;
  const cold = data.metrics.choropleth_cold_latency?.values?.["p(95)"] ?? null;
  const report = {
    baseUrl,
    endpoint,
    warmPeriod,
    requestedRate: rate,
    duration,
    warmP95Ms: warm,
    coldP95Ms: cold,
    warmSlaMs: hitSlaMs,
    coldSlaMs,
    verdict: warm !== null && cold !== null && warm < hitSlaMs && cold < coldSlaMs ? "PASS" : "FAIL"
  };

  return { stdout: `${JSON.stringify(report, null, 2)}\n` };
}
