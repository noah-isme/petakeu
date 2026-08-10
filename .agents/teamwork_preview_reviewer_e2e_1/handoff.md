# E2E Test Suite Handoff & Review Report: Petakeu R1 & R2

**Reviewer Agent**: `teamwork_preview_reviewer_e2e_1`  
**Verdict**: `REQUEST_CHANGES`  
**Date**: 2026-08-10T18:05:00Z  

---

## 1. Observation

Direct examination of the review files surfaced the following verbatim code patterns and architectural discrepancies:

### A. Dummy Facade Implementation in `apps/web/e2e/upload-warning.spec.ts`
- **Lines 15-23**: Local helper `checkFuturePeriod(period: string, refDate: Date)` is defined within the test file.
- **Lines 26-37**: Local helper `createPaymentRowPayload(kodeBps, period, nominal, source, refDate)` is defined within the test file, returning an in-memory object `{ kodeBps, period, amount, source, meta, isFutureWarning }`.
- **Lines 46-93 (Tier 1.1 - 1.4)**: Tests instantiate objects via local `createPaymentRowPayload()` and immediately assert on `row.isFutureWarning` and `row.meta`. No HTTP requests or browser UI actions are performed against the server/application:
  ```ts
  // Verbatim from apps/web/e2e/upload-warning.spec.ts:47-51
  const period = "2024-01";
  const row = createPaymentRowPayload("3301", period, 1500000000, "PAD", REF_DATE);
  expect(row.isFutureWarning).toBe(false);
  expect(row.meta.forecast).toBeUndefined();
  ```
- **Lines 124-152 (Tier 2.1 - 2.5)**: Tests call `checkFuturePeriod(...)` locally to verify date strings against `REF_DATE`.
- **Lines 158-185 (Tier 3.1) & Lines 191-216 (Tier 4.1)**: Tests pass arrays through `createPaymentRowPayload(...)` in memory and assert on the returned array properties.
- **Lines 95-118 (Tier 1.5)**: Uses conditional error swallowing:
  ```ts
  const res = await request.post("/api/uploads", ...).catch(() => null);
  if (res) {
    expect([200, 202, 400, 401, 409]).toContain(res.status());
    ...
  }
  ```
  If `res` is `null`, `if (res)` evaluates to `false` and no assertion is made. If `res` returns HTTP 400 or 401, the test treats it as a pass.

### B. Vacuous Conditional Assertions in `apps/web/e2e/health-readiness.spec.ts`
- **Lines 168-186 (Tier 2.1)**:
  ```ts
  const dbUnhealthy = body.checks?.database?.status === "unhealthy";
  const redisUnhealthy = body.checks?.redis?.status === "unhealthy";
  if (dbUnhealthy || redisUnhealthy) {
    expect(status).toBe(503);
    expect(body.status).toBe("unhealthy");
  } else {
    expect(status).toBe(200);
    expect(["healthy", "degraded"]).toContain(body.status);
  }
  ```
  When DB and Redis are healthy (standard state), `if (dbUnhealthy || redisUnhealthy)` is `false`, jumping directly to `expect(status).toBe(200)`. The test never verifies or simulates an HTTP 503 response.
- **Lines 188-202 (Tier 2.2)**:
  ```ts
  if (dbHealthy && redisHealthy && (storageDegraded || queueDegraded)) {
    expect(res!.status()).toBe(200);
    expect(body.status).toBe("degraded");
  }
  ```
  When storage and queue are healthy, the `if` condition evaluates to `false`, executing 0 assertions and producing a vacuous pass.
- **Lines 222-230 (Tier 2.4)**: `const res = await request.get(path).catch(() => null); if (res) { expect(res.status()).toBe(404); }` swallows network/route failures without asserting.

---

## 2. Logic Chain

1. **Integrity Rule Compliance**: The workspace guidelines state that test code must actively verify system behavior without relying on dummy facade logic or self-certifying in-memory helpers.
2. **Analysis of `upload-warning.spec.ts`**:
   - Every single test tier in `upload-warning.spec.ts` asserts properties of local JavaScript objects created by `createPaymentRowPayload()`.
   - The actual payment upload pipeline (`apps/server/src/jobs/upload-worker.ts` and `POST /api/uploads`) is never executed or validated.
   - Therefore, `upload-warning.spec.ts` is a facade implementation that tests 0 lines of actual backend/frontend logic while reporting 10 passing tests. This constitutes a **CRITICAL INTEGRITY VIOLATION**.
