# Handoff Report: Playwright E2E Verification & Monorepo Build Gates

## 1. Observation

### 1.1 Playwright E2E Setup & Test Suites (`apps/web/e2e/`)
- **Configuration File**: `apps/web/playwright.config.ts`
  - Lines 3–4: `const externalBaseURL = process.env.PETAKEU_E2E_BASE_URL ?? process.env.PLAYWRIGHT_BASE_URL; const baseURL = externalBaseURL ?? "http://localhost:5175";`
  - Lines 27–55 define three test projects:
    1. `chromium-desktop`: Runs all tests in `./e2e` at viewport `1440x900`, `workers: 1`, `retries: 0`.
    2. `chromium-tablet`: Filters `testMatch: /accessibility-release\.spec\.ts/` at viewport `768x1024`.
    3. `chromium-mobile`: Filters `testMatch: /accessibility-release\.spec\.ts/` at viewport `360x800`.
  - Lines 56–67 define `webServer`:
    ```ts
    webServer: externalBaseURL
      ? undefined
      : {
          command: "pnpm --filter @petakeu/web dev --host 0.0.0.0",
          cwd: ".",
          url: baseURL,
          reuseExistingServer: true,
          timeout: 60000,
          env: {
            VITE_USE_MSW: process.env.VITE_USE_MSW ?? "true"
          }
        }
    ```
- **Test Spec Inventory** (13 test files found in `apps/web/e2e/`):
  1. `map-dashboard.spec.ts` (99 lines): Tests map loading, region info card, quantile legend, period switching (`2024-Q2`), empty state (`2023-Q4`), error state & retry (`2023-Q3`).
  2. `upload-feature.spec.ts` (81 lines): Tests dropzone, CSV/Excel file upload via DataTransfer API, progress/summary inspection, error details expansion, and invalid file extension `.pdf` toast error.
  3. `upload-warning.spec.ts` (227 lines): Validates R1 Future Period Warning Flag (`forecast=false`) across past, current, future (`2026-09`), and boundary periods.
  4. `report-generation.spec.ts` (382 lines): Validates R2 Report generation pipeline: `POST /api/v1/reports/export` (PDF/Excel), status polling (`/api/v1/reports/:id`), summary JSON metadata, and download URL accessibility.
  5. `real-world-flow.spec.ts` (186 lines): Multi-step user journeys covering map exploration, multi-region analytics, report export, upload cache invalidation, and edge-case resilience.
  6. `choropleth-caching.spec.ts` (307 lines): FeatureCollection schema verification, `level` (1 vs 2) and `parent` query parameters, public mode privacy masking, and Redis caching timing.
  7. `region-summary-caching.spec.ts` (298 lines): Regional summary metrics, 15% Pemda formula integrity (`netAmount = totalAmount - cut15Amount`), `from`/`to` boundary filtering, and cache invalidation.
  8. `health-readiness.spec.ts` (276 lines): Comprehensive `GET /healthz` probing for database/PostGIS, Redis, MinIO storage, and BullMQ queues (uploadQueue & reportQueue).
  9. `accessibility-release.spec.ts` (249 lines): Route entry/refresh for `/map`, `/analytics`, `/reports`, `/uploads`, `/about`, keyboard focus indicator tab traversal, reduced-motion media query, and WCAG 2.1 AA axe scans.
  10. `release-hardening.spec.ts` (120 lines): Map initialization without fixed sleeps, legend layer toggle, feature click detail, CSV template download, and role-aware UI surface checks.
  11. `reports-and-about.spec.ts` (63 lines): Metric card rendering, Recharts financial trend, About page documentation, and mobile sidebar drawer.
  12. `navigation-and-pages.spec.ts` (85 lines): Route switching across default pages, screenshot captures, and sidebar collapse toggle.
  13. `security-contracts.spec.ts` (180 lines): Opt-in live RBAC security checks requiring `PETAKEU_RUN_LIVE_E2E=1`, testing public, viewer, operator, and admin token permissions.

### 1.2 Prerequisites for Running E2E Tests
- **Current Behavior**: Running `pnpm test:e2e` without external services spawns only Vite dev server with `VITE_USE_MSW="true"`.
- **Live vs Mocked Requirements**:
  - In MSW-only mode: Node.js fetch requests from Playwright `request` object (in `upload-warning.spec.ts`, `health-readiness.spec.ts`, `security-contracts.spec.ts`) bypass the browser Service Worker and fail against the Vite dev server with HTTP 404.
  - In Live Integration & Full E2E mode:
    1. Docker Compose backing services must be running:
       - PostgreSQL 16 + PostGIS 3.4 (port `5432`)
       - Redis 7 (port `6379`)
       - MinIO Object Storage (ports `9000` / `9001`)
    2. Database migrated and seeded: `pnpm seed:regions`
    3. Backend Express server running on port `3001` (`apps/server`)
    4. Frontend Vite server running on port `5175` with `VITE_USE_MSW="false"`
    5. Environment variables set:
       - `PETAKEU_E2E_BASE_URL="http://localhost:5175"`
       - `PETAKEU_E2E_API_BASE_URL="http://localhost:3001/api"`
       - `PETAKEU_RUN_LIVE_E2E=1`
       - `AUTH_SECRET`, `PETAKEU_PUBLIC_TOKEN`, `PETAKEU_VIEWER_TOKEN`, `PETAKEU_OPERATOR_TOKEN`, `PETAKEU_ADMIN_TOKEN`

