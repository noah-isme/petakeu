# Handoff Report: E2E Test Suite Adversarial Audit & Empirical Verification

## 1. Observation

### Empirical Execution Results
1. **TypeScript Typecheck**:
   Command: `pnpm --filter @petakeu/web typecheck`
   Result: Exited with code 0 (0 errors).

2. **Playwright Test Discovery**:
   Command: `npx playwright test choropleth-caching.spec.ts region-summary-caching.spec.ts report-generation.spec.ts real-world-flow.spec.ts --list`
   Result: Discovered 23 tests across 4 target spec files.

3. **Playwright Test Execution**:
   Command: `npx playwright test choropleth-caching.spec.ts region-summary-caching.spec.ts report-generation.spec.ts real-world-flow.spec.ts`
   Result: **18 Failed, 5 Passed** (exit code 1).

### Breakdown of Test Results by File
- `apps/web/e2e/real-world-flow.spec.ts`: **5 Passed, 0 Failed**
- `apps/web/e2e/choropleth-caching.spec.ts`: **0 Passed, 6 Failed**
- `apps/web/e2e/region-summary-caching.spec.ts`: **0 Passed, 6 Failed**
- `apps/web/e2e/report-generation.spec.ts`: **1 Passed, 5 Failed**

### Verbatim Failures & Error Traces
1. **Direct API Request 404 Failures (`choropleth-caching.spec.ts`, `region-summary-caching.spec.ts`, `report-generation.spec.ts`)**:
   ```
   Error: expect(received).toContain(expected) // indexOf
   Expected value: 404
   Received array: [200, 201]
   at /home/noah/project/petakeu/apps/web/e2e/report-generation.spec.ts:91:24
   ```
   ```
   SyntaxError: Unexpected end of JSON input
   at /home/noah/project/petakeu/apps/web/e2e/report-generation.spec.ts:135:25
   ```
   ```
   Error: expect(received).not.toBeNull()
   Received: null
   at /home/noah/project/petakeu/apps/web/e2e/report-generation.spec.ts:201:24
   ```

2. **Frontend Architecture Inspection**:
   - `apps/web/vite.config.ts` line 7: `// Proxy disabled - using MSW for development`.
   - `apps/web/src/mocks/browser.ts` uses MSW `setupWorker` which runs exclusively inside the browser Service Worker.
   - `apps/web/src/mocks/handlers.ts`:
     - Line 394: `return res(ctx.status(202), ctx.json({ upload_id: uploadId }));`
     - Line 436: `return res(ctx.status(202), ctx.json({ job_id: jobId }));`

---

## 2. Logic Chain

1. **Root Cause of 18 Test Failures**:
   - The test suite uses Playwright's `request` fixture (`APIRequestContext`) in `choropleth-caching.spec.ts`, `region-summary-caching.spec.ts`, and `report-generation.spec.ts`.
   - Playwright's `APIRequestContext` executes HTTP requests in Node.js directly. It does NOT run inside Chromium and does NOT pass through the browser's Service Worker.
   - In `apps/web`, development mocking relies on MSW's `setupWorker` in the browser. Vite dev server on port 5175 has no backend proxy or server-side mock middleware configured (`vite.config.ts` line 7).
   - Consequently, all standalone `request.get(...)` / `request.post(...)` calls hit Vite directly and receive `HTTP 404 Not Found`.
   - In contrast, `real-world-flow.spec.ts` passes because scenarios 4.1–4.4 load the application inside a browser page (`page.goto("/")`), triggering MSW inside the browser service worker context.

2. **HTTP Status Code Assertion Bug in Job Enqueueing**:
   - In `report-generation.spec.ts` (lines 91 & 113), the tests assert `expect([200, 201]).toContain(res!.status())`.
   - Asynchronous job enqueueing endpoints (`POST /api/v1/reports/export` and MSW `POST /api/reports`) return `HTTP 202 Accepted` status.
   - The assertion `[200, 201]` excludes `202`, causing the assertion to fail even if a 202 Accepted response is returned.

3. **Flawed Latency Assertion**:
   - In `choropleth-caching.spec.ts` line 201:
     `expect(hitDuration).toBeLessThanOrEqual(missDuration + 100);`
     This formula allows a cache hit to be up to 100ms *slower* than a cache miss (e.g., miss = 10ms, hit = 100ms passes), invalidating the performance test intent.

4. **Payload Field Mismatch**:
   - In `report-generation.spec.ts` lines 84-88, the test posts `{ period: "2025-08", regionIds: ["3301"], format: "pdf" }`.
   - Existing MSW handlers (`apps/web/src/mocks/handlers.ts` line 411) expect `{ regionId: "3301", periodFrom: "2025-08", periodTo: "2025-08", type: "pdf" }`.
   - In `region-summary-caching.spec.ts` line 170, the test attempts cache invalidation by sending JSON `{ triggerInvalidation: true }` to `/api/v1/uploads`, but upload endpoints require `multipart/form-data`.

---

## 3. Caveats

- Tests that interact with the UI via `page.goto("/")` (such as `real-world-flow.spec.ts`) run reliably because browser MSW intercepts their network traffic.
- If an Express backend server is spawned on port 3001 during E2E runs, `APIRequestContext` calls will hit port 3001, but the tests must accommodate both MSW browser mock environments and live Express backend environments via `page.request` or `page.evaluate(() => fetch(...))` or unified request wrappers.

---

## 4. Conclusion & Verdict

**VERDICT: REQUEST_CHANGES**

The 4 target E2E test files currently fail 18 out of 23 test cases (78.2% failure rate) during standard E2E test execution (`pnpm --filter @petakeu/web test:e2e`).

### Actionable Required Changes:
1. **Refactor Direct API Requests to Browser Context or Unified Helper**:
   - Update `choropleth-caching.spec.ts`, `region-summary-caching.spec.ts`, and `report-generation.spec.ts` so API calls are executed within an active browser page session (e.g. `page.request` or `page.evaluate` after navigating to `/`) so MSW interceptors catch them in mock environments.
2. **Fix Status Code Assertions**:
   - Update status code checks for report job enqueueing in `report-generation.spec.ts` to include `202` (`expect([200, 201, 202]).toContain(res.status())`).
3. **Fix Latency Assertion**:
   - Fix `choropleth-caching.spec.ts` line 201 to assert `hitDuration <= missDuration` or check `X-Cache` hit headers.
4. **Align Payload Schemas**:
   - Align payload fields in `report-generation.spec.ts` (`format`/`type`, `regionId`/`regionIds`) with both MSW mock handlers and backend specification contract.

---

## 5. Verification Method

To independently verify these findings:

1. **Run Playwright Target Tests**:
   ```bash
   cd /home/noah/project/petakeu/apps/web
   npx playwright test choropleth-caching.spec.ts region-summary-caching.spec.ts report-generation.spec.ts real-world-flow.spec.ts
   ```
   *Expected Result*: Command fails with exit code 1 (18 failed, 5 passed).

2. **Verify Port Connectivity**:
   ```bash
   curl -i http://localhost:5175/api/v1/geo/choropleth
   ```
   *Expected Result*: Returns HTTP 404 (Vite does not handle Node.js API requests without browser MSW).
