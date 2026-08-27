# Handoff Report: Milestone 3.2 — Empirical Challenge of User Journey Interactions

## 1. Observation

### 1.1 Empirical Test Execution Overview
Executed the full Playwright End-to-End (E2E) test suite across all 13 spec suites and 3 viewport profiles (`chromium-desktop` 1440x900, `chromium-tablet` 768x1024, `chromium-mobile` 360x800):
- **Command Executed**: `pnpm --filter @petakeu/web test:e2e`
- **Total Tests Run**: 127
- **Results**: 101 Passed, 17 Skipped (Opt-in live RBAC/JWT contracts), **9 Failed**
- **Exit Status**: 1 (FAILED)

---

### 1.2 Evaluation of the 4 Mandated User Journey Interactions

#### Journey 1: Map Exploration and Period Switching (`2024-Q2`, `2023-Q4`, `2023-Q3`) — **PASS (CONFIRMED)**
- `apps/web/e2e/map-dashboard.spec.ts:12` ("should display map, top region, legend, and info card"):
  - **Result**: PASSED (5.8s). Verified Leaflet canvas, right panel info card showing "Jawa Timur", and 4-quantile legend ("Skala Kuantil Pendapatan").
- `apps/web/e2e/map-dashboard.spec.ts:28` ("should switch period and update map data"):
  - **Result**: PASSED (8.5s). Selecting `"2024-Q2"` via Radix combobox triggers simulated loading and renders updated top region card.
- `apps/web/e2e/map-dashboard.spec.ts:48` ("should show empty state when period has no data (2023-Q4)"):
  - **Result**: PASSED (6.6s). Selecting `"2023-Q4"` renders empty state message `"Belum Ada Data Peta"` and `<p>Tidak ditemukan catatan realisasi pendapatan untuk periode ini.</p>`, accompanied by toast notification.
- `apps/web/e2e/map-dashboard.spec.ts:71` ("should show error state and allow retry when period loading fails (2023-Q3)"):
  - **Result**: PASSED (9.9s). Selecting `"2023-Q3"` renders error banner `"Terjadi Kendala Memuat Layer Map"`. Clicking retry button `"Muat Ulang Data Peta"` successfully resets period to active state.
- `apps/web/e2e/release-hardening.spec.ts:1-70` (Map layer initialization, legend toggle, region feature selection):
  - **Result**: PASSED (5.1s - 5.6s).

#### Journey 2: Dropzone File Uploads (CSV, XLSX, Invalid PDF Rejection) — **PASS (CONFIRMED)**
- `apps/web/e2e/upload-feature.spec.ts:16` ("should upload valid Excel file, display progress and summary, and allow reset"):
  - **Result**: PASSED (8.0s). Dropzone accepts `.csv`/`.xlsx` via DataTransfer API, displays success toast `"Unggah berhasil diproses."`, renders validation summary card `"Validasi Berkas Berhasil (186 baris)"`, allows expanding `"Lihat Baris Error"` (`"Rincian Baris Tidak Valid"`), and resets cleanly via `"Unggah Berkas Baru"`.
- `apps/web/e2e/upload-feature.spec.ts:60` ("should show error toast when invalid file extension is selected (.pdf)"):
  - **Result**: PASSED (5.9s). Selecting `invalid-doc.pdf` is rejected with error toast `"File tidak valid. Gunakan template Excel atau CSV."`.
- `apps/web/e2e/upload-warning.spec.ts:1-103` (Warning flag validation across past, current, future, boundary periods):
  - **Result**: PASSED (All 10 tests passed). Ingestion correctly tags future period records (`> CURRENT_DATE`) with `meta: { forecast: false }` without failing valid historic data.

#### Journey 3: Report Export Jobs and Status Polling — **FAIL (REGRESSIONS FOUND)**
- `apps/web/e2e/report-generation.spec.ts:194` (3.1: Enqueue PDF report job):
  - **Result**: PASSED (6.0s). `POST /api/v1/reports/export` with `format=pdf` returns HTTP 201, jobId, and queued status.
- `apps/web/e2e/report-generation.spec.ts:221` (3.2: Enqueue Excel report job):
  - **Result**: **FAILED (Verbatim error below)**:
    ```
    Error: expect(received).toBe(expected) // Object.is equality

    Expected: "excel"
    Received: "pdf"

      238 |
      239 |     expect(jobId).toBeDefined();
    > 240 |     expect(format).toBe("excel");
          |                    ^
      241 |     expect(period).toBe(TEST_PERIOD);
      242 |     expect(["queued", "processing", "completed"]).toContain(status);
      243 |   });
        at /home/noah/project/petakeu/apps/web/e2e/report-generation.spec.ts:240:20
    ```
