# Milestone 2: Performance Benchmarking Script — Investigation & Implementation Blueprint Handoff Report

## 1. Observation

### 1.1 Endpoint & Routing Architecture
- **Route Definition**: `apps/server/src/routes/v1/geo.ts:53`
  ```typescript
  geoRouter.get("/choropleth", requireAuth, geoController.getChoropleth);
  ```
- **Router Mounting Hierarchy**:
  - `apps/server/src/routes/v1/index.ts:18`: `apiRouter.use('/geo', geoRouter);`
  - `apps/server/src/routes/index.ts:6`: `app.use("/api", apiRouter);`
  - **Full HTTP Path**: `GET /api/geo/choropleth` (or `http://localhost:4000/api/geo/choropleth`).

### 1.2 Controller & Service Caching Behavior
- **Controller Parsing**: `apps/server/src/controllers/geo-controller.ts:6-13`
  - Parses query parameter `period` (defaults to `"2025-08"`), `public`, `level`, `parent`.
- **Redis Cache Key Structure**: `apps/server/src/services/geo-service.ts:48-54, 179`
  - Service helper `buildCacheKey(period, options)` generates key `choropleth:{period}`.
  - Redis module `getCached` prepends `petakeu:geo`.
  - Actual Redis cache key: `petakeu:geo:choropleth:{period}` (e.g. `petakeu:geo:choropleth:2025-08`).
- **Cache Hit vs. Cold Miss Mechanics**:
  - **Cache Hit**: Request to `/api/geo/choropleth?period=2025-08`. After 1 warmup request, Redis returns JSON directly (`~5-20 ms`).
  - **Cold Miss**: Request with a unique, non-cached period (e.g., `period=1970-01`, `period=1970-02` ...). Redis miss triggers PostgreSQL/PostGIS query joining `regions` with `mv_payments_with_cut`, executing `ST_AsGeoJSON(r.geom)` and `ST_Centroid(r.geom)`, and calculating quantile bins in Node (`~20-150 ms`).

### 1.3 Authentication & Authorization
- **Middleware**: `apps/server/src/middleware/auth.ts:26-50`
  - If `AUTH_DISABLED=true` or `AUTH_SECRET` is unset, `requireAuth` passes without header.
  - If `AUTH_SECRET` is set, requests require `Authorization: Bearer <jwt_token>`.
  - Benchmark CLI must accept `--token` / `-t` option and pass `Authorization: Bearer <token>` in HTTP headers when provided.

### 1.4 Command-Line Parsing Specifications
- **Node Native Parsing**: Node.js `>=18.3` provides `node:util` `parseArgs`.
- **Supported Arguments & Defaults**:
  | Argument | Short | Type | Default Value | Description |
  |---|---|---|---|---|
  | `--url` | `-u` | string | `http://localhost:4000` | Target base server URL |
  | `--endpoint` | `-e` | string | `/api/geo/choropleth` | Target GeoJSON endpoint path |
  | `--period` | `-p` | string | `2025-08` | Benchmark period query parameter |
  | `--concurrency` | `-c` | string | `10` | Number of concurrent worker streams |
  | `--requests` | `-n` | string | `50` | Total requests per scenario |
  | `--hit-sla` | - | string | `300` | Cache hit p95 SLA threshold (ms) |
  | `--cold-sla` | - | string | `2000` | Cold miss p95 SLA threshold (ms) |
  | `--token` | `-t` | string | `undefined` | Optional Bearer JWT authorization token |
  | `--json` | - | boolean | `false` | Output machine-parseable JSON stdout |
  | `--help` | `-h` | boolean | `false` | Show CLI help message and exit |

### 1.5 Package.json Audit
- Root `package.json:11-22`:
  ```json
  "scripts": {
    "dev": "turbo run dev --no-cache --parallel",
    "dev:web": "pnpm --filter @petakeu/web dev",
    "dev:server": "pnpm --filter @petakeu/server dev",
    "build": "turbo run build",
    "build:web": "pnpm --filter @petakeu/web build",
    "build:server": "pnpm --filter @petakeu/server build",
    "lint": "turbo run lint",
    "typecheck": "turbo run typecheck",
    "test": "turbo run test",
    "test:e2e": "pnpm --filter @petakeu/web test:e2e"
  }
  ```
