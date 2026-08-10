# Project: Petakeu Roadmap Implementation (Redis Caching & Extended Reports)

## Architecture
- **Monorepo**: Turborepo + pnpm workspaces (`apps/web`, `apps/server`)
- **Backend**: Express 4 + TypeScript, PostgreSQL 16 + PostGIS 3.4 (`mv_payments_with_cut`), Redis 7 (`ioredis`), BullMQ (`report-worker.ts`, `upload-worker.ts`), MinIO S3 (`reports` bucket).
- **Frontend**: React 18 + Vite, Tailwind CSS v4, React Query, Playwright E2E testing.
- **Caching**: Redis helper (`apps/server/src/db/redis.ts`), Prometheus metrics (`petakeu_cache_hits_total`), configurable TTLs in `env.ts`.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Choropleth Query Parameters | Wire `req.query.level` and `req.query.parent` in `geoController.getChoropleth` | M1 | Survey 1 |
| 2 | Choropleth Cache Key & Configurable TTL | Key format `choropleth:{period}:{level}:{parent}` with configurable `CHOROPLETH_CACHE_TTL` | M1 | Survey 1 |
| 3 | Region Summary Cache Key & Configurable TTL | Key format `summary:{regionId}:{from}:{to}` with configurable `REGION_SUMMARY_CACHE_TTL` | M1 | Survey 1 |
| 4 | Cache Metrics Logging | Increment `petakeu_cache_hits_total` on Redis cache hit (`cacheHits.inc`) | M1 | Survey 1 |
| 5 | Explicit Cache Invalidation | Call `invalidateRegionCache()` and `invalidateChoroplethCache()` in `upload-worker.ts` & `mv-refresh-cron.ts` | M1 | Survey 1 |
| 6 | Report Worker SQL Queries | Multi-query / YoY query joining current period with `(YYYY-1)-MM` period, Top 10 regional rankings, and summary totals | M2 | Survey 2 |
| 7 | Extended PDF Generation | PDFKit rendering KPI cards, Top 10 rankings table, YoY % comparison, and multi-region breakdown table | M2 | Survey 2 |
| 8 | Extended Excel Generation | Multi-sheet ExcelJS workbook (`Ringkasan & Ranking` and `Detail Pembayaran`) with formatting & YoY % | M2 | Survey 2 |
| 9 | Summary Metadata & Status | Update `report_jobs.summary` JSON with real calculated `changePercentage`, top gainers, and top decliners | M2 | Survey 2 |
| 10 | Unit & Integration Test Suites | Vitest tests for Redis caching, cache invalidation, and PDF/Excel report worker logic (`report-worker.test.ts`, `geo-service.test.ts`, `region-service.test.ts`) | M3 | Survey 3 |
| 11 | E2E Acceptance Test Suites | Playwright E2E tests for choropleth caching, region summary caching, and PDF/Excel report job enqueueing & status polling | E2E Track | Survey 3 |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | M1: Redis Caching & Invalidation | Features 1, 2, 3, 4, 5 | None | PLANNED |
| 2 | M2: Extended PDF & Excel Reports | Features 6, 7, 8, 9 | M1 | PLANNED |
| 3 | M3: Unit & Service Integration Verification | Feature 10 | M1, M2 | PLANNED |

## Code Layout
### Backend (`apps/server`)
- `apps/server/src/config/env.ts` — Environment variables & configurable TTLs
- `apps/server/src/controllers/geo-controller.ts` — Geo endpoint controller (pass level & parent params)
- `apps/server/src/services/geo-service.ts` — Choropleth caching, key building (`choropleth:{period}:{level}:{parent}`), invalidation
- `apps/server/src/services/region-service.ts` — Region summary caching, key building (`summary:{regionId}:{from}:{to}`), invalidation
- `apps/server/src/db/redis.ts` — Redis client, `getCached()` wrapper, metric logging (`petakeu_cache_hits_total`)
- `apps/server/src/jobs/upload-worker.ts` — Upload worker job (`invalidateRegionCache()` addition)
- `apps/server/src/jobs/mv-refresh-cron.ts` — Cron job (`invalidateRegionCache()` addition)
- `apps/server/src/jobs/report-worker.ts` — Extended PDF & Excel report worker
- `apps/server/src/jobs/upload-worker.test.ts` — Upload worker unit tests
- `apps/server/src/jobs/report-worker.test.ts` — Report worker unit tests

### Frontend (`apps/web`)
- `apps/web/e2e/choropleth-caching.spec.ts` — Playwright E2E for Redis caching & invalidation
- `apps/web/e2e/report-generation.spec.ts` — Playwright E2E for extended report generation

## Interface Contracts
### Geo Choropleth Endpoint
`GET /api/v1/geo/choropleth?period=2025-08&level=2&parent=<uuid>&public=true`
- Cache key: `petakeu:geo:choropleth:{period}:{level}:{parent}`
- Options passed: `{ period, level: Number(level), parent: String(parent), publicMode: Boolean(public) }`

### Region Summary Endpoint
`GET /api/v1/regions/:id/summary?from=2024-01&to=2025-08`
- Cache key: `petakeu:regions:summary:<id>:from:2024-01:to:2025-08`
- Invalidation helper: `invalidateRegionCache()` purges `petakeu:regions:*`

### Report Worker Output Data Structure
- PDF: Document with Executive KPI Cards, Top 10 Regional Rankings table, YoY Growth %, and Multi-Region Summary Table.
- Excel: Workbook with 2 Worksheets: `Ringkasan & Ranking` (KPIs + Top 10) and `Detail Pembayaran` (All regions with YoY %).
- Metadata `report_jobs.summary`:
  ```json
  {
    "totalRegions": 10,
    "totalNeto": 50000000000,
    "changePercentage": 12.5,
    "topGainers": [...],
    "topDecliners": [...]
  }
  ```