### 1.3 Quality Gate Execution Results
1. **`pnpm lint` (`turbo run lint`)**:
   - Exit code: `0`
   - Output: `@petakeu/server:lint` (4 warnings, 0 errors), `@petakeu/web:lint` (12 warnings, 0 errors).
2. **`pnpm typecheck` (`turbo run typecheck`)**:
   - Exit code: `0`
   - Output: Both `@petakeu/server` and `@petakeu/web` passed TypeScript typechecking without errors.
3. **`pnpm build` (`turbo run build`)**:
   - Exit code: `0`
   - Output:
     - `@petakeu/server`: `tsc -p tsconfig.json` generated `dist/index.js`.
     - `@petakeu/web`: `tsc -b && vite build` generated `dist/index.html`, `dist/assets/index-*.css` (97.51 kB), and `dist/assets/index-*.js` (1,055.44 kB).
4. **`pnpm test` (`turbo run test`)**:
   - Exit code: `0`
   - Output:
     - `@petakeu/web`: Vitest unit tests passed.
     - `@petakeu/server`: 15 test files passed (67 passed, 4 skipped).
     - Reason for 4 skipped tests: `report-generation.integration.test.ts` (2 tests) and `upload-pipeline.integration.test.ts` (2 tests) check `PETAKEU_INTEGRATION=1` via `probeIntegrationInfrastructure()` in `apps/server/src/test-utils/integration.ts:41` (`"set PETAKEU_INTEGRATION=1 to enable real PostgreSQL/Redis/MinIO integration tests"`).
5. **`pnpm test:e2e` (`playwright test` in unconfigured default environment)**:
   - Output: `82 passed, 17 skipped, 28 failed`.
   - Reason: MSW-only mode lacks live backend services (`/healthz`, `/api/v1/*`, BullMQ queues) and has minor DOM selector / format expectations detailed below.

### 1.4 Detailed Root Cause Analysis of E2E Failures in Default Environment
1. **Direct API / Healthz Probing in Node Context**:
   - `health-readiness.spec.ts` (12 tests) and `upload-warning.spec.ts` (Tier 1.5) send direct HTTP requests via Playwright's `request` fixture. In MSW mode, Node-level requests bypass browser service workers and hit Vite dev server directly (returning 404).
2. **MSW Path Routing Differences**:
   - `apps/web/src/mocks/handlers.ts` defines routes under `/api/*` (e.g. `rest.get("/api/geo/choropleth")`, `rest.get("/api/regions/:id/summary")`).
   - Several E2E tests (`choropleth-caching.spec.ts`, `region-summary-caching.spec.ts`, `report-generation.spec.ts`) send requests to `/api/v1/geo/choropleth` and `/api/v1/regions/:id/summary`.
3. **Upload File Format Validation**:
   - `UploadPage.tsx:56-59` restricts accepted files to `.xlsx` and `.xls` (`isExcel(file)`), rejecting `.csv` with message `"Format tidak didukung. Gunakan file Excel .xlsx atau .xls."`.
   - `upload-feature.spec.ts:24` submits a CSV (`"test-data.csv"`) and expects `"Unggah berhasil diproses."` / `"Validasi Berkas Berhasil"`.
   - `upload-feature.spec.ts:74` expects `"File tidak valid. Gunakan template Excel atau CSV."` on invalid file selection.
4. **Button & Text Label Discrepancies**:
   - `release-hardening.spec.ts:62` queries button `"Download Template CSV"`, whereas `UploadPage.tsx:405` renders `"Download template Excel"`.
   - `navigation-and-pages.spec.ts:24` queries button `{ name: "Unggah" }`, whereas `Sidebar.tsx` and `config/routes.ts` use label `"Unggah Data Excel"`.
   - `navigation-and-pages.spec.ts:73` expects sidebar class `/w-72/`, while `Sidebar.tsx:41` uses `w-64` (and `w-20` when collapsed).
   - `map-dashboard.spec.ts:83` expects `"Terjadi Kendala Memuat Layer Map"` and button `"Muat Ulang Data Peta"`, while `MapPage.tsx:367,370` renders `"Gagal Memuat Layer Map"` and button `"Muat Ulang"`.