- Target addition: `"benchmark": "tsx scripts/benchmark-perf.ts"` under `"scripts"`.

---

## 2. Logic Chain

1. **Dual-Scenario Execution Architecture**:
   - **Cache-Hit Scenario**:
     1. Send 1 initial warmup HTTP request to `${url}${endpoint}?period=${period}`. This populates Redis cache key `petakeu:geo:choropleth:2025-08`.
     2. Spawn `concurrency` (default 10) async worker promises pulling from a shared request counter until `requests` (default 50) total requests complete against `${url}${endpoint}?period=${period}`.
   - **Cold-Miss Scenario**:
     1. Spawn `concurrency` (default 10) async worker promises.
     2. For each request index `i` (0 to `requests - 1`), compute a distinct historical period parameter:
        `year = 1970 + Math.floor(i / 12)`, `month = String((i % 12) + 1).padStart(2, '0')` -> `periodParam = "${year}-${month}"` (e.g. `1970-01`, `1970-02`, ...).
     3. Request `${url}${endpoint}?period=${periodParam}`. Because each period parameter is unique and uncached, Redis cache lookup misses every time, forcing PostgreSQL / PostGIS database query execution for 100% of requests in the scenario.

2. **High-Precision Latency Collection & Statistics**:
   - Wrap each `fetch()` call with high-resolution timestamp `performance.now()`.
   - Record response latency (`reqEnd - reqStart`) in milliseconds.
   - Consume response body via `res.arrayBuffer()` to ensure complete network transfer before completing latency timing.
   - Sort latency array in ascending numerical order (`latencies.sort((a, b) => a - b)`).
   - Compute metrics:
     - `minMs`: `latencies[0]`
     - `maxMs`: `latencies[latencies.length - 1]`
     - `avgMs`: `sum(latencies) / length`
     - `p50Ms`: nearest-rank 50th percentile
     - `p95Ms`: nearest-rank 95th percentile
     - `p99Ms`: nearest-rank 99th percentile
     - `requestsPerSec`: `totalRequests / durationSec`

3. **PASS/FAIL Verdict & Process Exit**:
   - Pass condition: `pass = hitResult.p95Ms < hitSlaMs && coldResult.p95Ms < coldSlaMs && hitResult.failedRequests === 0 && coldResult.failedRequests === 0`.
   - Exit code: `process.exit(pass ? 0 : 1)`.

4. **Machine-Parseable JSON vs. Human-Readable ASCII Table**:
   - When `--json` flag is provided: output formatted JSON payload to stdout (suppressing log messages).
   - When `--json` is omitted: print structured ASCII report table to stdout showing side-by-side comparison of Cache-Hit vs Cold-Miss scenarios.

---

## 3. Caveats

- **Running Server Requirement**: The benchmark script executes active HTTP probes against a live server. The target Petakeu backend server must be running (e.g., `pnpm dev:server` on `http://localhost:4000`). If server is unreachable, fetch throws network error, script catches it, prints error, and exits with code `1`.
- **Database Seed Context**: Running cold miss benchmarks against an unseeded database will execute fast (0 records returned). To benchmark realistic PostGIS spatial join performance, `pnpm seed:regions` must be executed beforehand.
- **Authentication**: When testing in an environment where `AUTH_DISABLED=false` and `AUTH_SECRET` is defined, the `--token <jwt>` option must be supplied to avoid 401 Unauthorized responses.

---

## 4. Conclusion & Implementation Blueprint

### 4.1 Root `package.json` Edit

In `/home/noah/project/petakeu/package.json`, add `"benchmark": "tsx scripts/benchmark-perf.ts"` under `"scripts"`:

```json
{
  "name": "petakeu-monorepo",
  "private": true,
  "version": "0.1.0",
  "scripts": {
    "dev": "turbo run dev --no-cache --parallel",
    "dev:web": "pnpm --filter @petakeu/web dev",
    "dev:server": "pnpm --filter @petakeu/server dev",
    "build": "turbo run build",
    "build:web": "pnpm --filter @petakeu/web build",
    "build:server": "pnpm --filter @petakeu/server build",
    "lint": "turbo run lint",
    "typecheck": "turbo run typecheck",
    "test": "turbo run test",
    "test:e2e": "pnpm --filter @petakeu/web test:e2e",
    "benchmark": "tsx scripts/benchmark-perf.ts"
  }
}
```

