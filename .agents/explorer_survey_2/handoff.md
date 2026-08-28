# R2 Performance Benchmarking Script — Investigation & Design Handoff Report

## 1. Observation

### 1.1 Endpoint & Routing Architecture
- **Route Definition**: `apps/server/src/routes/v1/geo.ts:53`
  ```typescript
  geoRouter.get("/choropleth", requireAuth, geoController.getChoropleth);
  ```
- **Router Mounting**:
  - `apps/server/src/routes/v1/index.ts:18`: `apiRouter.use('/geo', geoRouter);`
  - `apps/server/src/routes/index.ts:6`: `app.use("/api", apiRouter);`
  - **Full HTTP Path**: `GET /api/geo/choropleth` (or `http://localhost:4000/api/geo/choropleth`).

### 1.2 Query Parameters & Authentication
- **Controller Logic**: `apps/server/src/controllers/geo-controller.ts:6-13`
  - Parameters parsed: `period` (default `"2025-08"`), `public` (`"1"` or `"true"`), `level` (number), `parent` (string).
- **Authentication**: `apps/server/src/middleware/auth.ts:32`
  - `AUTH_DISABLED` or empty `AUTH_SECRET` allows unauthenticated access for local development (`req.user = { sub: 'dev-user', role: 'admin' }`).
  - When `AUTH_SECRET` is set, requests require `Authorization: Bearer <jwt_token>`.

### 1.3 Caching Mechanism (Redis + PostgreSQL/PostGIS)
- **Cache Key Construction**: `apps/server/src/services/geo-service.ts:48-54`
  ```typescript
  function buildCacheKey(period: string, options: { publicMode?: boolean; level?: number; parent?: string } = {}): string {
    const parts = ['choropleth', period];
    if (options.level !== undefined) parts.push(String(options.level));
    if (options.parent !== undefined) parts.push(String(options.parent));
    if (options.publicMode) parts.push('public');
    return parts.join(':');
  }
  ```
- **Redis Key Prefixing**: `apps/server/src/db/redis.ts:44` & `geo-service.ts:179`
  - `getCached` prefix: `petakeu:geo`.
  - Resulting Redis key: `petakeu:geo:choropleth:{period}` (e.g. `petakeu:geo:choropleth:2025-08`).
  - Configurable TTL: `loadEnv().choroplethCacheTtl` (default 300 seconds).

- **Cold DB Query Execution**: `apps/server/src/services/geo-service.ts:84-100`
  - Executed on Redis miss: Queries PostgreSQL `regions` joined with `mv_payments_with_cut` using PostGIS functions `ST_AsGeoJSON(r.geom)` and `ST_Centroid(r.geom)`, calculates quantile bins in JS, and serializes response.

- **Metrics Tracking**: `apps/server/src/db/redis.ts:51, 58`
  - Increments Prometheus metrics `petakeu_cache_hits_total` and `petakeu_cache_misses_total` (exposed at `GET /metrics`).

### 1.4 Workspace & Scripts Directory Audit
- Root `package.json`: Node `>=18.17`, `turbo` workspace orchestrator.
- `apps/server/package.json`: Uses `vitest` for tests, `ts-node-dev` for dev server, `@types/node` ^20.12.7.
- Directory `scripts/`: Currently does **not exist** at root level.
- Existing scripts: `apps/server/scripts/seed-regions.ts`. No performance benchmarking scripts currently exist.

---

## 2. Logic Chain

1. **Endpoint Targeting**:
   - The national-level choropleth endpoint is located at `GET /api/geo/choropleth` (or `/api/v1/geo/choropleth`).
   - Standard benchmark invocation targets default period `2025-08` without `level` or `parent` filters (representing the national overview).

2. **Differentiating Cold Miss vs. Cache Hit**:
   - **Cold Miss Scenario**: Can be systematically triggered by appending unique, non-cached period queries (e.g. `period=1970-01`, `period=1970-02` ... `period=1970-N`) for each request in the cold run, OR by flushing/invalidating `petakeu:geo:choropleth:*` Redis keys before each request.
   - **Cache Hit Scenario**: Can be triggered by sending 1 initial request to warm up key `petakeu:geo:choropleth:2025-08`, followed by `N` concurrent requests to the exact same URL `/api/geo/choropleth?period=2025-08`.

