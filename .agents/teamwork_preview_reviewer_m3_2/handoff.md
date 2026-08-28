# Handoff Report: Milestone 3 Review & Adversarial Analysis — E2E Verification & Mock Hardening

**Reviewer Agent**: `teamwork_preview_reviewer_m3_2`  
**Roles**: Reviewer, Critic  
**Working Directory**: `/home/noah/project/petakeu/.agents/teamwork_preview_reviewer_m3_2`  
**Workspace Root**: `/home/noah/project/petakeu`  
**Verdict**: **REQUEST_CHANGES**

---

## 1. Observation

### 1.1 Direct Observations & Evidence

1. **Monorepo Build Gate (`pnpm build`)**:
   - Command executed: `pnpm build` (`turbo run build`).
   - `@petakeu/server:build` (`tsc -p tsconfig.json`) passed.
   - `@petakeu/web:build` (`tsc -b && vite build`) **FAILED with exit code 2**.
   - Verbatim TypeScript compiler output:
     ```text
     vite.config.ts:2:29 - error TS2305: Module '"vitest/config"' has no exported member 'Plugin'.
     2 import { defineConfig, type Plugin } from "vitest/config";
                                   ~~~~~~
     vite.config.ts:7:21 - error TS7006: Parameter 'server' implicitly has an 'any' type.
     7     configureServer(server) {
                           ~~~~~~
     vite.config.ts:8:31 - error TS7006: Parameter 'req' implicitly has an 'any' type.
     8       server.middlewares.use((req, res, next) => {
                                     ~~~
     vite.config.ts:8:36 - error TS7006: Parameter 'res' implicitly has an 'any' type.
     8       server.middlewares.use((req, res, next) => {
                                          ~~~
     vite.config.ts:8:41 - error TS7006: Parameter 'next' implicitly has an 'any' type.
     8       server.middlewares.use((req, res, next) => {
                                               ~~~~
     Found 5 errors.
     ```

2. **Monorepo Typecheck Gate (`pnpm typecheck`)**:
   - Command executed: `pnpm typecheck` (`turbo run typecheck`).
   - Results: 2 successful, 0 failed (19.32s). Both `@petakeu/server` (`tsc --noEmit -p tsconfig.json`) and `@petakeu/web` (`tsc --noEmit -p tsconfig.json`) passed.
   - *Explanation*: `apps/web/tsconfig.json` only includes files in `src/`, whereas `apps/web/tsconfig.node.json` compiles `vite.config.ts` during `tsc -b` in the `build` script.

3. **Monorepo Lint Gate (`pnpm lint`)**:
   - Command executed: `pnpm lint` (`turbo run lint`).
   - Results: 2 successful, 0 errors, 16 warnings (12 in `@petakeu/web`, 4 in `@petakeu/server`).

4. **MSW Handlers & Route Aliasing (`apps/web/src/mocks/handlers.ts`)**:
   - Every `/api/*` endpoint is cleanly paired with its corresponding `/api/v1/*` route alias:
     - Regions: `/api/regions` & `/api/v1/regions` -> `handleGetRegions`
     - Choropleth: `/api/geo/choropleth` & `/api/v1/geo/choropleth` -> `handleGetChoropleth`
     - Region Summary: `/api/regions/:id/summary` & `/api/v1/regions/:id/summary` -> `handleGetRegionSummary`
     - Uploads: `/api/uploads` & `/api/v1/uploads` (POST, GET, template, ID, rows, patch, confirm, cancel)
     - Aliases & Reporting Matrix: `/api/region-aliases`, `/api/analytics/reporting-matrix/:regionId/:period`
     - Reports: `/api/reports/export`, `/api/reports`, `/api/reports/:id` (POST & GET)
     - Healthz: `/healthz`, `/api/healthz`, `/api/v1/healthz` -> `handleGetHealthz`
     - Mock download assets: `https://storage.petakeu.local/reports/:filename` and `/api/reports/download/:filename`
     - FiscalView, RankFin, DefisitWatch endpoints.

5. **Core User Journey Alignments**:
   - **Map Exploration (`apps/web/src/pages/MapPage.tsx`)**:
     - Leaflet GeoJSON layer rendering with 4-quantile legend mapping.
     - Period selection dropdown with aria-label `"Pilih periode"` (`Topbar.tsx:114`).
     - Empty state rendering (`"Belum Ada Data Peta"` and `"Tidak ditemukan catatan realisasi pendapatan untuk periode ini."` for `2023-Q4`).
     - Error state and retry button (`"Terjadi Kendala Memuat Layer Map"`, `"Muat Ulang Data Peta"` for `2023-Q3`).
     - Sidebar responsive dimensions (`w-72` expanded, `w-20` collapsed).
   - **Data Upload Flow (`apps/web/src/pages/UploadPage.tsx`)**:
     - File dropzone accepts `.xlsx`, `.xls`, `.csv` (`"Tarik berkas Excel / CSV ke area ini"`).
     - Format validation error toast for invalid extensions (`"File tidak valid. Gunakan template Excel atau CSV."`).
     - Upload progress and validation summary card (`"Unggah berhasil diproses."`, `"Validasi Berkas Berhasil (186 baris)"`).
     - Inspectable error rows list (`"Lihat Baris Error"` / `"Rincian Baris Tidak Valid"`).
     - Reset button (`"Unggah Berkas Baru"`).
     - CSV template download (`"Download Template CSV"` -> `template_laporan_petakeu.csv`).
   - **Reports Generation (`apps/web/src/mocks/handlers.ts`, `apps/web/e2e/report-generation.spec.ts`)**:
     - Job enqueueing (`POST /api/v1/reports/export`), status polling (`GET /api/v1/reports/:id`), JSON summary metadata, and download headers (`application/pdf`, Excel spreadsheet MIME).

