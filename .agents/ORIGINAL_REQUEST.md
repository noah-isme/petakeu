# Original User Request

## 2026-08-10T17:54:09Z

Implement the next priority roadmap items for Petakeu: Future Period Warning Flag (`forecast=false`) validation for uploads and comprehensive `GET /healthz` readiness checks across PostGIS, Redis, BullMQ worker queue, and MinIO storage.

Working directory: /home/noah/project/petakeu
Integrity mode: benchmark

## Requirements

### R1. Future Period Warning Flag
Validation rule in the upload processing pipeline checking incoming payment periods against `CURRENT_DATE`. Incoming data with future periods should be flagged with a warning (`forecast=false`) without rejecting valid historic data.

### R2. Comprehensive Readiness Health Checks (`GET /healthz`)
Extend the health check utility (`apps/server/src/utils/health.ts`) and route (`GET /healthz`) to perform active probing of API liveness, PostgreSQL/PostGIS database query execution, Redis connection/ping, BullMQ worker queue status, and MinIO storage bucket accessibility.

## Acceptance Criteria

### R1 Verification (Future Period Flag)
- [ ] Data validation logic in `upload-service.ts` / `upload-worker.ts` checks period dates against `CURRENT_DATE`.
- [ ] Future period payments are tagged with warning metadata (`forecast=false`) while maintaining valid data ingestion.
- [ ] Automated unit/integration tests in `apps/server` verify correct behavior for past, current, and future period dates.

### R2 Verification (Health & Readiness)
- [ ] `GET /healthz` returns 200 HTTP status code when all components (DB, Redis, BullMQ, MinIO) are healthy/degraded.
- [ ] `GET /healthz` returns 503 HTTP status code if any critical dependency (Database, Redis) is unreachable.
- [ ] JSON response contains detailed status per component (`checks: { database, redis, storage, queue }`).

## 2026-08-10T18:12:18Z

Implement the next priority roadmap items for Petakeu: Redis Caching for Choropleth GeoJSON (`choropleth:{period}:{level}:{parent}`) & Region Summaries (`/api/regions/:id/summary`), plus extended PDF/Excel Report Content with top 10 regional rankings and comparison tables.

Working directory: /home/noah/project/petakeu
Integrity mode: benchmark

## Requirements

### R1. Redis Caching for GeoJSON & Region Summaries
Implement Redis caching layers for `/api/v1/geo/choropleth` (key: `choropleth:{period}:{level}:{parent}`) and `/api/v1/regions/:id/summary` (key: `summary:{regionId}:{from}:{to}`) with configurable TTLs and explicit cache invalidation when new uploads are processed or materialized views refresh.

### R2. Extended PDF and Excel Report Generation
Extend the background report generator (`apps/server/src/jobs/report-worker.ts`) to include detailed top 10 regional rankings, breakdown comparisons, and multi-region payment summary tables in generated PDF/Excel files.

## Acceptance Criteria

### R1 Verification (Redis Caching)
- [ ] `GET /api/v1/geo/choropleth` and `GET /api/v1/regions/:id/summary` utilize Redis `getCached()` helper.
- [ ] Subsequent calls hit Redis cache (verifiable via `petakeu_cache_hits_total` metric increment).
- [ ] Cache invalidation triggers correctly when payment uploads are processed or cron refreshes materialized views.

### R2 Verification (Extended Reports)
- [ ] Generated PDF reports include structured tables with regional rankings, revenue realization, and YoY percentage calculations.
- [ ] Generated Excel reports include formatted worksheets for summary statistics and per-region payment comparison data.
- [ ] Report generation jobs complete cleanly via BullMQ worker.
