# Architecture & Test Environment Survey Report

**Project**: Petakeu (Peta Interaktif Pemasukan Daerah)  
**Surveyed By**: `teamwork_preview_explorer_survey_3`  
**Date**: 2026-08-11  

---

## 1. Executive Summary

This survey provides a comprehensive analysis of the Petakeu monorepo architecture, testing infrastructure, build setup, database migration system, and Redis caching/report generation environment. Petakeu is an Indonesian regional fiscal monitoring platform built using a monorepo architecture powered by **Turborepo** and **pnpm workspaces**.

### Core Architecture Findings:
- **Frontend (`apps/web`)**: React 18 + Vite, Tailwind CSS v4, React Query v5, Leaflet / React-Leaflet, Recharts, Radix UI. Tested via Vitest for components and Playwright (25 test cases across 6 spec files) for E2E.
- **Backend (`apps/server`)**: Express 4 + TypeScript (strict mode), PostgreSQL 16 + PostGIS 3.4, Redis 4.6 + BullMQ 6.0, MinIO S3 storage, OpenTelemetry instrumentation. Tested via Vitest (unit & API route tests).
- **Database & Migrations**: Custom transactional migration runner in `apps/server/src/db/migrate.ts` tracking applied migrations in `_migrations`. Materialized view `mv_payments_with_cut` aggregates payments and pre-computes 15% fiscal cuts and NTILE(5) quantile classing.
- **Redis Caching**: Implemented in `apps/server/src/db/redis.ts` using `getCached<T>()` and pattern invalidation. Choropleth GeoJSON (`petakeu:geo:choropleth:...`) and Region Summaries (`petakeu:regions:regions:summary:...`) utilize this layer.
- **Report Generation**: Background worker (`report-worker.ts`) processes PDF (via `pdfkit`) and Excel (via `exceljs`) export jobs submitted via BullMQ queue (`report-generation`) and uploaded to MinIO storage.

---

## 2. Monorepo Structure & Build Environment

### 2.1 Workspace Configuration
- **Package Manager**: `pnpm@8.15.4` (configured in root `package.json`).
- **Workspaces**: Defined in `pnpm-workspace.yaml` as `apps/*` and `packages/*`.
  - `apps/web`: `@petakeu/web` (ESM module)
  - `apps/server`: `@petakeu/server` (CommonJS module)
- **Turborepo Orchestrator**: `turbo^1.13.4` with pipeline configured in `turbo.json`:
  - `build`: depends on `^build`, outputs `dist/**`, `build/**`, `coverage/**`.
  - `typecheck`: depends on `^typecheck`.
  - `test`: depends on `^test`, outputs `coverage/**`.
  - `dev`: non-cached, persistent execution.

### 2.2 Root Scripts & Workflow Commands
```json
{
  "dev": "turbo run dev --no-cache --parallel",
  "dev:web": "pnpm --filter @petakeu/web dev",
  "dev:server": "pnpm --filter @petakeu/server dev",
  "build": "turbo run build",
  "build:web": "pnpm --filter @petakeu/web build",
  "build:server": "pnpm --filter @petakeu/server build",
  "lint": "turbo run lint",
  "typecheck": "turbo run typecheck",
  "test": "turbo run test",
  "test:e2e": "pnpm --filter @petakeu/web test:e2e"
}
```

### 2.3 Code Layout, Linting & Type Checking Rules
- **TypeScript Configuration**:
  - `tsconfig.base.json`: Base rules (ES2021 target, CommonJS module resolution, strict mode, json modules enabled). Path mappings:
    - `@web/*` -> `apps/web/src/*`
    - `@server/*` -> `apps/server/src/*`
  - `apps/server/tsconfig.json` & `apps/web/tsconfig.json` extend `tsconfig.base.json`.
- **ESLint Config (`.eslintrc.cjs`)**:
  - ESLint v8.57.0 with `@typescript-eslint`, `eslint-plugin-import`, `eslint-plugin-react`, `eslint-plugin-react-hooks`.
  - Overrides for `apps/web/**/*.{ts,tsx}` and `apps/server/**/*.ts`.
- **Prettier Config (`.prettierrc`)**:
  - `singleQuote: false`, `semi: true`, `trailingComma: "none"`, `printWidth: 100`.

---

## 3. Backend Test Environment & Infrastructure (`apps/server`)

