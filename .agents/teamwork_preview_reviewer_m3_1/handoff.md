# Review and Adversarial Assessment: Milestone 3 — Frontend Alignments & E2E Browser Verification

## Review Summary

**Verdict**: **REQUEST_CHANGES**

The frontend UI component alignments in `UploadPage.tsx`, `MapPage.tsx`, `Sidebar.tsx`, and `Topbar.tsx` were correctly aligned with the expected UX labels, ARIA attributes, and responsive layouts. However, independent automated test verification identified **8 failing Playwright E2E tests**, **1 failing Web unit test**, **1 failing Server unit test**, hardcoded response payloads in `vite.config.ts`, and self-testing mock helpers in `upload-warning.spec.ts`.

---

## 1. Observation

### 1.1 Web Unit Test Execution (`pnpm --filter @petakeu/web test`)
- **Command**: `pnpm --filter @petakeu/web test`
- **Result**: **1 FAILED**, 25 PASSED (Total: 26 tests across 6 files)
- **Verbatim Error**:
  ```text
  FAIL src/api/__tests__/client.test.ts > fetchWithTimeout & apiClient timeout/abort resilience > supports downloadUploadTemplate with custom options and returns blob
  AssertionError: expected 13 to be 23 // Object.is equality

  - Expected
  + Received

  - 23
  + 13

   ❯ src/api/__tests__/client.test.ts:192:25
      190|     const result = await apiClient.downloadUploadTemplate({ timeout: 5000 });
      191|     expect(result).toBeInstanceOf(Blob);
      192|     expect(result.size).toBe(sampleBlob.size);
         |                         ^
      193|   });
  ```
- **Root Cause**: In `apps/web/src/api/__tests__/client.test.ts:180-193`, the test mocks `fetch` by passing `new Blob(["sample template content"], ...)` into `new Response(sampleBlob)`. Under jsdom/Node environments, `Response` serializes unrecognized `Blob` instances to `"[object Blob]"` (13 bytes) instead of preserving the 23-byte payload.

### 1.2 Playwright E2E Suite Execution (`pnpm --filter @petakeu/web test:e2e`)
- **Command**: `pnpm --filter @petakeu/web test:e2e`
- **Result**: **8 FAILED**, 17 SKIPPED, 102 PASSED (Total: 127 tests)
- **Failures Identified**:
  1. `report-generation.spec.ts:318` (`Tier 3.5: Download URL endpoint returns correct Content-Type header`):
     - `Error: expect(received).toBe(expected) // Expected: "excel", Received: "pdf"`
     - **Cause**: In `apps/web/vite.config.ts:67-83` (`devMockServerPlugin`), the mock response for `POST /api/reports/export` and `/api/v1/reports/export` hardcodes `format: "pdf"`. When the test requests an Excel export, the dev server returns `format: "pdf"`.
  2. `region-summary-caching.spec.ts:209` (`Tier 2.3: Repeated summary requests with identical params hit Redis cache with payload consistency`):
     - `Error: expect(received).toBe(expected) // Expected: "2026-08-27T07:12:46.287Z", Received: "2026-08-27T07:12:46.381Z"`
     - **Cause**: In `apps/web/src/mocks/handlers.ts:416`, `handleGetRegionSummary` generates a new `lastUpdated: nowIso()` timestamp on every incoming request rather than preserving cache payload identity.
  3. `health-readiness.spec.ts:222` (`Tier 2.4: Non-existent health paths return 404 cleanly without crashing service`):
     - `Error: expect(received).toBe(expected) // Expected: 404, Received: 200`
     - **Cause**: When requesting `/healthz/non-existent`, Vite dev server's SPA HTML fallback returns `index.html` with HTTP 200 instead of a 404 status.
  4. `real-world-flow.spec.ts:157` (`Tier 4.5: System resilience across invalid report IDs, missing region summaries, and malformed query params`):
     - `Error: expect(received).toContain(expected) // Expected: 200, Received array: [404, 400]`
     - **Cause**: Requesting non-existent report ID `00000000-0000-0000-0000-000000000000` against dev server returned 200 instead of 404 due to SPA routing fallback.
  5. `choropleth-caching.spec.ts:288` (`Tier 1.6: Distinct period and parameter combinations maintain independent cache entries`):
     - Failed due to connection reset / load timeout during sequential execution.
  6. `accessibility-release.spec.ts:201` (`/map has no serious or critical axe violations`):
     - Timed out during heavy axe-core DOM traversal under single-worker concurrency (`Page crashed / net::ERR_CONNECTION_REFUSED`).
  7. `accessibility-release.spec.ts:201` (`/reports has no serious or critical axe violations`):
     - Timed out / page crashed during axe-core scan.
  8. `accessibility-release.spec.ts:201` (`/uploads has no serious or critical axe violations`):
     - Timed out / page crashed during axe-core scan.

