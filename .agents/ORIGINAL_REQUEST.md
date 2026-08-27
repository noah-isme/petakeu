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

## 2026-08-11T17:03:36Z

<USER_REQUEST>
Implement the two remaining Phase 1 MVP items in the **Petakeu** GovTech monorepo: (1) streaming chunked response for large multi-region Excel/PDF exports to prevent memory exhaustion, and (2) a performance benchmarking script that validates the system meets defined SLA targets (p95 < 300ms for cache hits, < 2s for cold DB queries on national-level choropleth).

Working directory: /home/noah/project/petakeu
Integrity mode: development

## Project Context

- **Stack:** Express 4 + TypeScript backend, ExcelJS + PDFKit for report generation, BullMQ worker (`apps/server/src/jobs/report-worker.ts`), Redis caching on geo and summary endpoints, MinIO for storage.
- **Architecture:** Router → Controller → Service → DB layering. Background jobs via BullMQ.
- **Existing report flow:** `POST /api/reports/export` → BullMQ job → `generateExcel()` / `generatePdf()` → uploads entire `Buffer` to MinIO → presigned URL.
- **Existing cache:** Choropleth GeoJSON cached at `choropleth:{period}:{level}:{parent}` with 1-hour TTL; summary endpoint cached with TTL invalidation.

## Requirements

### R1. Streaming Export for Large Datasets
The report worker must use ExcelJS streaming writer (or an equivalent streaming approach for PDF) so that generating Excel reports for large multi-region datasets does not buffer the entire file in Node.js heap memory. The upload to MinIO must pipe the stream directly without first materialising a complete `Buffer`. The existing report job API (`POST /api/reports/export`, BullMQ worker, MinIO storage, presigned URL retrieval) must remain fully functional and backward-compatible.

### R2. Performance Benchmarking Script
Provide a runnable benchmarking script (TypeScript or JavaScript, executable with `tsx` or `node`) that:
- Sends concurrent requests (≥ 10 req/sec) to the national-level choropleth endpoint (`GET /api/geo/choropleth` or equivalent) and records p95 response latency under load.
- Distinguishes cache-hit vs. cache-miss (cold DB) scenarios and reports both p95 values.
- Prints a clear PASS/FAIL verdict against the SLA: p95 < 300ms for cache hits, p95 < 2000ms for cold queries.
- Is self-contained: can be run with a single command from the repo root and requires only a running local server (no external tools like k6 required unless already present).

## Acceptance Criteria

### R1 — Streaming Export
- [ ] `generateExcel()` in `report-worker.ts` uses ExcelJS `stream.xlsx.WorkbookWriter` (or equivalent) and pipes to MinIO upload without creating a full in-memory `Buffer` of the workbook.
- [ ] Existing E2E test `apps/web/e2e/report-generation.spec.ts` still passes (or is updated to reflect new behaviour if the API response shape changes).
- [ ] `pnpm typecheck` and `pnpm lint` pass with no new errors.
- [ ] A code comment or migration note documents the memory improvement rationale.

### R2 — Performance Benchmarking
- [ ] The benchmarking script exists at a discoverable path (e.g. `scripts/benchmark-perf.ts` or `apps/server/scripts/benchmark-perf.ts`).
- [ ] Running it (e.g. `npx tsx scripts/benchmark-perf.ts`) against a locally running server prints p95 latency for cache-hit and cold-miss scenarios and a PASS/FAIL verdict.
- [ ] The script includes a `--help` flag or inline comments explaining required environment variables (base URL, period, etc.).
- [ ] The script's output is machine-parseable (JSON or structured text) so CI can consume it in a future step.
- [ ] `pnpm typecheck` and `pnpm lint` pass with no new errors.
</USER_REQUEST>

## 2026-08-27T06:16:15Z

<USER_REQUEST>
Execute end-to-end release hardening for Petakeu by running full integration tests with live backend services via Docker Compose, executing Playwright E2E suites, and implementing frontend security (CSP headers) and resilience (client fetch timeouts).

Working directory: /home/noah/project/petakeu
Integrity mode: development

## Requirements

### R1. Live Service Integration Tests
- Ensure required backend backing services (PostgreSQL with PostGIS, Redis, MinIO) are running via Docker Compose (`docker-compose.yml` or relevant compose files).
- Run and pass the integration test suite in `@petakeu/server` with `PETAKEU_INTEGRATION=1`.
- Verify report generation and upload worker integration pipelines succeed with zero skipped tests and clean connection teardowns.

### R2. End-to-End (E2E) Browser Verification
- Execute and pass all Playwright E2E test scenarios (`pnpm --filter @petakeu/web test:e2e` / `pnpm test:e2e`).
- Verify core user journeys: Map exploration, Data upload flow, and Reports generation.

### R3. Security & Resilience Hardening
- Implement a Content Security Policy (CSP) in `apps/web/index.html` (and/or server security headers via Helmet) that prevents XSS while maintaining full compatibility with map tile providers (Leaflet/OpenStreetMap), fonts, and API communication.
- Implement configurable timeout and abort mechanisms (using `AbortController`) in `apps/web/src/api/client.ts` to prevent indefinite UI loading states on hanging network requests.

## Acceptance Criteria

### Integration & E2E Validation
- [ ] `PETAKEU_INTEGRATION=1 pnpm --filter @petakeu/server test` runs with 0 skipped integration tests and 100% passing results.
- [ ] `pnpm --filter @petakeu/web test:e2e` executes all specs and completes with exit code 0.

### Code & Security Quality
- [ ] `apps/web/index.html` contains an effective `<meta http-equiv="Content-Security-Policy">` (or backend Helmet policy verified) without breaking maps (Leaflet CDN/tiles) or charts.
- [ ] `apps/web/src/api/client.ts` supports timeout handling (default 15–30s) and handles `AbortError` cleanly.
- [ ] `pnpm lint`, `pnpm typecheck`, and `pnpm build` pass across all packages in the monorepo.
</USER_REQUEST>

## 2026-08-27T13:17:18+07:00

<USER_REQUEST>
Execute end-to-end release hardening for Petakeu:
1. Live Service Integration Tests: Ensure required backend backing services (PostgreSQL with PostGIS, Redis, MinIO) are running via Docker Compose (`docker-compose.yml` or relevant compose files). Run and pass the integration test suite in `@petakeu/server` with `PETAKEU_INTEGRATION=1`. Verify report generation and upload worker integration pipelines succeed with zero skipped tests and clean connection teardowns.
2. End-to-End (E2E) Browser Verification: Execute and pass all Playwright E2E test scenarios (`pnpm --filter @petakeu/web test:e2e` / `pnpm test:e2e`). Verify core user journeys: Map exploration, Data upload flow, and Reports generation.
3. Security & Resilience Hardening:
   - Implement a Content Security Policy (CSP) in `apps/web/index.html` (and/or server security headers via Helmet) that prevents XSS while maintaining full compatibility with map tile providers (Leaflet/OpenStreetMap), fonts, and API communication.
   - Implement configurable timeout and abort mechanisms (using `AbortController`) in `apps/web/src/api/client.ts` to prevent indefinite UI loading states on hanging network requests.
4. Ensure `pnpm lint`, `pnpm typecheck`, and `pnpm build` pass across all packages in the monorepo.
</USER_REQUEST>