### 3.1 Vitest Unit & Integration Setup
- **Config file**: `apps/server/vitest.config.ts`
  - `environment: "node"`
  - `include: ["src/**/*.test.ts"]`
  - `passWithNoTests: true`
- **Test Execution**: `pnpm --filter @petakeu/server test` (invokes `vitest run`).

### 3.2 Key Server Test Suites
1. **Health Probes & Liveness Suite** (`apps/server/src/utils/health.test.ts`):
   - Mocks `pg.Pool`, `getRedisClient()`, `checkStorageHealth()`, `uploadQueue`, `reportQueue`.
   - Tests `checkDatabase()`, `checkRedis()`, `checkStorage()`, `checkQueue()`, `performHealthChecks()`, `performReadinessChecks()`, and `withTimeout()`.
   - Verifies HTTP status codes on `GET /healthz`:
     - Returns **HTTP 200 OK** when all checks are `healthy` or `degraded` (e.g., storage/queue failure).
     - Returns **HTTP 503 Service Unavailable** when critical dependencies (PostgreSQL or Redis) are `unhealthy`.
   - Verifies `GET /health` returns **HTTP 200 OK**.
2. **Upload Processing & Future Period Warning Flag Suite** (`apps/server/src/jobs/upload-worker.test.ts`):
   - Tests helper function `isFuturePeriod(period, referenceDate)`:
     - `2025-12`, `2024-01`, `2026-01`, `2026-08` (current month) -> returns `false`.
     - `2026-09`, `2026-12`, `2027-01`, `2030-05` -> returns `true`.
     - Invalid period formats (`invalid`, `2026-13`, `2026-00`, `2026-8`, `2026-08-01`) -> returns `false`.
   - Tests `processUpload` bulk payment ingestion:
     - Verifies future period rows are tagged with `meta: { forecast: false }`.
     - Verifies valid historic rows receive `meta: {}`.
     - Verifies SQL contains `meta` column and `ON CONFLICT (region_id, period, source) DO UPDATE SET meta = EXCLUDED.meta`.
3. **Geo & Choropleth Service Suite** (`apps/server/src/services/geo-service.test.ts`):
   - Tests quantile legend generation and data sanitization for `publicMode`.

### 3.3 Database & Redis Test Mocking Strategy
- Server unit tests currently isolate components using `vi.mock()` for:
  - `../db/postgres` (`getPgPool()`)
  - `../db/redis` (`getRedisClient()`)
  - `../services/storage-service` (`checkStorageHealth()`)
  - BullMQ Queues (`uploadQueue`, `reportQueue`)
- Local development/testing environment relies on Docker services defined in `docker-compose.dev.yml`:
  - PostgreSQL 16 + PostGIS 3.4 (`localhost:5432`, db: `petakeu`)
  - Redis 7 (`localhost:6379`)
  - MinIO S3 (`localhost:9000`, console: `localhost:9001`)

---

## 4. Frontend & E2E Test Infrastructure (`apps/web`)

### 4.1 Playwright E2E Setup
- **Config file**: `apps/web/playwright.config.ts`
  - `testDir: "./e2e"`
  - `baseURL: "http://localhost:5175"`
  - `workers: 1`, `fullyParallel: false`
  - `webServer`: automatically runs `"pnpm dev"` from root to serve frontend at port 5175 and backend at port 3001.
- **Execution Command**: `pnpm --filter @petakeu/web test:e2e` or `npx playwright test`.

### 4.2 Spec Files & Test Coverage
| Spec File | Target Feature | Coverage Summary |
|-----------|----------------|------------------|
| `apps/web/e2e/health-readiness.spec.ts` | R2 Readiness Checks (`GET /healthz`) | 12 test cases (Tiers 1-4) covering status codes, JSON schema, database/redis/storage/queue component details, 503 failure handling. |
| `apps/web/e2e/upload-warning.spec.ts` | R1 Future Period Warning Tag | 13 test cases (Tiers 1-4) verifying period validation, `forecast=false` tag assignment, boundary dates, and non-blocking ingestion. |
| `apps/web/e2e/map-dashboard.spec.ts` | Choropleth Map & Period Filters | Period selection (`2024-Q2`, `2024-Q3`), empty states (`2023-Q4`), error retry handling (`2023-Q3`), screenshot captures. |
| `apps/web/e2e/reports-and-about.spec.ts` | Reports Summary & Navigation | KPI metrics cards, Recharts trend area chart, regional breakdown table, mobile navigation drawer. |
| `apps/web/e2e/upload-feature.spec.ts` | Data Upload Form & Status | File dropzone upload, status polling, error table display. |
| `apps/web/e2e/navigation-and-pages.spec.ts` | Core Navigation | Route transitions between Map, Admin, Reports, and About pages. |

