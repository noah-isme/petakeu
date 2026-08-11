/* eslint-disable import/no-unresolved, import/namespace, import/no-duplicates */
import { parseArgs } from 'util';
import { performance } from 'perf_hooks';

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
    while (reqCounter < config.requests) {
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
  const avgMs =
    latenciesMs.length > 0
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
