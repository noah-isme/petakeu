# Forensic Audit Report: Milestone 3 — E2E Browser Verification

**Work Product**: `apps/web/e2e/`, `apps/web/src/pages/`, `apps/web/src/mocks/handlers.ts`, `apps/web/vite.config.ts`, `apps/web/playwright.config.ts`
**Profile**: General Project
**Verdict**: **INTEGRITY VIOLATION**

---

## 1. Observation

### 1.1 Test Suite Execution Results
Execution of the Playwright E2E test suite (`pnpm --filter @petakeu/web test:e2e`) yielded **10 test failures**, **17 skipped tests**, and **100 passed tests** (Exit status: `1`).

```
  10 failed
    [chromium-desktop] › e2e/accessibility-release.spec.ts:114:3 › R5 routed shell and responsive release gates › reduced-motion preference suppresses dashboard animation and transitions 
    [chromium-desktop] › e2e/accessibility-release.spec.ts:147:3 › R5 routed shell and responsive release gates › primary routes do not introduce horizontal overflow at the supported viewport 
    [chromium-desktop] › e2e/health-readiness.spec.ts:222:3 › Requirement R2: GET /healthz Readiness Health Checks › Tier 2.4: Non-existent health paths return 404 cleanly without crashing service 
    [chromium-desktop] › e2e/real-world-flow.spec.ts:157:3 › Tier 4: Real-World Application Workflows & Scenarios › 4.5: System resilience across invalid report IDs, missing region summaries, and malformed query params 
    [chromium-desktop] › e2e/region-summary-caching.spec.ts:209:3 › Tier 2: Region Summary Caching & Invalidation › 2.3: Repeated summary requests with identical params hit Redis cache with payload consistency 
    [chromium-desktop] › e2e/report-generation.spec.ts:248:3 › Tier 3: Report Generation Job Enqueueing & Download › 3.3: GET /api/v1/reports/:id allows polling job status until completion 
    [chromium-desktop] › e2e/report-generation.spec.ts:318:3 › Tier 3: Report Generation Job Enqueueing & Download › 3.5: Download URL endpoint returns correct Content-Type header (application/pdf for PDF, excel MIME for Excel) 
    [chromium-mobile] › e2e/accessibility-release.spec.ts:201:5 › R5 serious/critical accessibility gate › /reports has no serious or critical axe violations 
    [chromium-mobile] › e2e/accessibility-release.spec.ts:201:5 › R5 serious/critical accessibility gate › /uploads has no serious or critical axe violations 
    [chromium-mobile] › e2e/accessibility-release.spec.ts:201:5 › R5 serious/critical accessibility gate › /about has no serious or critical axe violations 
  17 skipped
  100 passed (13.0m)

/home/noah/project/petakeu/apps/web:
ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL @petakeu/web@0.1.0 test:e2e: `playwright test`
Exit status 1
```

### 1.2 Forensic Source & Behavior Inspection

1. **Hardcoded Mock Payload in `apps/web/vite.config.ts` (lines 66–84)**:
   ```ts
   // Direct Node requests from playwright request fixture to /api/reports/export
   if (req.method === "POST" && (url === "/api/reports/export" || url === "/api/v1/reports/export")) {
     res.setHeader("Content-Type", "application/json");
     res.statusCode = 202;
     res.end(
       JSON.stringify({
         data: {
           jobId: "mock-report-job-node",
           id: "mock-report-job-node",
           period: "2025-08",
           regionIds: ["3301", "3302"],
           format: "pdf", // <-- Hardcoded to "pdf" regardless of whether requested format is "excel"
           status: "queued"
         }
       })
     );
     return;
   }
   ```
   - **Verbatim Error in `e2e/report-generation.spec.ts:346`**:
     ```
     Error: expect(received).toBe(expected) // Object.is equality
     Expected: "excel"
     Received: "pdf"
     ```

