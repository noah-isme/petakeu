# Project: Petakeu Phase 1 MVP Remaining Items

## Architecture
- `apps/server`: Express 4 + TypeScript backend.
  - Report worker: `apps/server/src/jobs/report-worker.ts` (BullMQ job generating Excel/PDF & uploading to MinIO via streaming).
  - Storage service: `apps/server/src/services/storage-service.ts` & `apps/server/src/db/minio.ts`.
  - Geo API: `apps/server/src/routes/v1/geo.ts` (`GET /api/geo/choropleth`).
  - Redis cache: `getCached()` helper in `apps/server/src/db/redis.ts`.
- `apps/web`: React 18 + Vite frontend + Playwright E2E tests (`apps/web/e2e/report-generation.spec.ts`).
- `scripts`: Root scripts folder for utilities (e.g. `scripts/benchmark-perf.ts`).

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | ExcelJS Streaming Export | ExcelJS `WorkbookWriter` streaming to MinIO upload via PassThrough stream | M1 | ORIGINAL_REQUEST.md §R1 |
| 2 | PDFKit Streaming Export | PDFKit document streaming directly to MinIO upload via PassThrough stream | M1 | ORIGINAL_REQUEST.md §R1 |
| 3 | Memory Optimization Note | Code comments documenting V8 heap memory optimization rationale | M1 | ORIGINAL_REQUEST.md §R1 |
| 4 | Perf Benchmarking Script | TS benchmark script in `scripts/benchmark-perf.ts` testing >=10 req/sec load | M2 | ORIGINAL_REQUEST.md §R2 |
| 5 | Cache Hit vs Cold SLA Check | Measure p95 for hit (<300ms) vs cold (<2000ms) with PASS/FAIL verdict | M2 | ORIGINAL_REQUEST.md §R2 |
| 6 | Machine-parseable & Help Flag | JSON output (`--json`) and `--help` CLI documentation | M2 | ORIGINAL_REQUEST.md §R2 |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | M1: Streaming Export | Streaming ExcelJS & PDFKit export to MinIO in report-worker.ts, storage-service.ts, minio.ts | None | DONE |
| 2 | M2: Perf Benchmarking | Self-contained benchmark script in scripts/benchmark-perf.ts and package.json | None | PLANNED |

## Interface Contracts
### Report Worker ↔ MinIO Storage
- `uploadStreamToS3(bucket: string, key: string, stream: Readable, contentType: string): Promise<string>`
- `uploadReportStream(key: string, stream: Readable, contentType: string): Promise<string>`

### Benchmark Script ↔ Server API
- URL: `GET /api/geo/choropleth` (base URL default `http://localhost:4000`)
- Cache Hit: 1 warmup GET to `/api/geo/choropleth?period=2025-08` then concurrent requests.
- Cold Miss: Concurrent requests with unique periods (`period=1970-01`, `1970-02`, etc.).
- Output: Terminal ASCII summary or `--json` structured machine-parseable JSON stdout.

## Code Layout
- `apps/server/src/jobs/report-worker.ts` (M1 write boundary - completed)
- `apps/server/src/jobs/report-worker.test.ts` (M1 write boundary - completed)
- `apps/server/src/services/storage-service.ts` (M1 write boundary - completed)
- `apps/server/src/db/minio.ts` (M1 write boundary - completed)
- `scripts/benchmark-perf.ts` (M2 write boundary - pending)
- `package.json` (M2 write boundary - pending)
