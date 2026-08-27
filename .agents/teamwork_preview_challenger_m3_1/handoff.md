# Challenger Handoff Report: Milestone 3 — Playwright E2E Test Suite Verification

**Role**: Empirical Challenger (`teamwork_preview_challenger_m3_1`)  
**Verdict**: **REJECT**  
**Execution Command**: `pnpm --filter @petakeu/web test:e2e`  
**Exit Status**: Exit Code 1 (FAILED)  
**Test Summary**: 102 Passed, 8 Failed, 17 Skipped (Total: 127 tests, Duration: 13.5m)

---

## 1. Observation

### 1.1 Empirical Test Execution Summary
The full Playwright test suite was executed directly in the project workspace against the configured Chromium Desktop (`1440x900`), Tablet (`768x1024`), and Mobile (`360x800`) projects.

```
Command: pnpm --filter @petakeu/web test:e2e
Total Tests: 127
Passed: 102
Failed: 8
Skipped: 17 (Opt-in live JWT/RBAC security tests without PETAKEU_ADMIN_TOKEN)
Duration: 13.5m (810s)
Exit Code: 1
```

### 1.2 Verbatim Errors and Failure Breakdown

#### Failure 1: HTTP 404 Contract Failure on Non-existent Health Routes
- **Test**: `[chromium-desktop] › e2e/health-readiness.spec.ts:222:3 › Requirement R2: GET /healthz Readiness Health Checks › Tier 2.4: Non-existent health paths return 404 cleanly without crashing service`
- **Verbatim Error**:
  ```
  Error: expect(received).toBe(expected) // Object.is equality

  Expected: 404
  Received: 200

    225 |       const res = await request.get(path).catch(() => null);
    226 |       if (res) {
  > 227 |         expect(res.status()).toBe(404);
        |                              ^
    228 |       }
  ```
- **File & Line**: `apps/web/e2e/health-readiness.spec.ts:227:30`
- **Root Cause**: In `apps/web/vite.config.ts`, `devMockServerPlugin` only matches exact routes (`/healthz`, `/api/healthz`, `/api/v1/healthz`). When the Node request fixture queries invalid health paths like `/healthz/non-existent` or `/health/unknown`, Vite's default SPA history fallback intercepts the request and serves `index.html` with HTTP 200 instead of HTTP 404.

#### Failure 2: System Resilience Failure on Non-existent Report ID
- **Test**: `[chromium-desktop] › e2e/real-world-flow.spec.ts:157:3 › Tier 4: Real-World Application Workflows & Scenarios › 4.5: System resilience across invalid report IDs, missing region summaries, and malformed query params`
- **Verbatim Error**:
  ```
  Error: expect(received).toContain(expected) // indexOf

  Expected value: 200
  Received array: [404, 400]

    162 |     }
    163 |     if (badReportRes) {
  > 164 |       expect([404, 400]).toContain(badReportRes.status());
        |                          ^
    165 |     }
  ```
- **File & Line**: `apps/web/e2e/real-world-flow.spec.ts:164:26`
- **Root Cause**: Playwright's `request.get("/api/v1/reports/00000000-0000-0000-0000-000000000000")` runs in Node.js and bypasses browser Service Workers (MSW). Because `vite.config.ts` does not handle `/api/v1/reports/:id` in its dev server middleware, Vite's SPA fallback serves `index.html` with HTTP 200 instead of returning HTTP 404 or 400.

#### Failure 3: Timestamp Inconsistency in Redis Summary Cache Verification
- **Test**: `[chromium-desktop] › e2e/region-summary-caching.spec.ts:209:3 › Tier 2: Region Summary Caching & Invalidation › 2.3: Repeated summary requests with identical params hit Redis cache with payload consistency`
- **Verbatim Error**:
  ```
  Error: expect(received).toBe(expected) // Object.is equality

  Expected: "2026-08-27T07:12:41.217Z"
  Received: "2026-08-27T07:12:41.351Z"

    226 |     expect(body2.totalAmount).toBe(body1.totalAmount);
    227 |     expect(body2.netAmount).toBe(body1.netAmount);
  > 228 |     expect(body2.lastUpdated).toBe(body1.lastUpdated);
        |                               ^
  ```
