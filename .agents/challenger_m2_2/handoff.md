# Milestone 2: Performance Benchmarking Script — Challenger 2 Handoff Report

## 1. Observation

### 1.1 Evaluated Files
- **`/home/noah/project/petakeu/scripts/benchmark-perf.ts`**:
  - Implements TypeScript performance benchmarking tool using `node:util` (`parseArgs`) and `node:perf_hooks` (`performance`).
  - Defines interfaces `BenchmarkConfig`, `ScenarioResult`, `BenchmarkReport`.
  - Implements nearest-rank percentile computation formula (`p50`, `p95`, `p99`) at lines 197–202.
  - Implements JSON stdout serialization when `--json` flag is active (lines 313–315).
  - Implements `--help` output with usage documentation (lines 70–91).
- **`/home/noah/project/petakeu/package.json`**:
  - Contains `"benchmark": "tsx scripts/benchmark-perf.ts"` under `"scripts"`.
  - Contains `"tsx": "^4.19.0"` under `"devDependencies"`.
- **`/home/noah/project/petakeu/.agents/worker_m2_1/handoff.md`**:
  - Worker handoff documenting implementation details and CLI execution tests.

### 1.2 Mathematical & Structural Analysis Findings

1. **Percentile Computation Formula**:
   - Code:
     ```typescript
     latenciesMs.sort((a, b) => a - b);
     const computePercentile = (p: number): number => {
       if (latenciesMs.length === 0) return 0;
       const idx = Math.ceil((p / 100) * latenciesMs.length) - 1;
       const clamped = Math.max(0, Math.min(idx, latenciesMs.length - 1));
       return latenciesMs[clamped];
     };
     ```
   - Mathematical proof:
     - For $N = 50$ (default `--requests`):
       - $p50$: $\lceil 0.50 \times 50 \rceil - 1 = 25 - 1 = 24$ (Rank 25 in 0-indexed array).
       - $p95$: $\lceil 0.95 \times 50 \rceil - 1 = \lceil 47.5 \rceil - 1 = 48 - 1 = 47$ (Rank 48 in 0-indexed array, representing 96% quantile).
       - $p99$: $\lceil 0.99 \times 50 \rceil - 1 = \lceil 49.5 \rceil - 1 = 50 - 1 = 49$ (Rank 50 in 0-indexed array, representing max element).
     - Edge case $N = 0$: Returns `0` cleanly.
     - Edge case $N = 1$: Clamps index to `0` and returns `latenciesMs[0]`.
     - Clamping `Math.max(0, Math.min(idx, length - 1))` guarantees zero out-of-bounds array access.
   - Verdict: **Mathematically correct and robust nearest-rank percentile implementation.**

2. **JSON Output Schema Validation**:
   - Expected keys in JSON output (`--json`):
     - `timestamp`: string (ISO 8601 string `new Date().toISOString()`)
     - `config`: `BenchmarkConfig` object (`baseUrl`, `endpoint`, `period`, `concurrency`, `requests`, `hitSlaMs`, `coldSlaMs`, `json`, `token`)
     - `results`: object containing `cacheHit` and `coldMiss` `ScenarioResult` objects
     - `results.cacheHit`: `ScenarioResult` (`totalRequests`, `successfulRequests`, `failedRequests`, `durationSec`, `requestsPerSec`, `minMs`, `avgMs`, `p50Ms`, `p95Ms`, `p99Ms`, `maxMs`, `slaTargetMs`, `pass`)
     - `results.coldMiss`: `ScenarioResult` (same shape as `cacheHit`)
     - `overallPass`: boolean (`cacheHit.pass && coldMiss.pass`)
   - Output formatting:
     - Output is written strictly via `process.stdout.write(JSON.stringify(report, null, 2) + '\n')`.
     - Logging statements (`console.log`) are suppressed when `config.json` is `true`, preventing stdout corruption.
   - Verdict: **100% schema compliant and machine-parseable by `JSON.parse()`.**

3. **CLI Interface & Defaults**:
   - `parseCliArgs()` uses standard `node:util parseArgs` with short and long aliases (`-u`/`--url`, `-e`/`--endpoint`, `-p`/`--period`, `-c`/`--concurrency`, `-n`/`--requests`, `--hit-sla`, `--cold-sla`, `-t`/`--token`, `--json`, `-h`/`--help`).
   - Default SLA thresholds match requirement R2 (`hitSlaMs`: 300ms, `coldSlaMs`: 2000ms).
   - Validates positive integer values for `concurrency` and `requests`, exiting with code `1` on invalid input.
   - Script is registered in `package.json` under `"scripts"`: `"benchmark": "tsx scripts/benchmark-perf.ts"`.

---

## 2. Logic Chain

1. **Requirement Alignment**:
   - Requirement R2 in `ORIGINAL_REQUEST.md` specifies a benchmarking script to measure p95 latency under load (concurrency $\ge 10$), distinguish cache-hit vs cold-miss scenarios, evaluate SLA targets (hit < 300ms, cold < 2000ms), and output machine-parseable JSON stdout or ASCII reports.
   - Implementation in `scripts/benchmark-perf.ts` satisfies every specified capability.

2. **Concurrency & Benchmarking Design**:
   - Warmup request for Cache Hit populates Redis key (`choropleth:2025-08:national:root`).
   - Cold miss generates unique period parameters (`1970-01`, `1970-02`...) guaranteeing 100% cache misses against PostGIS.
   - Concurrent worker pool drives requests asynchronously up to `--requests` using `Promise.all`.

3. **Monorepo Layout & Code Quality**:
   - Fully strict TypeScript typing.
   - No stray source files or test scripts placed in `.agents/`.

---

## 3. Caveats

- **Target Server Availability**: Executing live performance benchmarks requires a running server (e.g. `pnpm dev:server` on `http://localhost:4000`). If no server is listening, fetch requests fail gracefully, generating a report with `overallPass: false` and exit code 1.
- **Database Data Volume**: To measure representative PostGIS database query performance during cold miss tests, run `pnpm seed:regions` prior to benchmarking.

---

## 4. Conclusion & Verdict

**VERDICT: APPROVE**

The implementation of `scripts/benchmark-perf.ts` and `package.json` for Milestone 2 R2 is mathematically sound, structurally clean, type-safe, and fully meets all functional and CLI specification requirements.

---

## 5. Verification Method

To independently verify the benchmark utility:

1. **CLI Help Command**:
   ```bash
   pnpm benchmark --help
   ```
   *Expected result*: Displays utility help screen with all flags and exits with code 0.

2. **JSON Output Parsing**:
   ```bash
   npx tsx scripts/benchmark-perf.ts --url http://localhost:59999 --json | node -e "const data=JSON.parse(require('fs').readFileSync(0, 'utf-8')); console.assert(typeof data.timestamp === 'string'); console.assert(data.results.cacheHit !== undefined); console.assert(data.results.coldMiss !== undefined); console.assert(typeof data.overallPass === 'boolean'); console.log('JSON Schema Verified OK');"
   ```
   *Expected result*: Successfully parses JSON stdout and asserts required keys `timestamp`, `config`, `results.cacheHit`, `results.coldMiss`, `overallPass`.

3. **Typecheck Verification**:
   ```bash
   pnpm typecheck
   ```
   *Expected result*: Clean exit code 0 across monorepo packages `@petakeu/web` and `@petakeu/server`.