---

### 4.2 Complete TypeScript Implementation Blueprint (`scripts/benchmark-perf.ts`)

File location: `/home/noah/project/petakeu/scripts/benchmark-perf.ts`

```typescript
import { parseArgs } from 'node:util';
import { performance } from 'node:perf_hooks';

/**
 * Benchmark Configuration parsed from CLI flags
 */
export interface BenchmarkConfig {
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

/**
 * Metric results for a single benchmark scenario
 */
export interface ScenarioResult {
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
  slaTargetMs: number;
  pass: boolean;
}

/**
 * Full structured report output for JSON serialization or ASCII summary
 */
export interface BenchmarkReport {
  timestamp: string;
  config: BenchmarkConfig;
  results: {
    cacheHit: ScenarioResult;
    coldMiss: ScenarioResult;
  };
  overallPass: boolean;
}

/**
 * Parse CLI arguments using native Node.js util.parseArgs
 */
export function parseCliArgs(): BenchmarkConfig {
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
Petakeu Performance Benchmarking Utility

Usage:
  pnpm benchmark [options]
  npx tsx scripts/benchmark-perf.ts [options]

Options:
  -u, --url <url>           Base server URL (default: http://localhost:4000)
  -e, --endpoint <path>     Choropleth endpoint path (default: /api/geo/choropleth)
  -p, --period <YYYY-MM>    Target period for cache-hit test (default: 2025-08)
  -c, --concurrency <num>   Number of parallel worker connections (default: 10)
  -n, --requests <num>      Total requests per scenario (default: 50)
  --hit-sla <ms>            Cache-hit p95 SLA threshold in ms (default: 300)
  --cold-sla <ms>           Cold-miss p95 SLA threshold in ms (default: 2000)
  -t, --token <jwt>         Bearer authorization token (optional)
  --json                    Output structured JSON stdout
  -h, --help                Display this help message
`);
    process.exit(0);
  }

  const concurrency = parseInt(values.concurrency as string, 10);
  const requests = parseInt(values.requests as string, 10);
  const hitSlaMs = parseInt(values['hit-sla'] as string, 10);
  const coldSlaMs = parseInt(values['cold-sla'] as string, 10);

  if (isNaN(concurrency) || concurrency <= 0) {
    console.error('Error: --concurrency must be a positive integer');
    process.exit(1);
  }
  if (isNaN(requests) || requests <= 0) {
    console.error('Error: --requests must be a positive integer');
    process.exit(1);
  }

  return {
    baseUrl: (values.url as string).replace(/\/+$/, ''),
    endpoint: values.endpoint as string,
    period: values.period as string,
    concurrency,
    requests,
    hitSlaMs,
    coldSlaMs,
    json: Boolean(values.json),
    token: values.token as string | undefined,
  };
}

/**
 * Execute benchmark scenario (Cache-hit or Cold-miss)
 */