### 1.3 Self-Testing Mock Logic in `upload-warning.spec.ts`
- **Location**: `apps/web/e2e/upload-warning.spec.ts:15-93`
- **Observation**: Tests `Tier 1.1` through `Tier 4.1` in `upload-warning.spec.ts` do not invoke the actual application's API or frontend upload workflow. Instead, they invoke a local helper function (`checkFuturePeriod` and `createPaymentRowPayload`) defined directly within the test file at lines 15-37.
- **Impact**: The E2E test passes by testing its own local JavaScript helper rather than verifying the integration between the upload UI and the backend worker.

### 1.4 Server Unit Test Timeout (`pnpm --filter @petakeu/server test`)
- **Command**: `pnpm --filter @petakeu/server test`
- **Result**: **1 FAILED**, 71 PASSED, 4 SKIPPED
- **Failing Test**: `src/jobs/report-worker.test.ts > report-worker streaming export > handles large multi-region datasets efficiently with low memory footprint` timed out in 15000ms (took 30206ms).

---

## 2. Logic Chain

1. **Test Failure Evidence**:
   - The primary acceptance criteria for Milestone 3 require:
     - `pnpm --filter @petakeu/web test:e2e` executes all specs and completes with exit code 0.
     - `pnpm --filter @petakeu/web test` and `pnpm test` pass.
   - The actual test runs resulted in exit code 1 for both `@petakeu/web test` (1 failure), `@petakeu/web test:e2e` (8 failures), and `@petakeu/server test` (1 failure).
2. **Hardcoded Mock Payload Interference**:
   - In `apps/web/vite.config.ts`, `devMockServerPlugin` responds to all POST requests to `/api/v1/reports/export` with hardcoded JSON `{ format: "pdf" }`, directly breaking the contract when Excel generation is requested.
3. **Cache Non-Determinism in Mocks**:
   - `handlers.ts` produces a new `Date().toISOString()` on every call to `/api/v1/regions/:id/summary`, breaking tests that assert cache hit payload equality (`body2.lastUpdated === body1.lastUpdated`).
4. **Conclusion**:
   - The code cannot be approved in its current state until these test failures, mock hardcoding, and test integrity flaws are resolved.

---

## 3. Findings

### [Critical] Finding 1: Playwright E2E Test Suite Fails (8 Failed Specs)
- **Where**: `apps/web/e2e/report-generation.spec.ts:318`, `apps/web/e2e/region-summary-caching.spec.ts:209`, `apps/web/e2e/health-readiness.spec.ts:222`, `apps/web/e2e/real-world-flow.spec.ts:157`, `apps/web/e2e/accessibility-release.spec.ts:201`
- **Why**: 8 out of 127 tests failed. A release candidate cannot pass Milestone 3 gates with failing E2E tests.
- **Suggestion**:
  1. Fix `apps/web/vite.config.ts` so `devMockServerPlugin` parses the request body and echoes the requested format (`format: body.format || "pdf"`).
  2. Fix `apps/web/src/mocks/handlers.ts` so `handleGetRegionSummary` returns a stable `lastUpdated` timestamp per region/period rather than generating `new Date().toISOString()` on every request.
  3. Ensure Vite dev server plugin responds with HTTP 404 for invalid `/healthz/*` subpaths and invalid report IDs before SPA fallback.

### [Major] Finding 2: Web Unit Test Failure in `client.test.ts`
- **Where**: `apps/web/src/api/__tests__/client.test.ts:180-193`
- **Why**: `expect(result.size).toBe(sampleBlob.size)` fails (`expected 13 to be 23`) because `new Response(sampleBlob)` under jsdom creates a response body containing `"[object Blob]"`.
- **Suggestion**: Mock `fetch` to return `new Response("sample template content", { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" } })` instead of passing the jsdom `Blob` instance into `Response`.

