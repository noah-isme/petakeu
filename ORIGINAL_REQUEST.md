# Original User Request

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