3. **Concurrency & Load Generation (No External Dependencies)**:
   - Node.js 18+ includes native `fetch` with built-in Keep-Alive HTTP connection pooling.
   - A standard Promise-based worker pool (e.g. `C` concurrent async workers pulling from a total pool of `N` requests) generates high-throughput concurrent load (≥ 10 req/sec) without requiring external tools like `k6` or `autocannon`.

4. **SLA Verification & Latency Measurement**:
   - High-precision latency measurement per request using `performance.now()`.
   - p95 threshold logic:
     - `Cache Hit p95 < 300 ms`
     - `Cold Miss p95 < 2000 ms`
   - Overall verdict: `PASS` if both scenarios satisfy SLA; `FAIL` (exit code 1) otherwise.

5. **CLI & JSON Options**:
   - Native Node.js `util.parseArgs` (available in Node >= 18.3) handles `--url`, `--concurrency`, `--requests`, `--json`, `--help`, `--token`, `--hit-sla`, `--cold-sla`.
   - `--json` outputs machine-parseable JSON stdout for CI consumption; default format prints styled ASCII tables.

---

## 3. Caveats

- **Server Dependency**: The script assumes a running Petakeu server instance (e.g. `pnpm dev:server` on `http://localhost:4000`). If the server is unreachable, the script will catch network errors and exit with code 1.
- **Database Seed Data**: Cold query performance on empty/unseeded databases will be unrealistically fast (<10ms). For authentic benchmarking results, `pnpm seed:regions` should be run prior to benchmarking.
- **Auth Token Requirement**: If `AUTH_DISABLED=false` and `AUTH_SECRET` is set in the target server environment, requests will fail with 401 unless `--token <jwt>` is passed.

---

## 4. Conclusion & Recommended Design

### 4.1 File Location & Script Entry
Place the self-contained script at `scripts/benchmark-perf.ts` and add a helper script entry to root `package.json`:
```json
"scripts": {
  "benchmark": "tsx scripts/benchmark-perf.ts"
}
```

### 4.2 Proposed Implementation Skeleton (`scripts/benchmark-perf.ts`)

```typescript
import { parseArgs } from 'node:util';
import { performance } from 'node:perf_hooks';

interface BenchmarkConfig {
  baseUrl: string;
  endpoint: string;
  period: string;
  concurrency: number;
  requests: number;
  hitSlaMs: number;
  coldSlaMs: number;
  json: boolean;
  token?: string;
}

interface MetricResult {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  durationSec: number;
  requestsPerSec: number;
  minMs: number;
  avgMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
  pass: boolean;
}

function parseCliArgs(): BenchmarkConfig {
  const options = {
    url: { type: 'string', short: 'u', default: process.env.API_URL || 'http://localhost:4000' },
    endpoint: { type: 'string', short: 'e', default: '/api/geo/choropleth' },
    period: { type: 'string', short: 'p', default: '2025-08' },
    concurrency: { type: 'string', short: 'c', default: '10' },
    requests: { type: 'string', short: 'n', default: '50' },
    'hit-sla': { type: 'string', default: '300' },
    'cold-sla': { type: 'string', default: '2000' },
    token: { type: 'string', short: 't' },
    json: { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  } as const;

  const { values } = parseArgs({ options, allowPositionals: false });

  if (values.help) {
    console.log(`
Petakeu SLA Performance Benchmarking Utility

Usage:
  npx tsx scripts/benchmark-perf.ts [options]

