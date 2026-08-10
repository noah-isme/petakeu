# Handoff Report: E2E Test Suite Audit (Redis Caching & Extended Reports)

## 1. Observation
- Conducted empirical execution of the Playwright E2E test suite across the 4 target spec files:
  1. `apps/web/e2e/choropleth-caching.spec.ts`
  2. `apps/web/e2e/region-summary-caching.spec.ts`
  3. `apps/web/e2e/report-generation.spec.ts`
  4. `apps/web/e2e/real-world-flow.spec.ts`
- Result of execution: **21 out of 23 tests FAILED**.
  - Command: `npx playwright test e2e/choropleth-caching.spec.ts e2e/region-summary-caching.spec.ts e2e/report-generation.spec.ts e2e/real-world-flow.spec.ts`
  - Output summary: `21 failed, 2 passed (2.0m)`.

- Primary failure signatures:
  1. **HTML Fallback / JSON Parsing Error (`SyntaxError: Unexpected token '<'`)**:
     - `choropleth-caching.spec.ts:60` — `Expected substring: "application/json"`, `Received string: "text/html"`.
     - `choropleth-caching.spec.ts:100` — `SyntaxError: Unexpected token '<', "<!DOCTYPE "... is not valid JSON`.
     - `choropleth-caching.spec.ts:133` — `SyntaxError: Unexpected token '<', "<!DOCTYPE "... is not valid JSON`.
     - `choropleth-caching.spec.ts:152` — `SyntaxError: Unexpected token '<', "<!DOCTYPE "... is not valid JSON`.
     - `choropleth-caching.spec.ts:180` — `SyntaxError: Unexpected token '<', "<!DOCTYPE "... is not valid JSON`.
     - `choropleth-caching.spec.ts:217` — `SyntaxError: Unexpected token '<', "<!DOCTYPE "... is not valid JSON`.
  2. **Connection Refused / Server Readiness Failure**:
     - `real-world-flow.spec.ts:56` — `Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:5175/`.
     - `real-world-flow.spec.ts:77` — `Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:5175/`.
     - `real-world-flow.spec.ts:119` — `Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:5175/`.
     - `real-world-flow.spec.ts:177` — `Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:5175/`.
  3. **Null Response Fallthrough**:
     - `report-generation.spec.ts:90`, `112`, `134`, `173`, `201` — `Error: expect(received).not.toBeNull()`, `Received: null`.
     - `region-summary-caching.spec.ts:54`, `100`, `120`, `145`, `163`, `193` — test execution timeouts and null responses.

## 2. Logic Chain
1. **Flawed Helper Function Response Validation**:
   - In `choropleth-caching.spec.ts` (lines 28-44) and similar helper functions (`fetchRegionSummary`, `enqueueReport`), the candidate URL loop checks:
     ```ts
     if (res.ok() || res.status() === 200) return res;
     ```
   - When Vite dev server runs, unhandled `/api/v1/...` endpoints fall back to serving `index.html` with `200 OK`.
   - The helper returns the HTML response object as a valid API response.
   - When test cases attempt `await res.json()`, Node crashes with `SyntaxError: Unexpected token '<', "<!DOCTYPE "... is not valid JSON`.
   - **Fix Required**: Helper functions must check `res.headers()['content-type']?.includes('application/json')` in addition to status `200` before treating a candidate URL response as a valid API payload.

2. **Decoupled Test Runner vs Web Server Infrastructure**:
   - `playwright.config.ts` configures `webServer: { command: "pnpm dev", url: "http://localhost:5175" }`.
   - `apps/web/vite.config.ts` explicitly comments out the `/api` proxy (`// proxy: { "/api": "http://localhost:4000" }`) and relies on client-side MSW browser service worker.
   - Playwright's `APIRequestContext` (`request.get(...)`) operates in Node.js outside browser context, so API calls never hit browser MSW or backend Express server (`apps/server` on port 3001).
   - **Fix Required**: Spec helper functions or test environment setup must route API requests through a running backend server or use browser page routing (`page.request` / `page.evaluate`) or start both backend and frontend servers during Playwright test runs.

3. **Inadequate Assertion Guarding**:
   - Spec files assert `expect(res).not.toBeNull()` without verifying that an actual API endpoint returned JSON content.

## 3. Caveats
- `pnpm --filter @petakeu/web typecheck` passes cleanly (0 static TypeScript errors).
- Test discovery (`npx playwright test --list`) succeeds in parsing all 23 tests across the 4 files.
- Static structure of tests is well-organized, but empirical execution fails completely due to helper URL resolution and dev server routing decoupling.

## 4. Conclusion
- Verdict: **REQUEST_CHANGES**
- The test specs created by `teamwork_preview_test_writer_e2e_1` cannot pass in empirical test execution (21 of 23 tests failed).
- The test writer must fix helper function candidate URL checking (enforce `application/json` Content-Type) and resolve Playwright server/mock environment routing so all 23 tests pass cleanly.

## 5. Verification Method
1. Execute Playwright test suite empirically:
   `npx playwright test e2e/choropleth-caching.spec.ts e2e/region-summary-caching.spec.ts e2e/report-generation.spec.ts e2e/real-world-flow.spec.ts`
2. Verify all 23 tests pass cleanly with 0 failures (`23 passed`).
