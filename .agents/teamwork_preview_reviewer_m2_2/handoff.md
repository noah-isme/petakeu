# Handoff Report — Milestone M2 Health & Server Audit

**Reviewer**: `teamwork_preview_reviewer_m2_2`  
**Working Directory**: `/home/noah/project/petakeu/.agents/teamwork_preview_reviewer_m2_2`  
**Date**: 2026-08-11T01:02:00Z  
**Verdict**: **REQUEST_CHANGES**

---

## 1. Observation

Direct observations from source inspection, TypeScript typecheck, and Vitest test suite execution:

1. **Target Source Files Inspected**:
   - `apps/server/src/utils/health.ts` (193 lines)
   - `apps/server/src/server.ts` (95 lines)
   - `apps/server/src/utils/health.test.ts` (289 lines)

2. **TypeScript Type Safety**:
   - Executed: `pnpm --filter @petakeu/server typecheck`
   - Command Output: `tsc --noEmit -p tsconfig.json` exited with **code 0** (0 type errors).

3. **Unit & Integration Test Execution**:
   - Executed: `pnpm --filter @petakeu/server test`
   - `src/utils/health.test.ts` passed **22 / 22 test cases** (1.12s duration).
   - Entire workspace test command failed with **exit status 1**:
     - `src/services/geo-service.test.ts` failed 2 tests due to timeouts: `returns quantile legend with ranges...` (5250ms) and `omits raw values when public mode is enabled` (5004ms).

4. **Async Health Probes Implementation (`apps/server/src/utils/health.ts`)**:
   - `checkDatabase()` (lines 23–43): executes `pool.query('SELECT 1 AS alive, PostGIS_Version() AS postgis_version')`.
   - `checkRedis()` (lines 45–63): executes `redis.ping()`.
   - `checkStorage()` (lines 65–95): executes `checkStorageHealth()`.
   - `checkQueue()` (lines 97–134): executes `Promise.all([uploadQ.getJobCounts(...), reportQ.getJobCounts(...)])`.
   - `performHealthChecks()` (lines 136–162): executes probes sequentially (`await checkDatabase()`, `await checkRedis()`, `await checkStorage()`, `await checkQueue()`).

5. **Lack of Timeout Safeguards**:
   - None of the probe functions (`checkDatabase`, `checkRedis`, `checkStorage`, `checkQueue`) implement a timeout wrapper (e.g. `AbortSignal` or `Promise.race` with a threshold).

6. **Unused Parameter**:
   - `performHealthChecks(env?: EnvConfig)` (line 136) and `performReadinessChecks(env?: EnvConfig)` (line 170) define an optional `env` parameter that is unreferenced in the body of either function.

---

## 2. Logic Chain

1. **Verification of Claims vs Implementation**:
   - *Observation*: `health.ts` defines four probes (DB, Redis, Storage, Queue), status aggregation, and Express routes in `server.ts`.
   - *Logic*: The probe implementations catch internal thrown exceptions and map them to `unhealthy` (for DB, Redis) or `degraded` (for Storage, Queue), preventing unhandled promise rejections or process crashes during routine failure modes.

2. **Sequential Execution & Missing Timeout Vulnerability**:
   - *Observation*: In `performHealthChecks`, probes are invoked serially with `await`. None of the individual probes enclose network calls in a timeout context.
   - *Logic*: If PostgreSQL, Redis, MinIO, or Redis Queue connections experience socket hangs, network stalls, or firewall drops, `performHealthChecks` will hang indefinitely. Because Express handlers for `/health`, `/healthz`, and `/ready` await `performHealthChecks`, any hanging probe will cause HTTP request timeouts on the server endpoints.

3. **Status Aggregation and Readiness Coupling**:
   - *Observation*: `performHealthChecks` returns `degraded` if Storage or Queue fails, but `performReadinessChecks` evaluates `ready = health.status !== 'unhealthy'`.
   - *Logic*: When MinIO or BullMQ queue is down/degraded, `/ready` returns HTTP 200 with `ready: true`. In Kubernetes or cloud orchestrators, this prevents container restart or traffic removal when storage is degraded, which is desirable for read operations. However, write operations dependent on storage will fail.