Options:
  -u, --url <url>           Base server URL (default: http://localhost:4000)
  -e, --endpoint <path>     Choropleth endpoint path (default: /api/geo/choropleth)
  -p, --period <YYYY-MM>    Target period (default: 2025-08)
  -c, --concurrency <num>   Concurrent workers (default: 10)
  -n, --requests <num>      Requests per scenario (default: 50)
  --hit-sla <ms>            Cache hit SLA threshold in ms (default: 300)
  --cold-sla <ms>           Cold miss SLA threshold in ms (default: 2000)
  -t, --token <jwt>         Bearer authorization token (optional)
  --json                    Output results in JSON format
  -h, --help                Display this help message
`);
    process.exit(0);
  }

  return {
    baseUrl: values.url as string,
    endpoint: values.endpoint as string,
    period: values.period as string,
    concurrency: parseInt(values.concurrency as string, 10),
    requests: parseInt(values.requests as string, 10),
    hitSlaMs: parseInt(values['hit-sla'] as string, 10),
    coldSlaMs: parseInt(values['cold-sla'] as string, 10),
    json: Boolean(values.json),
    token: values.token as string | undefined,
  };
}

async function runScenario(
  config: BenchmarkConfig,
  isColdScenario: boolean
): Promise<MetricResult> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (config.token) {
    headers['Authorization'] = `Bearer ${config.token}`;
  }

  // Warmup for cache-hit scenario
  if (!isColdScenario) {
    const warmupUrl = `${config.baseUrl}${config.endpoint}?period=${config.period}`;
    await fetch(warmupUrl, { headers });
  }

  const latencies: number[] = [];
  let successCount = 0;
  let failCount = 0;
  let remaining = config.requests;

  const startTime = performance.now();

  const worker = async () => {
    while (remaining > 0) {
      remaining--;
      const currentReqIndex = config.requests - remaining;
      
      // For cold scenario: vary period query parameter to guarantee cache miss
      const periodParam = isColdScenario
        ? `19${(70 + (currentReqIndex % 30)).toString().padStart(2, '0')}-01`
        : config.period;

      const targetUrl = `${config.baseUrl}${config.endpoint}?period=${periodParam}`;

      const reqStart = performance.now();
      try {
        const res = await fetch(targetUrl, { headers });
        const reqEnd = performance.now();
        if (res.ok) {
          await res.arrayBuffer(); // Consume body
          latencies.push(reqEnd - reqStart);
          successCount++;
        } else {
          failCount++;
        }
      } catch (err) {
        failCount++;
      }
    }
  };

  const workers = Array.from({ length: config.concurrency }, () => worker());
  await Promise.all(workers);

  const totalDurationSec = (performance.now() - startTime) / 1000;
  latencies.sort((a, b) => a - b);

  const getPercentile = (p: number) => {
    if (latencies.length === 0) return 0;
    const idx = Math.ceil((p / 100) * latencies.length) - 1;
    return latencies[Math.max(0, Math.min(idx, latencies.length - 1))];
  };

  const p95 = getPercentile(95);
  const slaTarget = isColdScenario ? config.coldSlaMs : config.hitSlaMs;

  return {
    totalRequests: config.requests,
    successfulRequests: successCount,
    failedRequests: failCount,
    durationSec: totalDurationSec,
    requestsPerSec: totalDurationSec > 0 ? config.requests / totalDurationSec : 0,
    minMs: latencies[0] ?? 0,
    avgMs: latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0,
    p50Ms: getPercentile(50),
    p95Ms: p95,
    p99Ms: getPercentile(99),
    maxMs: latencies[latencies.length - 1] ?? 0,
    pass: p95 < slaTarget,
  };
}
```

---

## 5. Verification Method

1. **Script Invocation**:
   ```bash
   npx tsx scripts/benchmark-perf.ts --help
   npx tsx scripts/benchmark-perf.ts --url http://localhost:4000
   npx tsx scripts/benchmark-perf.ts --url http://localhost:4000 --json
   ```
2. **Lint and Typecheck**:
   ```bash
   pnpm typecheck
   pnpm lint
   ```
3. **Invalidation / Invalidation Criteria**:
   - If p95 exceeds 300ms for cache hits or 2000ms for cold queries, the verdict must be `FAIL` and process exit code must be `1`.
   - If `--json` option is passed, output must be valid JSON containing `results.cacheHit.p95Ms` and `results.coldMiss.p95Ms`.