### 4.3 Frontend API Integration Architecture
- API Client defined in `apps/web/src/api/client.ts` using `buildUrl()` from `apps/web/src/config/api.ts`.
- Core endpoints:
  - `GET /api/v1/geo/choropleth?period=...`: fetched via `useChoropleth(period)` hook (React Query `staleTime: 2min`).
  - `GET /api/v1/regions/:id/summary`: fetched via `useRegionSummary({ regionId, from, to })` hook.
  - `POST /api/v1/reports/export`: enqueues report job via `apiClient.createReport()`.
  - `GET /api/v1/reports`: polled every 6 seconds via `useReportJobs()` hook.

---

## 5. Database Migration System & Materialized Views

### 5.1 Migration Files (`apps/server/migrations/`)
1. `001_init.sql`:
   - Enables `postgis` extension.
   - Creates `regions` table (spatial boundary polygons with `GEOMETRY(MultiPolygon, 4326)`, GIST spatial index).
   - Creates `payments` table (stores revenue payments with `meta JSONB DEFAULT '{}'::jsonb`, unique index `(region_id, period, source)`).
   - Creates materialized view `mv_payments_with_cut`:
     - Pre-aggregates monthly payments per region.
     - Computes `cut_amount = amount * 0.15` and `net_amount = amount - amount * 0.15`.
     - Computes quantile `class_index` (0 to 4) using `NTILE(5) OVER (PARTITION BY period ORDER BY amount) - 1`.
     - Includes JSONB `bins` array with quantile min/max boundaries.
     - Has unique index `mv_payments_with_cut_idx ON (region_id, period)`.
   - Creates SQL helper function `refresh_mv_payments_with_cut()` performing `REFRESH MATERIALIZED VIEW CONCURRENTLY mv_payments_with_cut`.
2. `002_uploads_reports.sql`:
   - Creates `uploads` table (file hash deduplication, parsing status, error JSONB).
   - Creates `report_jobs` table (period, region_ids array, format `pdf`|`excel`, status, download_url, expires_at 24h interval).
3. `003_gamification.sql`:
   - Creates `rankfin_badges`, `rankfin_scores`, `rankfin_challenges`, `rankfin_earned_badges`, `rankfin_hall_of_fame`.
4. `004_audit_logs.sql`:
   - Creates `audit_logs` table (user action tracking, IP address, user agent, endpoint, details JSONB).

### 5.2 Migration Runner Execution (`apps/server/src/db/migrate.ts`)
- Migration execution is invoked on server startup (`main()` in `apps/server/src/index.ts`).
- Checks `_migrations` tracking table (`name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ`).
- Wraps each SQL file execution inside a transaction (`BEGIN` ... `COMMIT` / `ROLLBACK`).

### 5.3 Materialized View Refresh Mechanism
- **Upload Worker Refresh**: In `apps/server/src/jobs/upload-worker.ts`, after bulk upserting payments, calls `SELECT refresh_mv_payments_with_cut()`.
- **Scheduled Cron Refresh**: In `apps/server/src/jobs/mv-refresh-cron.ts`, `node-cron` schedules `*/15 * * * *` (every 15 minutes) to run `SELECT refresh_mv_payments_with_cut()`.

---

## 6. Feature Deep-Dive: Redis Caching & Invalidation (R1)

### 6.1 Caching Implementation (`apps/server/src/db/redis.ts`)
- Uses official Node `redis` client (`getRedisClient()`).
- `getCached<T>(key, fetchFn, options)`:
  - Constructs key: `${options.keyPrefix || 'petakeu'}:${key}`.
  - Checks Redis cache. On hit: parses JSON and increments `cacheHits` metric.
  - On miss: calls `fetchFn()`, sets cache with `TTL` (default 300s), and increments `cacheMisses` metric.
- `invalidateCacheByPrefix(prefix)`: purges Redis keys matching `petakeu:${prefix}*`.