4. **Test Suite Status**:
   - *Observation*: `src/utils/health.test.ts` provides comprehensive unit and integration test coverage (22/22 passing). However, `pnpm --filter @petakeu/server test` fails globally due to timeouts in `geo-service.test.ts`.
   - *Logic*: Continuous Integration (CI) criteria require that the server package test suite passes cleanly without failures.

---

## 3. Caveats

- Database and Redis connection pools/clients are mocked in `health.test.ts`. Live socket timeout behavior was analyzed via static code inspection rather than network fault injection.
- Unrelated test failures in `geo-service.test.ts` were observed during package-level `pnpm --filter @petakeu/server test` execution and must be resolved for clean CI passing.

---

## 4. Conclusion & Findings

### Verdict: **REQUEST_CHANGES**

While `src/utils/health.test.ts` provides good test coverage for the health module and TypeScript compilation passes without errors, changes are requested to address async timeout vulnerabilities, sequential probe execution, and package test suite failures.

### Findings List

#### 1. [Major] Missing Timeouts on Async Network Probes
- **Where**: `apps/server/src/utils/health.ts` (lines 23–134)
- **Why**: Database queries (`SELECT 1`), Redis PINGs, MinIO bucket lists, and BullMQ job count requests do not enforce a max timeout. Network hangs will freeze Express `/health`, `/healthz`, and `/ready` request handlers.
- **Suggestion**: Wrap each probe operation in a timeout helper (e.g. `Promise.race` with a 3–5 second timeout) to guarantee probe resolution.

#### 2. [Major] Package Test Suite Failure (`pnpm --filter @petakeu/server test`)
- **Where**: `apps/server/src/services/geo-service.test.ts`
- **Why**: Running `pnpm --filter @petakeu/server test` exits with code 1 due to 2 timing out test cases in `geo-service.test.ts`.
- **Suggestion**: Fix test timeout issues in `geo-service.test.ts` so the server workspace test suite passes cleanly.

#### 3. [Moderate] Sequential Probe Execution Bottleneck
- **Where**: `apps/server/src/utils/health.ts` (lines 139–142)
- **Why**: Probes for DB, Redis, Storage, and Queue are executed serially (`await` line-by-line). Latency accumulates across probes ($t_1 + t_2 + t_3 + t_4$).
- **Suggestion**: Use `Promise.allSettled([checkDatabase(), checkRedis(), checkStorage(), checkQueue()])` to execute probes concurrently and isolate probe latencies.

#### 4. [Minor] Unused `env` Parameter in Health Functions
- **Where**: `apps/server/src/utils/health.ts` (lines 136, 170)
- **Why**: `performHealthChecks(env?: EnvConfig)` and `performReadinessChecks(env?: EnvConfig)` accept `env` but do not use it.
- **Suggestion**: Either utilize `env` (e.g., to configure probe timeouts) or remove the unused parameter.

---

## Verified Claims

- TypeScript compilation (`pnpm --filter @petakeu/server typecheck`) → verified via `tsc --noEmit` → **PASS** (0 errors)
- Health module unit & integration tests (`vitest run src/utils/health.test.ts`) → verified via `vitest` → **PASS** (22/22 passed)
- Full server test suite (`pnpm --filter @petakeu/server test`) → verified via `vitest` → **FAIL** (2 failed in geo-service)
- Probe exception isolation (catching thrown errors inside probes) → verified via code inspection & test suite → **PASS**

---

## 5. Verification Method

To independently verify this evaluation:

1. **TypeScript Typecheck**:
   ```bash
   pnpm --filter @petakeu/server typecheck
   ```
   *Expected result*: Exits with code 0.

2. **Health Unit Tests**:
   ```bash
   pnpm --filter @petakeu/server test src/utils/health.test.ts
   ```
   *Expected result*: 22 tests pass in `src/utils/health.test.ts`.

3. **Full Server Test Suite**:
   ```bash
   pnpm --filter @petakeu/server test
   ```
   *Invalidation condition*: Exits with non-zero code due to test timeouts in `geo-service.test.ts`.