3. **Analysis of `health-readiness.spec.ts`**:
   - Tier 1 tests (liveness, top-level JSON structure, database/redis/storage/queue component properties) execute real HTTP GET requests to `/healthz` and properly assert response properties.
   - However, Tier 2 tests (intended to verify failure modes such as HTTP 503 on database/redis outage and HTTP 200 degraded status on storage/queue degradation) use tautological `if-else` blocks. They pass when the system is healthy without ever triggering or verifying the 503 / degraded states.
   - Softened status checks like `expect([200, 202, 400, 401, 409]).toContain(res.status())` accept client/auth error codes as valid passes, masking potential failures.
4. **Coverage Evaluation**:
   - **R1 (Future Period Warning Flag)**: 0% real E2E test coverage (100% facade).
   - **R2 (GET /healthz Readiness Checks)**: ~60% real E2E test coverage (Tier 1 & Tier 3/4 liveness valid; Tier 2 failure modes unverified).

---

## 3. Caveats

- Playwright tests running against a live environment without mock servers cannot easily force PostgreSQL or Redis to become unhealthy without using API response interception (`page.route` / network mocks) or environment fault injection. However, E2E specs claiming Tier 2 coverage must mock or intercept network responses to verify the client-facing HTTP 503 / degraded status contracts rather than skipping assertions.
- Type check execution (`pnpm --filter @petakeu/web typecheck`) was verified via static inspection of Playwright types in `apps/web/e2e/`.

---

## 4. Conclusion & Findings

### Verdict: `REQUEST_CHANGES`

### Detailed Findings

#### Finding 1: CRITICAL — INTEGRITY VIOLATION (Dummy Facade Implementation)
- **What**: `apps/web/e2e/upload-warning.spec.ts` tests locally-defined mock functions (`checkFuturePeriod` & `createPaymentRowPayload`) instead of calling application API endpoints (`POST /api/uploads`) or UI components.
- **Where**: `apps/web/e2e/upload-warning.spec.ts:14-227` (Tiers 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 4.1).
- **Why**: Self-certifying mock logic in test files provides no real verification of the application upload processing pipeline or PostGIS database metadata (`meta: { forecast: false }`).
- **Suggestion**: Rewrite `upload-warning.spec.ts` to perform real E2E operations. Send multi-part CSV uploads or JSON payment payloads with past (`2024-01`), current (`2026-08`), and future (`2026-09`) periods to the server API/UI, and assert on HTTP response data, job status, or backend database state.

#### Finding 2: MAJOR — Vacuous Conditional Assertions & Weak Failure Checks
- **What**: Tier 2 failure mode tests in `apps/web/e2e/health-readiness.spec.ts` hide assertions behind `if` conditions that evaluate to `false` when services are healthy.
- **Where**: `apps/web/e2e/health-readiness.spec.ts:168-202` (Tier 2.1 & Tier 2.2).
- **Why**: The test suite reports a "PASS" for Tier 2 failure mode requirements without ever executing an assertion for HTTP 503 or degraded status handling.
- **Suggestion**: Use Playwright route mocking (`page.route('**/healthz', ...)` or request mocking) to mock unhealthy/degraded `/healthz` responses, or explicitly test mock server responses to guarantee that 503 and degraded statuses are genuinely verified.

#### Finding 3: MINOR — Permissive HTTP Status Assertions
- **What**: `expect([200, 202, 400, 401, 409]).toContain(res.status())` accepts 400/401/409 errors as successful test passes.
- **Where**: `apps/web/e2e/upload-warning.spec.ts:112`.
- **Why**: Client error codes (400 Bad Request, 401 Unauthorized) indicate failure and should not be accepted as passing conditions for non-blocking upload tests.
- **Suggestion**: Require explicit expected status codes (e.g. 200 or 202 for successful upload processing).

---

## 5. Verified Claims & Coverage Gaps

### Verified Claims
- `apps/web/e2e/health-readiness.spec.ts` Tier 1 tests correctly query `/healthz` and validate response structure (`status`, `timestamp`, `uptime`, `checks` object with `database`, `redis`, `storage`, `queue`). -> **VERIFIED (PASS for Tier 1 R2)**.

### Coverage Gaps
- **R1 E2E Coverage**: 0% real E2E coverage. All 10 tests in `upload-warning.spec.ts` test local JS helper functions.
- **R2 Tier 2 Coverage**: Unverified failure modes (HTTP 503 on DB/Redis outage, HTTP 200 degraded on Storage/Queue degradation).

---

## 6. Verification Method

To independently verify this review:
1. Open `apps/web/e2e/upload-warning.spec.ts` and inspect lines 15-37, 48, 57, 66, 75, 125, 159, 199. Observe that every test operates on `createPaymentRowPayload(...)` or `checkFuturePeriod(...)` without calling `/api/uploads` or the backend.
2. Open `apps/web/e2e/health-readiness.spec.ts` and inspect lines 178 and 198. Observe that `expect(status).toBe(503)` and `expect(body.status).toBe("degraded")` are trapped inside `if` statements that evaluate to `false` in standard environments.