---

## 2. Logic Chain

1. **Integrity & Authenticity Assessment**:
   - Code inspection reveals real business logic (dynamic quantile categorization, period date range validation, cryptographic SHA-256 duplicate checking, staged row revision conflict handling, and realistic mock status lifecycles).
   - No hardcoded test bypasses, dummy facade shims, or integrity violations were detected.
2. **Build Gate Invalidation**:
   - Monorepo acceptance criterion R4 explicitly mandates: *"Ensure `pnpm lint`, `pnpm typecheck`, and `pnpm build` pass across all packages in the monorepo."*
   - In `apps/web/vite.config.ts`, importing `Plugin` from `"vitest/config"` instead of `"vite"` causes TS2305, and missing parameter type annotations under `strict: true` / `noImplicitAny: true` cause TS7006 under `tsc -b`.
   - As a direct result, `pnpm build` fails, blocking deployment and CI verification pipelines.
3. **Remediation Feasibility**:
   - The fix in `apps/web/vite.config.ts` is straightforward:
     - Import `defineConfig` from `"vitest/config"`.
     - Import `type Plugin`, `type ViteDevServer`, `type Connect` from `"vite"`.
     - Import `type ServerResponse` from `"node:http"`.
     - Type `configureServer(server: ViteDevServer)` and `(req: Connect.IncomingMessage, res: ServerResponse, next: Connect.NextFunction)`.

---

## 3. Caveats

- **Opt-in Live RBAC Contracts**: `security-contracts.spec.ts` safely skips when live JWT environment variables (`PETAKEU_RUN_LIVE_E2E=1`) are omitted.
- **Node Request Middleware Scope**: `devMockServerPlugin` in `vite.config.ts` handles direct Node HTTP requests from Playwright fixtures for `/healthz`, `POST /api/uploads`, and `POST /api/reports/export`. Browser `fetch` calls are handled by MSW service worker.

---

## 4. Conclusion & Verdict

**Verdict**: **REQUEST_CHANGES**

### Findings Summary

#### [Critical] Finding 1: Monorepo Build Failure (`pnpm build` fails on `@petakeu/web`)
- **What**: `tsc -b` fails during `pnpm build` with 5 TypeScript errors in `vite.config.ts`.
- **Where**: `apps/web/vite.config.ts:2, 7, 8`.
- **Why**: `Plugin` is not exported by `"vitest/config"` (TS2305), and `server`, `req`, `res`, `next` have implicit `any` types (TS7006).
- **Suggestion**:
  ```ts
  import react from "@vitejs/plugin-react";
  import { defineConfig } from "vitest/config";
  import type { Plugin, ViteDevServer, Connect } from "vite";
  import type { ServerResponse } from "node:http";

  function devMockServerPlugin(): Plugin {
    return {
      name: "dev-mock-server",
      configureServer(server: ViteDevServer) {
        server.middlewares.use((req: Connect.IncomingMessage, res: ServerResponse, next: Connect.NextFunction) => {
          // ... middleware logic ...
        });
      }
    };
  }
  ```

#### [Minor] Finding 2: Unused Variable Warnings in UI Components
- **What**: 12 ESLint unused variable warnings in `Sidebar.tsx`, `Topbar.tsx`, and `MapPage.tsx`.
- **Where**:
  - `apps/web/src/components/dashboard/Sidebar.tsx:5-10` (`BarChart3`, `Trophy`, `AlertTriangle`, `UploadCloud`, `FileText`, `Info`)
  - `apps/web/src/components/dashboard/Topbar.tsx:21, 25` (`title`, `onOpenSettings`)
  - `apps/web/src/pages/MapPage.tsx:12, 14, 16, 17` (`ShieldCheck`, `CheckCircle2`, `Landmark`, `LayersIcon`)
- **Suggestion**: Remove unused imports and prefix unused interface properties with `_`.

---

## 5. Verification Method

### Step-by-Step Verification for Worker:

1. **Apply the type fix in `apps/web/vite.config.ts`**.
2. **Execute Monorepo Quality Gates**:
   ```bash
   pnpm typecheck
   pnpm lint
   pnpm build
   ```
3. **Execute E2E and Unit Test Suites**:
   ```bash
   pnpm --filter @petakeu/web test
   pnpm --filter @petakeu/server test
   pnpm --filter @petakeu/web test:e2e
   ```
4. **Invalidation Condition**: Any non-zero exit code on `pnpm build`, `pnpm typecheck`, `pnpm lint`, or test suites.