### 6.2 Service Integration
- **Choropleth GeoJSON Cache** (`geo-service.ts`):
  - Redis Key: `petakeu:geo:choropleth:{period}:[public]:[level]:[parent]`
  - TTL: 300 seconds (5 minutes).
  - Invalidation: `invalidateChoroplethCache()` purges `petakeu:geo:choropleth*`.
- **Region Summary Cache** (`region-service.ts`):
  - Redis Key: `petakeu:regions:regions:summary:{regionId}:from:...:to:...`
  - TTL: 180 seconds (3 minutes).
  - Invalidation: `invalidateRegionCache()` purges `petakeu:regions*`.

### 6.3 Identified Invalidation Gap
- In `upload-worker.ts` (lines 179-182) and `mv-refresh-cron.ts` (lines 20-24), cache invalidation calls:
  - `invalidateChoroplethCache()`
  - `invalidateFiscalCache()`
  - `invalidateDefisitwatchCache()`
  - `invalidateRankfinCache()`
- **Missing Call**: `regionService.invalidateRegionCache()` is **NOT** invoked when new uploads are processed or when the materialized view refreshes.
- **Impact**: Stale region summary data (`GET /api/v1/regions/:id/summary`) may persist for up to 3 minutes after a new upload.

---

## 7. Feature Deep-Dive: Extended Report Generation (R2)

### 7.1 Report Workflow & Queue
- Client submits `POST /api/v1/reports/export` with payload `{ period: "2026-08", regionIds: [...], format: "pdf" | "excel" }`.
- `report-controller.ts` validates payload via `reportRequestSchema` (Zod) and calls `reportService.enqueueReport()`.
- Job is inserted into `report_jobs` table (`status: 'queued'`) and pushed to BullMQ `report-generation` queue.
- `report-worker.ts` processes job in background:
  - Updates status to `processing`.
  - Queries database via `fetchReportData()`.
  - Renders PDF using `pdfkit` or Excel using `exceljs`.
  - Uploads generated Buffer to MinIO storage bucket `reports` via `uploadReport()`.
  - Obtains presigned S3 URL via `getReportDownloadUrl()`.
  - Updates `report_jobs` record (`status: 'completed'`, `download_url`, `summary`).

### 7.2 Extended Report Requirements & Gaps
- **Requirement R2 Acceptance Criteria**:
  - PDF reports must include structured tables with regional rankings, revenue realization, and YoY percentage calculations.
  - Excel reports must include formatted worksheets for summary statistics and per-region payment comparison data.
- **Current Worker Implementation**:
  - `fetchReportData()` currently queries only current period payments from `mv_payments_with_cut`.
  - PDF generator outputs a basic 4-column table ordered alphabetically by region name. YoY calculations and ranking numbers are not computed.
  - Excel generator creates a single worksheet with basic styling. Separate multi-region comparison worksheets and top 10 ranking tabs are not created.

---

## 8. Synthesis of Recommendations & Next Steps

| Component | Area | Identified Issue / Enhancement | Recommended Action |
|-----------|------|--------------------------------|-------------------|
| Server Caching | Invalidation | `invalidateRegionCache()` missing in `upload-worker.ts` and `mv-refresh-cron.ts`. | Add `await regionService.invalidateRegionCache()` alongside choropleth/fiscal invalidations after payment upserts and MV refresh. |
| Report Worker | Data Fetching | `fetchReportData()` in `report-worker.ts` only fetches current period. | Extend query to fetch previous year period (e.g. `(period - interval '1 year')`) to calculate YoY growth percentages and top 10 rankings. |
| Report Worker | PDF Generator | PDF output lacks ranking column and YoY percentage calculations. | Update `generatePdf()` layout to display ranking badge, total revenue realization, 15% cut, net 85%, and YoY % column. |
| Report Worker | Excel Generator | Excel workbook has single sheet without multi-region comparison tab. | Update `generateExcel()` to create 2 worksheets: Sheet 1 ("Ringkasan & Ranking Top 10") and Sheet 2 ("Komparasi Antar-Wilayah"). |
| Test Coverage | Server Unit Tests | No explicit test checking Redis cache hit metric increment (`petakeu_cache_hits_total`). | Add unit test in `geo-service.test.ts` or `region-service.test.ts` asserting `cacheHits.inc` is called on repeated invocations. |