- `apps/web/e2e/report-generation.spec.ts:248` (3.3: GET /api/v1/reports/:id allows polling job status until completion):
  - **Result**: **FAILED (Verbatim error below)**:
    ```
    Error: expect(received).toBe(expected) // Object.is equality

    Expected: 200
    Received: 404

      266 |       const pollRes = await fetchReportJob(page, jobId);
      267 |       expect(pollRes).not.toBeNull();
    > 268 |       expect(pollRes.status()).toBe(200);
          |                                ^
      269 |
      270 |       const pollBody = await pollRes.json();
      271 |       finalJob = pollBody.data ?? pollBody;
        at /home/noah/project/petakeu/apps/web/e2e/report-generation.spec.ts:268:32
    ```
- `apps/web/e2e/real-world-flow.spec.ts:157` (4.5: System resilience across invalid report IDs):
  - **Result**: **FAILED**. `expect([404, 400]).toContain(badReportRes.status())` received status 200 for simulated bad report request.

#### Journey 4: Keyboard Tab Navigation and Responsive Sidebar Collapsing — **PASS (CONFIRMED)**
- `apps/web/e2e/navigation-and-pages.spec.ts:68` ("should toggle sidebar collapse state"):
  - **Result**: PASSED (5.5s). Clicking `[data-testid="sidebar-toggle-button"]` collapses desktop sidebar from `w-72` to `w-20`.
- `apps/web/e2e/accessibility-release.spec.ts:82` ("keyboard navigation reaches visible controls and exposes a visible focus indicator"):
  - **Result**: PASSED (17.3s desktop, 7.8s tablet, 5.4s mobile). Tabbing reaches > 3 interactive elements, all visible with valid outline focus styles.
- `apps/web/e2e/accessibility-release.spec.ts:164` ("mobile navigation drawer opens, closes with Escape, and restores trigger focus"):
  - **Result**: PASSED (6.6s tablet, 5.4s mobile). Menu trigger opens drawer, Escape key closes drawer and returns focus to menu button.
- `apps/web/e2e/navigation-and-pages.spec.ts:1-67` (Semantic page shells & direct navigation):
  - **Result**: PASSED for `/map`, `/analytics`, `/reports`, `/uploads`, `/about`.

---

### 1.3 Additional Observed E2E Test Failures

1. **`apps/web/e2e/region-summary-caching.spec.ts:209` (Test 2.3: Repeated summary requests cache consistency)**:
   - **Error**:
     ```
     Error: expect(received).toBe(expected) // Object.is equality
     Expected: "2026-08-27T07:12:51.169Z"
     Received: "2026-08-27T07:12:51.287Z"
     Location: apps/web/e2e/region-summary-caching.spec.ts:228:31
     ```
   - **Cause**: `apps/web/src/mocks/handlers.ts:416` generates `lastUpdated: nowIso()` dynamically on every request instead of maintaining a stable cached timestamp.

2. **`apps/web/e2e/health-readiness.spec.ts:222` (Test 2.4: Non-existent health paths return 404 cleanly)**:
   - **Error**:
     ```
     Error: expect(received).toBe(expected) // Object.is equality
     Expected: 404
     Received: 200
     Location: apps/web/e2e/health-readiness.spec.ts:227:30
     ```
   - **Cause**: In `apps/web/vite.config.ts:9`, `const url = req.url?.split("?")[0]` strips query parameters so `/healthz?format=xml` matches `/healthz` and returns 200 instead of 404.

3. **`apps/web/e2e/accessibility-release.spec.ts:201` (Axe WCAG scan on `/map` and `/analytics`)**:
   - **Error**: Test timeout of 30,000ms exceeded or frame crash during deep recursive SVG/Leaflet node analysis in Chromium Desktop.

---

## 2. Logic Chain

1. **Root Cause Analysis for Report Export Format Mismatch (`report-generation.spec.ts:221`)**:
   - Observation: When Playwright Node test runner sends `POST /api/v1/reports/export` with `{ format: "excel" }`, the response returned `{ data: { format: "pdf" } }`.
   - Inspection: `apps/web/vite.config.ts` lines 66-83:
     ```ts
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
             format: "pdf", // <-- BUG: Hardcoded to "pdf" regardless of request payload
             status: "queued"
           }
         })
       );
       return;
     }
     ```
   - Inference: The Vite middleware plugin intercepts the POST request and returns a static JSON string containing `format: "pdf"`, ignoring whether the client requested `format: "excel"`.

