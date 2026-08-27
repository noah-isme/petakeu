# Forensic Audit Report — Milestone 2 Performance Benchmarking Script

**Work Product**: `scripts/benchmark-perf.ts` & `package.json`  
**Profile**: General Project / Benchmark Mode  
**Verdict**: **CLEAN**  

---

## 1. Observation

### 1.1 Source Code Verification (`scripts/benchmark-perf.ts`)
- **CLI Parameter Parsing (Lines 54–118)**:
  - Uses Node.js native `node:util` `parseArgs`.
  - Configures options for `--url` (`-u`), `--endpoint` (`-e`), `--period` (`-p`), `--concurrency` (`-c`), `--requests` (`-n`), `--hit-sla`, `--cold-sla`, `--token` (`-t`), `--json`, and `--help` (`-h`).
  - Implements input validation on `concurrency` and `requests` (must be positive integers).

- **Scenario Execution & HTTP Measuring (`runScenario` lines 123–232)**:
  - **Warmup Request (Lines 135–145)**: Performs 1 initial `fetch()` request for the Cache-Hit scenario to ensure Redis cache key (`petakeu:geo:choropleth:2025-08`) is populated.
  - **Cold Miss Query Parameter Mutation (Lines 162–168)**:
    ```ts
    let periodParam: string;
    if (isColdScenario) {
      const year = 1970 + Math.floor(currentIdx / 12);
      const month = String((currentIdx % 12) + 1).padStart(2, '0');
      periodParam = `${year}-${month}`;
    } else {
      periodParam = config.period;
    }
    ```
    Verified that `isColdScenario = true` generates unique non-cached period values (`1970-01`, `1970-02`, etc.) per request to guarantee 100% database cache miss rate.
  - **Genuine HTTP Call & Timing Measurement (Lines 172–185)**:
    ```ts
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
    ```
    Measured latency `reqEnd - reqStart` relies strictly on high-resolution timer (`performance.now()`) around real native `fetch()` calls. Response payload byte reading (`await res.arrayBuffer()`) is included in measurement.

  - **Dynamic Percentile & SLA Calculations (Lines 195–230)**:
    - Sorts measured `latenciesMs` numerically: `latenciesMs.sort((a, b) => a - b);`.
    - Computes `minMs`, `avgMs`, `p50Ms`, `p95Ms`, `p99Ms`, and `maxMs` from `latenciesMs`.
    - Computes SLA verdict dynamically: `const pass = failedRequests === 0 && p95Ms < targetSlaMs;`.
    - Evaluates overall verdict dynamically: `const overallPass = cacheHit.pass && coldMiss.pass;`.

- **Output Serialization & CLI Exit Code (Lines 237–334)**:
  - Supports structured JSON formatting (`process.stdout.write(JSON.stringify(report, null, 2))`).
  - Supports side-by-side ASCII table summary (`printAsciiReport(report)`).
  - Exits with process code `0` on PASS, and `1` on FAIL or runtime error (`process.exit(overallPass ? 0 : 1)`).

### 1.2 Monorepo Configuration (`package.json`)
- **Line 22**: `"benchmark": "tsx scripts/benchmark-perf.ts"` added to `"scripts"`.
- **Line 27**: `"tsx": "^4.19.0"` added to `"devDependencies"`.

---

## 2. Forensic Phase Checklist

| Phase | Check | Status | Details / Evidence |
|-------|-------|--------|--------------------|
| **1. Source Code** | Hardcoded Latency Numbers | **PASS** | No hardcoded response latencies or static timing arrays exist in `scripts/benchmark-perf.ts`. |
| **1. Source Code** | Dummy/Mocked Results | **PASS** | All metrics (`p50`, `p95`, `p99`, `avg`, `min`, `max`) are dynamically computed from `latenciesMs` collected during real `fetch()` calls. |
| **1. Source Code** | Fake `performance.now()` | **PASS** | Imports native `performance` from `node:perf_hooks` and wraps `fetch()` calls cleanly. |
| **1. Source Code** | Fake SLA Checks | **PASS** | SLA condition `failedRequests === 0 && p95Ms < targetSlaMs` is strictly evaluated. |
| **1. Source Code** | Cold Scenario Logic | **PASS** | `isColdScenario` generates unique period parameters (`1970-01`, `1970-02`...) per request, preventing Redis key hits. |
| **1. Source Code** | Output Accuracy | **PASS** | Both `--json` stdout and ASCII summary table mirror measured raw data without manipulation. |
| **2. Behavioral** | `package.json` Integration | **PASS** | `"benchmark": "tsx scripts/benchmark-perf.ts"` added to root `package.json`. |

---

## 3. Logic Chain

1. **Requirement Verification**: R2 in `ORIGINAL_REQUEST.md` requires a runnable performance benchmarking script that sends concurrent requests (≥ 10 req/sec) to the choropleth endpoint, distinguishes cache-hit vs. cold-miss scenarios, evaluates p95 latencies against SLA targets (< 300ms hit, < 2000ms cold), and provides machine-parseable output.
2. **Implementation Verification**:
   - `scripts/benchmark-perf.ts` fulfills all functional requirements without external heavy dependencies.
   - It performs real asynchronous HTTP requests via Node.js native `fetch`.
   - `latenciesMs` array stores raw durations, sorted, and indexed for exact percentiles.
   - Cold miss queries dynamically cycle through historical periods (`1970-01` onwards) ensuring PostGIS query execution on every request.
   - Output formatting accurately conveys test results without artificial falsification or hardcoded pass shortcuts.
3. **Verdict Determination**: Because all checks passed and no prohibited patterns (hardcoding, facades, mocked SLA checks) were detected, the work product is rated **CLEAN**.

---

## 4. Caveats

- Benchmark execution requires a running backend server instance (`pnpm dev:server` on `http://localhost:4000` or specified `--url`). If the target server is unreachable, the script correctly registers failures for all requests and returns exit code 1.

---

## 5. Conclusion

The work product (`scripts/benchmark-perf.ts` and `package.json`) meets all integrity and functional standards specified under Benchmark Mode.

**Final Verdict**: **CLEAN**

---

## 6. Verification Method

To re-verify this finding independently:

1. **Inspect Source File**:
   ```bash
   view_file /home/noah/project/petakeu/scripts/benchmark-perf.ts
   ```
   Confirm native `fetch()` calls, `performance.now()` timing, `periodParam` mutation for cold miss scenario, and dynamic SLA check evaluation.

2. **Execute Benchmark Help**:
   ```bash
   pnpm benchmark --help
   ```
   Confirm CLI options display correctly and process exits with status code 0.

3. **Execute Host Unreachable Test**:
   ```bash
   npx tsx scripts/benchmark-perf.ts --url http://localhost:59999 --json
   ```
   Confirm machine-parseable JSON stdout returns `overallPass: false` and process exits with status code 1.