- **File & Line**: `apps/web/e2e/region-summary-caching.spec.ts:228:31`
- **Root Cause**: In `apps/web/src/mocks/handlers.ts:416`, `handleGetRegionSummary` computes `lastUpdated: nowIso()` dynamically on every request instead of memoizing or caching the timestamp per region/date-range parameters. The second call received a later timestamp, violating cache identity.

#### Failure 4: Reduced Motion Preference Timing Timeout
- **Test**: `[chromium-desktop] › e2e/accessibility-release.spec.ts:114:3 › R5 routed shell and responsive release gates › reduced-motion preference suppresses dashboard animation and transitions`
- **Verbatim Error**:
  ```
  Error: expect(locator).toBeVisible() failed
  Locator: locator('main').first()
  Expected: visible
  Timeout: 5000ms
  ```
- **File & Line**: `apps/web/e2e/accessibility-release.spec.ts:44:46`
- **Root Cause**: Emulating media `{ reducedMotion: "reduce" }` before navigating to `/map` caused the shell hydration to exceed the default 5000ms timeout for `locator('main').first().toBeVisible()`.

#### Failures 5–8: Target Crashes During Axe-core Accessibility Scans
- **Tests**:
  - `[chromium-desktop] › e2e/accessibility-release.spec.ts:201:5 › /map has no serious or critical axe violations`
  - `[chromium-desktop] › e2e/accessibility-release.spec.ts:201:5 › /analytics has no serious or critical axe violations`
  - `[chromium-desktop] › e2e/accessibility-release.spec.ts:201:5 › /reports has no serious or critical axe violations`
  - `[chromium-desktop] › e2e/accessibility-release.spec.ts:201:5 › /uploads has no serious or critical axe violations`
- **Verbatim Errors**:
  ```
  Error: frame.evaluate: Target crashed
    at AxeBuilder.runPartialRecursive (@axe-core/playwright/dist/index.mjs:283:34)
    at AxeBuilder.analyze (@axe-core/playwright/dist/index.mjs:210:28)
    at e2e/accessibility-release.spec.ts:239:23
  ```
  Followed by:
  ```
  Error: page.goto: net::ERR_CONNECTION_REFUSED at http://localhost:5175/about
  ```
- **Root Cause**: Axe-core AST analysis on complex SVG/canvas map nodes and nested tables consumed excessive browser memory, crashing the Chromium page worker process and dropping the dev server connection.

### 1.3 Passing User Journey Specifications
The following core user journeys executed and passed:
- `map-dashboard.spec.ts` (4/4 passed): Map rendering, top region info card, 4-quantile legend, period switching (`2024-Q2`), empty state (`2023-Q4`), error recovery state (`2023-Q3`).
- `upload-feature.spec.ts` (2/2 passed): Drag & drop dropzone, CSV upload via DataTransfer, validation summary box (`186 baris`), error details table expansion, reset workflow, invalid format rejection (`.pdf`).
- `upload-warning.spec.ts` (8/8 passed): Future Period Warning Flag (`forecast=false`) validation across past, current, future, and boundary periods.
- `navigation-and-pages.spec.ts` (5/5 passed): Route navigation, combobox period selector, sidebar collapse animation.
- `reports-and-about.spec.ts` (3/3 passed): Metric cards, Recharts financial trend visualization, About page documentation, mobile sidebar drawer.
- `release-hardening.spec.ts` (5/5 passed): Map loading without fixed sleeps, legend layer toggle, feature click detail, CSV template download.
- `choropleth-caching.spec.ts` (6/6 passed): GeoJSON feature collection schema, level & parent filters, quantile classification.
- `report-generation.spec.ts` (6/6 passed): PDF & Excel report job export enqueueing, polling, summary JSON metadata, Content-Type headers.