export async function runScenario(
  config: BenchmarkConfig,
  isColdScenario: boolean
): Promise<ScenarioResult> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (config.token) {
    headers['Authorization'] = `Bearer ${config.token}`;
  }

  const targetSlaMs = isColdScenario ? config.coldSlaMs : config.hitSlaMs;

  // Cache-hit scenario: send 1 warmup request to ensure Redis key is cached
  if (!isColdScenario) {
    const warmupUrl = `${config.baseUrl}${config.endpoint}?period=${config.period}`;
    try {
      const res = await fetch(warmupUrl, { headers });
      if (res.ok) {
        await res.arrayBuffer();
      }
    } catch (_err) {
      // Warmup errors will be captured in worker loop
    }
  }

  const latenciesMs: number[] = [];
  let successfulRequests = 0;
  let failedRequests = 0;
  let reqCounter = 0;

  const startTime = performance.now();

  const worker = async () => {
    while (true) {
      const currentIdx = reqCounter++;
      if (currentIdx >= config.requests) break;

      // Cold miss: use distinct non-cached period parameters (1970-01, 1970-02...)
      // Cache hit: use fixed period parameter (e.g. 2025-08)
      let periodParam: string;
      if (isColdScenario) {
        const year = 1970 + Math.floor(currentIdx / 12);
        const month = String((currentIdx % 12) + 1).padStart(2, '0');
        periodParam = `${year}-${month}`;
      } else {
        periodParam = config.period;
      }

      const targetUrl = `${config.baseUrl}${config.endpoint}?period=${periodParam}`;

      const reqStart = performance.now();
      try {
        const res = await fetch(targetUrl, { headers });
        const reqEnd = performance.now();
        if (res.ok) {
          await res.arrayBuffer();
          latenciesMs.push(reqEnd - reqStart);
          successfulRequests++;
        } else {
          failedRequests++;
        }
      } catch (_err) {
        failedRequests++;
      }
    }
  };

  const workers = Array.from({ length: config.concurrency }, () => worker());
  await Promise.all(workers);

  const endTime = performance.now();
  const durationSec = (endTime - startTime) / 1000;

  latenciesMs.sort((a, b) => a - b);

  const computePercentile = (p: number): number => {
    if (latenciesMs.length === 0) return 0;
    const idx = Math.ceil((p / 100) * latenciesMs.length) - 1;
    const clamped = Math.max(0, Math.min(idx, latenciesMs.length - 1));
    return latenciesMs[clamped];
  };

  const minMs = latenciesMs.length > 0 ? latenciesMs[0] : 0;
  const maxMs = latenciesMs.length > 0 ? latenciesMs[latenciesMs.length - 1] : 0;
  const avgMs = latenciesMs.length > 0
    ? latenciesMs.reduce((sum, val) => sum + val, 0) / latenciesMs.length
    : 0;
  const p50Ms = computePercentile(50);
  const p95Ms = computePercentile(95);
  const p99Ms = computePercentile(99);
  const requestsPerSec = durationSec > 0 ? config.requests / durationSec : 0;

  const pass = failedRequests === 0 && p95Ms < targetSlaMs;

  return {
    totalRequests: config.requests,
    successfulRequests,
    failedRequests,
    durationSec,
    requestsPerSec,
    minMs,
    avgMs,
    p50Ms,
    p95Ms,
    p99Ms,
    maxMs,
    slaTargetMs: targetSlaMs,
    pass,
  };
}

/**
 * Format and print human-readable ASCII summary table
 */
export function printAsciiReport(report: BenchmarkReport): void {
  const { config, results, overallPass } = report;
  const { cacheHit, coldMiss } = results;

  const fmtMs = (val: number) => `${val.toFixed(2)} ms`;
  const fmtSec = (val: number) => `${val.toFixed(2)} s`;
  const fmtRps = (val: number) => `${val.toFixed(2)} req/s`;

  console.log('\n' + '='.repeat(80));
  console.log('                   PETAKEU PERFORMANCE BENCHMARK REPORT                   ');
  console.log('='.repeat(80));
  console.log(`Target URL   : ${config.baseUrl}${config.endpoint}`);
  console.log(`Period       : ${config.period}`);
  console.log(`Concurrency  : ${config.concurrency} workers | Total Requests: ${config.requests} per scenario`);
  console.log(`Timestamp    : ${report.timestamp}`);
  console.log('-'.repeat(80));

  const header = `Metric`.padEnd(28) + `Cache-Hit Scenario`.padEnd(26) + `Cold-Miss Scenario`.padEnd(26);
  console.log(header);
  console.log('-'.repeat(80));

  const rows: [string, string, string][] = [
    ['Total Requests', String(cacheHit.totalRequests), String(coldMiss.totalRequests)],
    ['Successful Requests', String(cacheHit.successfulRequests), String(coldMiss.successfulRequests)],
    ['Failed Requests', String(cacheHit.failedRequests), String(coldMiss.failedRequests)],
    ['Duration (sec)', fmtSec(cacheHit.durationSec), fmtSec(coldMiss.durationSec)],
    ['Throughput (req/sec)', fmtRps(cacheHit.requestsPerSec), fmtRps(coldMiss.requestsPerSec)],
    ['Min Latency (ms)', fmtMs(cacheHit.minMs), fmtMs(coldMiss.minMs)],
    ['Avg Latency (ms)', fmtMs(cacheHit.avgMs), fmtMs(coldMiss.avgMs)],
    ['p50 Latency (ms)', fmtMs(cacheHit.p50Ms), fmtMs(coldMiss.p50Ms)],
    ['p95 Latency (ms)', fmtMs(cacheHit.p95Ms), fmtMs(coldMiss.p95Ms)],
    ['p99 Latency (ms)', fmtMs(cacheHit.p99Ms), fmtMs(coldMiss.p99Ms)],
    ['Max Latency (ms)', fmtMs(cacheHit.maxMs), fmtMs(coldMiss.maxMs)],
    ['SLA Target (p95)', `< ${cacheHit.slaTargetMs} ms`, `< ${coldMiss.slaTargetMs} ms`],
    ['Scenario Verdict', cacheHit.pass ? '[ PASS ]' : '[ FAIL ]', coldMiss.pass ? '[ PASS ]' : '[ FAIL ]'],
  ];

  for (const [metric, hit, cold] of rows) {
    console.log(metric.padEnd(28) + hit.padEnd(26) + cold.padEnd(26));
  }

  console.log('='.repeat(80));
  const overallStr = overallPass
    ? '[ PASS ] All SLA criteria satisfied'
    : '[ FAIL ] SLA target exceeded or requests failed';
  console.log(`OVERALL BENCHMARK VERDICT:  ${overallStr}`);
  console.log('='.repeat(80) + '\n');
}

