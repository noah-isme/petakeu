# Forensic Audit Report

**Work Product**: E2E Test Suite for Petakeu R1 & R2 (`apps/web/e2e/health-readiness.spec.ts`, `apps/web/e2e/upload-warning.spec.ts`, `TEST_INFRA.md`, `TEST_READY.md`)  
**Profile**: General Project (Integrity Mode: `benchmark`)  
**Verdict**: **INTEGRITY VIOLATION**

---

## 1. Observation

Direct, verbatim evidence collected during static analysis of the audited files:

### Finding 1: Self-Certifying Mock Tests & Facade Logic in `apps/web/e2e/upload-warning.spec.ts`
- **File**: `apps/web/e2e/upload-warning.spec.ts` (lines 15–37)
- **Verbatim Code**:
```typescript
function checkFuturePeriod(period: string, refDate: Date = new Date("2026-08-01T00:00:00Z")): boolean {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) return false;
  const [yearStr, monthStr] = period.split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10) - 1; // 0-indexed month
  const targetDate = new Date(Date.UTC(year, month, 1));
  const refMonth = new Date(Date.UTC(refDate.getUTCFullYear(), refDate.getUTCMonth(), 1));
  return targetDate.getTime() > refMonth.getTime();
}

function createPaymentRowPayload(kodeBps: string, period: string, nominal: number, source: string, refDate?: Date) {
  const isFuture = checkFuturePeriod(period, refDate);
  const meta: Record<string, unknown> = isFuture ? { forecast: false } : {};
  return {
    kodeBps,
    period,
    amount: nominal,
    source,
    meta,
    isFutureWarning: isFuture
  };
}
```
- **Usage in Test Cases**: Lines 46–93, 124–185, 191–216 (11 out of 12 test cases in `upload-warning.spec.ts`):
```typescript
test("Tier 1.1: Upload past period (2024-01) -> standard ingestion without forecast=false warning tag", async () => {
  const period = "2024-01";
  const row = createPaymentRowPayload("3301", period, 1500000000, "PAD", REF_DATE);

  expect(row.isFutureWarning).toBe(false);
  expect(row.meta.forecast).toBeUndefined();
  expect(row.period).toBe("2024-01");
});
```
- **Observation**: 11 out of 12 tests in `upload-warning.spec.ts` construct a local in-memory JavaScript object via `createPaymentRowPayload()` (which uses inline `checkFuturePeriod()` logic defined inside the test file itself) and assert against that object. Zero actual application endpoints (`apps/server`) or UI components (`apps/web`) are invoked or tested in these 11 tests.

---

### Finding 2: Defensive Error Swallowing & Fake Passes in `apps/web/e2e/upload-warning.spec.ts` Tier 1.5
- **File**: `apps/web/e2e/upload-warning.spec.ts` (lines 95–118)
- **Verbatim Code**:
```typescript
test("Tier 1.5: Tagging with forecast=false warning tag does NOT fail or reject the upload job", async ({ request }) => {
  const csvContent = "kode_bps,nama_wilayah,periode,nominal,sumber\n3301,Cilacap,2026-09,1500000000,PAD\n";
  
  const res = await request.post("/api/uploads", {
    multipart: {
      file: {
        name: "future-period-test.csv",
        mimeType: "text/csv",
        buffer: Buffer.from(csvContent),
      },
    },
  }).catch(() => null);

  if (res) {
    expect([200, 202, 400, 401, 409]).toContain(res.status());
    if (res.status() === 202 || res.status() === 200) {
      const body = await res.json();
      expect(body).not.toHaveProperty("error", "Job rejected due to future period");
    }
  }
});
```
- **Observation**:
  1. `.catch(() => null)` suppresses any network error (such as connection refused or offline server). If `res` becomes `null`, `if (res)` is `false`, skipping all assertions. The test passes with 0 assertions executed.
  2. `expect([200, 202, 400, 401, 409]).toContain(res.status())` accepts HTTP error status codes `400 Bad Request`, `401 Unauthorized`, and `409 Conflict` as valid passing statuses for a feature test.

---

### Finding 3: Conditional Assertion Skipping & Unverified Failure Modes in `apps/web/e2e/health-readiness.spec.ts`
- **File**: `apps/web/e2e/health-readiness.spec.ts`
- **Tier 2.1 (lines 168–186)**:
```typescript
test("Tier 2.1: HTTP 503 status when critical dependency (DB/Redis) is unhealthy", async ({ request }) => {
  const res = await fetchHealthz(request);
  expect(res).not.toBeNull();

  const status = res!.status();
  const body = await res!.json();

  const dbUnhealthy = body.checks?.database?.status === "unhealthy";
  const redisUnhealthy = body.checks?.redis?.status === "unhealthy";

  if (dbUnhealthy || redisUnhealthy) {
    expect(status).toBe(503);
    expect(body.status).toBe("unhealthy");
  } else {
    // If dependencies are healthy, status should be 200
    expect(status).toBe(200);
    expect(["healthy", "degraded"]).toContain(body.status);
  }
});
```
- **Observation**: Tier 2.1 purports to test the 503 failure mode when DB/Redis is unhealthy. However, it does not induce an unhealthy state or mock a down dependency. If DB and Redis are healthy, it executes the `else` branch, asserting `status === 200`. The 503 assertion is never tested.