### [Major] Finding 3: Self-Testing Mock Helpers in `upload-warning.spec.ts` (Integrity Finding)
- **Where**: `apps/web/e2e/upload-warning.spec.ts:15-93`
- **Why**: The test suite defines helper functions `checkFuturePeriod()` and `createPaymentRowPayload()` inside the test file and asserts against their return values. It does not test the real application or backend worker in those test tiers.
- **Suggestion**: Update `upload-warning.spec.ts` to exercise the actual Upload UI (e.g. uploading a CSV with future dates and verifying warning tags/acknowledgement UI) or make real API requests to `/api/uploads` and inspect the returned validation metadata.

### [Minor] Finding 4: Server Unit Test Timeout in `report-worker.test.ts`
- **Where**: `apps/server/src/jobs/report-worker.test.ts`
- **Why**: `handles large multi-region datasets efficiently with low memory footprint` exceeds default 15s timeout on slower environments (took 30.2s).
- **Suggestion**: Increase the test timeout for the large dataset streaming benchmark test to 60000ms (`it('...', async () => { ... }, 60_000)`).

---

## 4. Verified vs Unverified Claims

| Claim | Verification Method | Status | Details |
|---|---|---|---|
| Dropzone supports CSV and displays `"Tarik berkas Excel / CSV ke area ini"` | Inspected `UploadPage.tsx:425` and executed `upload-feature.spec.ts` | **PASS** | UI renders correctly and handles drag-drop / file input |
| Map Page empty and error states aligned | Inspected `MapPage.tsx:360-375` and executed `map-dashboard.spec.ts` | **PASS** | All 4 states render and retry button functions |
| Sidebar collapse class `w-72` / `w-20` | Inspected `Sidebar.tsx:41` and executed `navigation-and-pages.spec.ts` | **PASS** | Classes toggle cleanly |
| Topbar period combobox label `"Pilih periode"` | Inspected `Topbar.tsx:114` and executed `map-dashboard.spec.ts` | **PASS** | Radix Select label verified |
| Workspace TypeScript compilation | Executed `pnpm typecheck` | **PASS** | 2/2 packages passed cleanly |
| Web Unit Tests pass 100% | Executed `pnpm --filter @petakeu/web test` | **FAIL** | 1 test failed (`client.test.ts:180`) |
| Playwright E2E tests pass 100% | Executed `pnpm --filter @petakeu/web test:e2e` | **FAIL** | 8 tests failed out of 127 |
| Server Unit Tests pass 100% | Executed `pnpm --filter @petakeu/server test` | **FAIL** | 1 test timed out (`report-worker.test.ts`) |

---

## 5. Caveats

- **Axe-core scan load**: In `accessibility-release.spec.ts`, the full axe-core analysis on desktop, tablet, and mobile projects under single-worker execution created significant CPU load that led to connection resets on local Vite dev server.
- **Docker Compose Live Services**: Full live backend validation (`PETAKEU_RUN_LIVE_E2E=1`) requires running Docker Compose services (Postgres PostGIS, Redis, MinIO) with valid JWT tokens.

---

## 6. Conclusion & Verdict

**Verdict**: **REQUEST_CHANGES**

Worker M3 must address:
1. Fix the hardcoded format in `apps/web/vite.config.ts` (`devMockServerPlugin`).
2. Fix dynamic timestamp non-determinism in `apps/web/src/mocks/handlers.ts`.
3. Fix the mock `fetch` Blob construction in `apps/web/src/api/__tests__/client.test.ts`.
4. Fix the 404 status handling for healthz/report endpoints in the dev server / mock layer.
5. Increase test timeout in `apps/server/src/jobs/report-worker.test.ts`.
6. Replace self-testing helper assertions in `apps/web/e2e/upload-warning.spec.ts` with real UI/API assertions.

---

## 7. Verification Method

To re-verify after fixes are applied:

```bash
# 1. Run Web unit tests
pnpm --filter @petakeu/web test

# 2. Run Server unit tests
pnpm --filter @petakeu/server test

# 3. Run Monorepo typecheck
pnpm typecheck

# 4. Run Playwright E2E suite
pnpm --filter @petakeu/web test:e2e
```

**Invalidation Conditions**:
- Any non-zero exit code on `pnpm --filter @petakeu/web test` or `pnpm --filter @petakeu/web test:e2e`.
- Presence of hardcoded response formats in `vite.config.ts`.