2. **Inauthentic Caching Timestamp Generation in `apps/web/src/mocks/handlers.ts` (line 416)**:
   ```ts
   return res(
     ctx.status(200),
     ctx.set("X-Cache", "HIT"),
     ctx.json({
       region,
       ...summary,
       lastUpdated: nowIso(), // <-- Re-generated dynamically on every request instead of preserving cache timestamp
       reportUrl: `https://storage.petakeu.local/reports/${id}-${Date.now()}.pdf`
     })
   );
   ```
   - **Verbatim Error in `e2e/region-summary-caching.spec.ts:228`**:
     ```
     Error: expect(received).toBe(expected) // Object.is equality
     Expected: "2026-08-27T07:13:17.166Z"
     Received: "2026-08-27T07:13:17.335Z"
     ```

3. **Vite SPA Fallback Conflict with Node-Level API/Health Probes**:
   - `e2e/health-readiness.spec.ts:222` probes non-existent paths (`/healthz/non-existent`, `/healthz-invalid-route-123`, `/health/unknown`).
   - `e2e/real-world-flow.spec.ts:157` probes non-existent report ID (`/api/v1/reports/00000000-0000-0000-0000-000000000000`).
   - Because these requests are dispatched via Playwright's `request` fixture (outside the browser Service Worker context), Vite dev server responds with `index.html` (HTTP 200 OK) due to SPA HTML fallback, rather than HTTP 404.
   - **Verbatim Error in `e2e/health-readiness.spec.ts:227`**:
     ```
     Expected: 404
     Received: 200
     ```
   - **Verbatim Error in `e2e/real-world-flow.spec.ts:164`**:
     ```
     Expected value: 200
     Received array: [404, 400]
     ```

4. **Browser Crash & Timeout in Accessibility Suite (`e2e/accessibility-release.spec.ts`)**:
   - `reduced-motion preference suppresses dashboard animation and transitions` timed out waiting for `locator('main').first().toBeVisible()`.
   - `primary routes do not introduce horizontal overflow at the supported viewport` suffered `page.goto: Page crashed` when navigating to `/reports`.
   - Subsequent mobile viewport tests in the same process failed with `net::ERR_CONNECTION_REFUSED`.

---

## 2. Logic Chain

1. **Premise 1**: Acceptance criteria in `ORIGINAL_REQUEST.md` and Milestone 3 mandate that `pnpm --filter @petakeu/web test:e2e` executes all specs with 100% pass rate (exit code 0) across core user journeys (Map, Upload, Reports, Accessibility).
2. **Premise 2**: Independent execution of `pnpm --filter @petakeu/web test:e2e` failed with 10 test errors and exit code 1.
3. **Premise 3**: Source analysis revealed integrity defects:
   - Hardcoded response in `apps/web/vite.config.ts` returning static `"pdf"` format for all export requests regardless of request parameters.
   - Inauthentic caching simulation in `apps/web/src/mocks/handlers.ts` generating fresh timestamps despite asserting `X-Cache: HIT`.
   - Unhandled Vite dev middleware routing causing SPA fallback HTTP 200 responses on invalid backend routes.
   - Page crash and timeout on `/reports` and reduced-motion map rendering.
4. **Conclusion**: The deliverable fails behavioral verification and exhibits hardcoded mock responses and simulation defects. The verdict is **INTEGRITY VIOLATION**.

---

## 3. Caveats

- **Opt-in Live Security Tests**: 17 tests were skipped safely as intended because live environment variables (`PETAKEU_RUN_LIVE_E2E=1`, `PETAKEU_ADMIN_TOKEN`) are optional for local mock runs.
- **Audit-Only Discipline**: Per auditor rules, no source files were modified. All defects are documented for remediation by the worker/orchestrator.

---

## 4. Conclusion

- **Verdict**: **INTEGRITY VIOLATION**
- The Milestone 3 work product cannot be certified because:
  1. The E2E test suite fails with 10 test errors under independent execution.
  2. `apps/web/vite.config.ts` contains hardcoded mock data (`format: "pdf"`, `jobId: "mock-report-job-node"`).
  3. `apps/web/src/mocks/handlers.ts` produces inconsistent timestamps on cached responses.
  4. Vite dev server middleware lacks proper 404 handling for Node HTTP request fixtures.

---

## 5. Verification Method

To independently reproduce the failure:

```bash
# Run full E2E test suite from repository root
pnpm --filter @petakeu/web test:e2e
```

**Expected Result**:
- Exit code 1
- 10 failing specs in `accessibility-release.spec.ts`, `health-readiness.spec.ts`, `real-world-flow.spec.ts`, `region-summary-caching.spec.ts`, and `report-generation.spec.ts`.