5. **No-Skips Release Gate Assertion (`scripts/assert-playwright-no-skips.mjs`)**:
   - In CI, `assert-playwright-no-skips.mjs` fails if any test status is `"skipped"`.
   - `accessibility-release.spec.ts` skips admin route check if `PETAKEU_ADMIN_TOKEN` is unset.
   - CI workflow `.github/workflows/ci.yml:115` explicitly uses `--grep-invert 'admin audit route remains|mobile navigation drawer'` to ensure zero skipped tests.

---

## 2. Logic Chain

1. **Gate Health**: The monorepo builds cleanly (`turbo run build`), passes typechecking (`turbo run typecheck`), passes linting (`turbo run lint`), and passes all unit tests (`turbo run test`).
2. **Server Integration Tests**: The 4 skipped server tests are gated by design behind `PETAKEU_INTEGRATION=1` in `apps/server/src/test-utils/integration.ts`. When Docker backing services (PostgreSQL/PostGIS, Redis, MinIO) are running, these tests execute end-to-end report generation and upload worker pipelines.
3. **E2E Strategy**: Playwright E2E tests serve two distinct verification targets:
   - *Deterministic Frontend UX Gates* (accessible routes, responsive layouts, theme switching, a11y): Run against Vite dev server (or CI with `--grep-invert`).
   - *Live Contract & Pipeline Gates* (caching, invalidation, healthz, upload processing, streaming export): Require Docker Compose backing services and the live Express server.
4. **Implementation Adjustments Needed**:
   - In `apps/web/src/pages/UploadPage.tsx`: allow `.csv` alongside `.xlsx` and align error message copy.
   - In `apps/web/src/mocks/handlers.ts`: alias `/api/v1/*` routes to `/api/*` handlers so mocked tests succeed against both URL patterns.
   - In `apps/web/src/pages/MapPage.tsx` and `Sidebar.tsx`: align state messages and accessibility attributes with test spec queries.

---

## 3. Caveats

- **Docker Environment**: Docker containers (PostgreSQL/PostGIS, Redis, MinIO) were not started during this survey phase to adhere to read-only investigation constraints.
- **Port Allocation**: Default E2E setup assumes backend on `http://localhost:3001` and frontend on `http://localhost:5175`. If ports are occupied, environment variables (`PETAKEU_E2E_BASE_URL`, `PORT`) must be explicitly passed.
- **No Source Code Changes Made**: This survey phase strictly documented observations and prepared the execution plan without modifying application code.

---

## 4. Conclusion

- Monorepo quality gates (`pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm test`) are **100% operational and passing**.
- Playwright E2E configuration and all 13 test specifications are well-structured, covering core user journeys (Map, Upload, Reports, Analytics, Healthz, RBAC).
- To achieve 100% passing E2E runs with zero skipped tests in subsequent milestones:
  1. Boot Docker Compose backing services (`docker-compose up -d`) and seed PostGIS (`pnpm seed:regions`).
  2. Start backend server with `PETAKEU_INTEGRATION=1`.
  3. Apply minor UI copy/format alignments in `UploadPage.tsx`, `MapPage.tsx`, and MSW `/api/v1` aliases.
  4. Run Playwright with appropriate environment flags or CI grep-inverts.

---

## 5. Verification Method & Step-by-Step Execution Plan

### Step-by-Step Verification Commands:

```bash
# 1. Monorepo Quality Gates Verification
pnpm lint
pnpm typecheck
pnpm build
pnpm test

# 2. Start Backing Infrastructure (for Milestone 2: Live Integration Tests)
docker compose up -d
pnpm --filter @petakeu/server seed:regions

# 3. Verify Live Server Integration Tests (0 skipped tests expected)
PETAKEU_INTEGRATION=1 pnpm --filter @petakeu/server test

# 4. Run Deterministic CI Playwright Gates (Milestone 3 / CI baseline)
pnpm --filter @petakeu/web exec playwright test \
  e2e/accessibility-release.spec.ts \
  e2e/release-hardening.spec.ts \
  --project=chromium-desktop \
  --project=chromium-tablet \
  --project=chromium-mobile \
  --grep-invert 'admin audit route remains|mobile navigation drawer'

# 5. Run Full End-to-End Test Suite against Live Server
PETAKEU_RUN_LIVE_E2E=1 \
PETAKEU_E2E_BASE_URL="http://localhost:5175" \
PETAKEU_E2E_API_BASE_URL="http://localhost:3001/api" \
pnpm --filter @petakeu/web test:e2e

# 6. Verify No-Skips Gate
node scripts/assert-playwright-no-skips.mjs apps/web/playwright-report/results.json
```

### Invalidation Conditions:
- Failure of `pnpm typecheck` or `pnpm build` across any package.
- Inability to connect to PostgreSQL/PostGIS, Redis, or MinIO when `PETAKEU_INTEGRATION=1`.
- Any non-zero exit code or skipped test in the release gate suite.