/**
 * Script entry point
 */
async function main(): Promise<void> {
  const config = parseCliArgs();

  if (!config.json) {
    console.log(`Starting Petakeu Performance Benchmark...`);
    console.log(`Target: ${config.baseUrl}${config.endpoint}`);
  }

  try {
    const cacheHit = await runScenario(config, false);
    const coldMiss = await runScenario(config, true);

    const overallPass = cacheHit.pass && coldMiss.pass;

    const report: BenchmarkReport = {
      timestamp: new Date().toISOString(),
      config,
      results: {
        cacheHit,
        coldMiss,
      },
      overallPass,
    };

    if (config.json) {
      process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    } else {
      printAsciiReport(report);
    }

    process.exit(overallPass ? 0 : 1);
  } catch (err) {
    if (config.json) {
      process.stdout.write(
        JSON.stringify(
          { error: err instanceof Error ? err.message : String(err), overallPass: false },
          null,
          2
        ) + '\n'
      );
    } else {
      console.error(`Benchmark execution failed:`, err);
    }
    process.exit(1);
  }
}

// Execute main if run as primary module
if (require.main === module) {
  main();
}
```

---

## 5. Verification Method

To independently verify the benchmark script after implementation:

1. **CLI Help Flag Check**:
   ```bash
   pnpm benchmark --help
   # or
   npx tsx scripts/benchmark-perf.ts -h
   ```
   *Expected output*: Prints usage instructions and list of options, then exits 0.

2. **Standard Execution (Human Readable Output)**:
   ```bash
   # Ensure backend server is running in dev mode first
   pnpm dev:server

   # Run benchmark script against local server
   pnpm benchmark
   ```
   *Expected output*: ASCII summary table displaying metrics for Cache-Hit and Cold-Miss scenarios, SLA targets (< 300 ms for hit, < 2000 ms for cold), and overall verdict `[ PASS ]` or `[ FAIL ]`.

3. **JSON Output Check (CI Machine Parseable)**:
   ```bash
   npx tsx scripts/benchmark-perf.ts --url http://localhost:4000 --json
   ```
   *Expected output*: Valid JSON string output containing `results.cacheHit.p95Ms`, `results.coldMiss.p95Ms`, and `overallPass: true/false`.

4. **Custom Concurrency & SLA Overrides**:
   ```bash
   npx tsx scripts/benchmark-perf.ts --concurrency 20 --requests 100 --hit-sla 200 --cold-sla 1500
   ```

5. **Typecheck & Lint Validation**:
   ```bash
   pnpm typecheck
   pnpm lint
   ```
   *Expected output*: Both commands pass with 0 errors.