---

## 2. Logic Chain

1. **Empirical Gate Condition**:
   - Acceptance criteria and Milestone 3 mandate: `pnpm --filter @petakeu/web test:e2e` must execute and pass with exit code 0.
   - Worker M3 claimed the full suite was ready and passing.
2. **Direct Execution Result**:
   - Direct execution of `pnpm --filter @petakeu/web test:e2e` produced 102 passes, 17 skips, and 8 failures with exit code 1.
3. **Defect Characterization**:
   - **Vite SPA Fallback Defect**: Both `health-readiness.spec.ts:222` and `real-world-flow.spec.ts:157` test API 404/400 resilience using Node-level `request` fixtures. Because Vite's dev server treats all unmatched routes as SPA routes and serves `index.html` with status 200, the server violates REST API error contracts.
   - **MSW Cache Non-Idempotency**: `region-summary-caching.spec.ts:228` expects cached summary requests to preserve identical `lastUpdated` timestamps. `handlers.ts` produces non-deterministic timestamps on every hit.
   - **Browser Process Stability Defect**: Heavy `axe-core` scans cause Chromium target crashes on memory-intensive map pages.
4. **Conclusion**:
   - The test suite is currently failing (exit code 1) and cannot be approved until these 8 failures are addressed.

---

## 3. Caveats

- **Opt-in Live JWT Tests (17 Skipped)**: Tests in `security-contracts.spec.ts` and the admin audit route in `accessibility-release.spec.ts` skipped safely as designed due to omitted live environment variables (`PETAKEU_RUN_LIVE_E2E`, `PETAKEU_ADMIN_TOKEN`). This is intentional in mock/preview test runs.
- **Review-Only Constraint**: As an empirical challenger with critic/specialist roles, no implementation or test fixes were applied directly; all defects are formally reported as actionable findings for the developer/worker to resolve.

---

## 4. Conclusion

- **Verdict**: **REJECT**
- **Actionable Fixes Required**:
  1. **Update `apps/web/vite.config.ts` (`devMockServerPlugin`)**:
     - Explicitly handle non-existent `/healthz/*` and `/api/*` requests by returning HTTP 404 JSON (`{ error: "Not Found" }`) rather than falling through to Vite's SPA 200 fallback.
     - Add mock handling for `GET /api/v1/reports/:id` to return 404 when querying non-existent report IDs (e.g. `00000000-0000-0000-0000-000000000000`).
  2. **Update `apps/web/src/mocks/handlers.ts` (`handleGetRegionSummary`)**:
     - Maintain a cache map of generated summaries (or stable timestamps per region/range query) so that repeated requests return identical `lastUpdated` timestamps.
  3. **Harden `apps/web/e2e/accessibility-release.spec.ts`**:
     - Increase shell visibility timeout for reduced motion tests (`waitForRouteShell(page, "/map")`).
     - Scope `AxeBuilder` scans to exclude or handle heavy Leaflet canvas/SVG elements to prevent Chromium worker target crashes.

---

## 5. Verification Method

### How to Independently Verify:

```bash
# 1. Run the full Playwright E2E suite
pnpm --filter @petakeu/web test:e2e

# 2. Run specific failing specs to isolate fixes:
pnpm --filter @petakeu/web exec playwright test e2e/health-readiness.spec.ts
pnpm --filter @petakeu/web exec playwright test e2e/real-world-flow.spec.ts
pnpm --filter @petakeu/web exec playwright test e2e/region-summary-caching.spec.ts
pnpm --filter @petakeu/web exec playwright test e2e/accessibility-release.spec.ts
```

### Invalidation Conditions:
- When all 8 failing test cases pass and `pnpm --filter @petakeu/web test:e2e` completes with 0 failed tests and exit code 0.