2. **Root Cause Analysis for Report Status Polling 404 (`report-generation.spec.ts:248`)**:
   - Observation: When Playwright executes `fetchReportJob(page, "mock-report-job-node")` targeting `http://localhost:5175/api/v1/reports/mock-report-job-node`, the server returns HTTP 404 Not Found.
   - Inspection: `apps/web/vite.config.ts` defines middleware handlers only for `/healthz`, `POST /api/uploads`, and `POST /api/reports/export`. It contains NO route handler for `GET /api/reports/:id` or `GET /api/v1/reports/:id`.
   - Inference: Because `devMockServerPlugin` handles the initial POST request, the generated `jobId` is `"mock-report-job-node"`. When the test polls `GET /api/v1/reports/mock-report-job-node`, the request falls through to Vite's static file server, returning 404.

3. **Root Cause Analysis for Region Summary Cache Timestamp Inconsistency (`region-summary-caching.spec.ts:209`)**:
   - Observation: Second query to `/api/v1/regions/3301/summary` returned a timestamp 118ms newer than the first query.
   - Inspection: `apps/web/src/mocks/handlers.ts:416`:
     ```ts
     return res(
       ctx.status(200),
       ctx.set("X-Cache", "HIT"),
       ctx.json({
         region,
         ...summary,
         lastUpdated: nowIso(), // <-- Recalculated on every request
         reportUrl: `https://storage.petakeu.local/reports/${id}-${Date.now()}.pdf`
       })
     );
     ```
   - Inference: The handler claims cache HIT (`X-Cache: HIT`) but generates a fresh `nowIso()` timestamp on every call, breaking the cache idempotency assertion `expect(body2.lastUpdated).toBe(body1.lastUpdated)`.

---

## 3. Caveats

- **Live Backend Tests**: Tests requiring live PostgreSQL/PostGIS, Redis, and MinIO storage instances (`PETAKEU_INTEGRATION=1` or `PETAKEU_RUN_LIVE_E2E=1`) are skipped safely during isolated frontend test runs.
- **Axe Scan Performance**: Axe-core full DOM accessibility analysis on complex Leaflet GeoJSON layers is computationally intensive and can exceed default 30s timeouts on cold browser boots.

---

## 4. Conclusion

### Final Verdict: **REJECT**

While 3 out of 4 user journey interactions (**Map exploration & period switching**, **Dropzone file upload & rejection**, and **Keyboard navigation & sidebar collapsing**) are fully operational and verified, the release cannot be approved due to functional regressions in **Report Export & Status Polling** and cache consistency:

1. **Excel Report Export Broken**: `apps/web/vite.config.ts` returns `format: "pdf"` when `format: "excel"` is requested.
2. **Report Status Polling Broken**: `apps/web/vite.config.ts` lacks a route handler for `GET /api/v1/reports/:id`, causing polling to fail with HTTP 404.
3. **Region Summary Cache Inconsistency**: `apps/web/src/mocks/handlers.ts` returns non-deterministic `lastUpdated` timestamps on repeated cached queries.
4. **Healthz Query Stripping**: `apps/web/vite.config.ts` returns 200 on invalid query strings `/healthz?format=xml`.

### Required Fixes for Approval:
1. Update `apps/web/vite.config.ts` `devMockServerPlugin` to:
   - Parse request body format (`pdf` vs `excel`) and return matching format in `POST /api/reports/export`.
   - Add a `GET /api/reports/:id` and `GET /api/v1/reports/:id` middleware handler returning HTTP 200 with `{ data: { jobId, status: "completed", format, ... } }`.
   - Only match exact `/healthz` without invalid query strings.
2. Update `apps/web/src/mocks/handlers.ts:416` to store and reuse a static/cached timestamp per region instead of calling `nowIso()` dynamically.

---

## 5. Verification Method

### How to Independently Verify:

Run the full Playwright E2E suite from repository root:
```bash
pnpm --filter @petakeu/web test:e2e
```

### Specific Target Specs to Validate:
```bash
# 1. Map Exploration & Period Switching:
pnpm --filter @petakeu/web exec playwright test e2e/map-dashboard.spec.ts

# 2. Dropzone Uploads & Rejection:
pnpm --filter @petakeu/web exec playwright test e2e/upload-feature.spec.ts e2e/upload-warning.spec.ts

# 3. Report Export & Polling:
pnpm --filter @petakeu/web exec playwright test e2e/report-generation.spec.ts

# 4. Navigation & Keyboard Accessibility:
pnpm --filter @petakeu/web exec playwright test e2e/navigation-and-pages.spec.ts
```

### Invalidation Conditions:
- Any test failure in `pnpm --filter @petakeu/web test:e2e`.
- Report export returning incorrect MIME/format or failing on status polling.