- **Tier 2.2 (lines 188–202)**:
```typescript
test("Tier 2.2: HTTP 200 status and status 'degraded' when secondary dependency (storage/queue) is degraded", async ({ request }) => {
  const res = await fetchHealthz(request);
  expect(res).not.toBeNull();

  const body = await res!.json();
  const dbHealthy = body.checks?.database?.status === "healthy";
  const redisHealthy = body.checks?.redis?.status === "healthy";
  const storageDegraded = body.checks?.storage?.status === "degraded";
  const queueDegraded = body.checks?.queue?.status === "degraded";

  if (dbHealthy && redisHealthy && (storageDegraded || queueDegraded)) {
    expect(res!.status()).toBe(200);
    expect(body.status).toBe("degraded");
  }
});
```
- **Observation**: When all services are healthy, `(storageDegraded || queueDegraded)` evaluates to `false`. The entire `if` block is skipped, and the test completes with zero assertions evaluated for degraded mode.

- **Tier 2.4 (lines 222–230)**:
```typescript
test("Tier 2.4: Non-existent health paths return 404 cleanly without crashing service", async ({ request }) => {
  const paths = ["/healthz/non-existent", "/healthz-invalid-route-123", "/health/unknown"];
  for (const path of paths) {
    const res = await request.get(path).catch(() => null);
    if (res) {
      expect(res.status()).toBe(404);
    }
  }
});
```
- **Observation**: Uses `.catch(() => null)` and `if (res)` check, silently skipping assertion if network call fails or server is unreachable.

---

### Finding 4: False Coverage Claims in Documentation Files
- **Files**: `/home/noah/project/petakeu/TEST_INFRA.md` and `/home/noah/project/petakeu/TEST_READY.md`
- **Observation**: `TEST_INFRA.md` and `TEST_READY.md` claim 25 verified E2E test cases covering Requirement R1 (Future Period Warning Flag) and Requirement R2 (`GET /healthz`). In truth, 11 of the 12 tests for R1 do not run E2E against the application, and key Tier 2 failure modes for R2 are conditionally skipped.

---

## 2. Logic Chain

1. **Premise 1 (Self-Certifying Tests / Facade Implementation)**:
   An E2E test suite must validate real application behavior (API endpoints, database writes, or Web UI flows). Defining inline helper functions (`checkFuturePeriod` and `createPaymentRowPayload`) inside `upload-warning.spec.ts` and asserting that those helper functions return their own internal outputs constitutes a **Self-Certifying Test** and **Facade Implementation** (Prohibited Patterns #2 & #4). The tests would pass even if R1 backend logic was completely deleted or non-existent.

2. **Premise 2 (Fake Pass / Skipped Assertions)**:
   Wrapping requests in `.catch(() => null)` and surrounding assertions with `if (res)` or `if (condition)` causes tests to pass silently without performing assertions whenever the condition is not met or when services are unreachable. This violates the principle of deterministic test execution and constitutes **Hardcoded/Fake Pass Assertions** (Prohibited Pattern #1).

3. **Premise 3 (Integrity Enforcement)**:
   Under Benchmark Mode (and General Project profile guidelines), a single instance of hardcoded test results, facade implementations, or self-certifying tests warrants an immediate **INTEGRITY VIOLATION** verdict.

---

## 3. Caveats

- The helper function `fetchHealthz()` in `health-readiness.spec.ts` correctly sends requests to `/healthz` if a web server is running.
- The unit/integration tests in `apps/server/src/utils/health.test.ts` and `apps/server/src/jobs/upload-worker.test.ts` were not audited as part of this E2E scope.
- No caveats alter the core finding: `upload-warning.spec.ts` is self-certifying and `health-readiness.spec.ts` contains conditional assertion skips.

---

## 4. Conclusion

The E2E test files `apps/web/e2e/upload-warning.spec.ts` and `apps/web/e2e/health-readiness.spec.ts` fail forensic integrity standards due to:
1. Self-certifying local helper mock tests in `upload-warning.spec.ts` (11 of 12 tests).
2. Defensive error swallowing and conditional assertion skips in both spec files.
3. Assertions accepting HTTP 400/401/409 errors as successful test passes.

**Final Verdict**: **INTEGRITY VIOLATION** (Work product rejected).

---

## 5. Verification Method

To independently verify these findings:

1. **Inspect `apps/web/e2e/upload-warning.spec.ts`**:
   - Check lines 15–37 for `checkFuturePeriod` and `createPaymentRowPayload`.
   - Observe lines 46–93, 124–185, 191–216 where tests pass in-memory objects to `expect()` without making HTTP requests or interacting with Playwright page/api context.

2. **Inspect `apps/web/e2e/health-readiness.spec.ts`**:
   - Check lines 178–184 (Tier 2.1) where healthy DB/Redis runs `else { expect(status).toBe(200); }` instead of testing 503 status code.
   - Check lines 198–201 (Tier 2.2) where healthy storage/queue skips `if` condition entirely.
   - Check lines 225–227 (Tier 2.4) for `.catch(() => null)` swallowing errors.

3. **Invalidation Condition**:
   - The verdict can only be overturned if `upload-warning.spec.ts` is refactored to perform authentic E2E HTTP uploads or UI interactions against `@petakeu/server` or `@petakeu/web`, and all conditional assertion skips in `health-readiness.spec.ts` are replaced with deterministic assertions.
