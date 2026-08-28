## 2026-08-11T17:35:08Z
<USER_REQUEST>
You are an Explorer subagent (Benchmark Script Explorer) investigating Milestone 2: Performance Benchmarking Script for Petakeu.

Your assigned working directory: /home/noah/project/petakeu/.agents/explorer_m2_1
Repository root: /home/noah/project/petakeu

Task Objectives:
1. Read `/home/noah/project/petakeu/.agents/ORIGINAL_REQUEST.md` (Requirement R2), `/home/noah/project/petakeu/.agents/teamwork_preview_orchestrator_4/DISPATCH.md`, and `/home/noah/project/petakeu/.agents/explorer_survey_2/handoff.md`.
2. Inspect `package.json` at repository root and existing endpoints in `apps/server/src/routes/v1/geo.ts` & `apps/server/src/controllers/geo-controller.ts`.
3. Create a concrete, step-by-step implementation plan and complete TypeScript code blueprint for `scripts/benchmark-perf.ts` and the `"benchmark"` script addition to root `package.json`.
4. Ensure your plan covers:
   - Command-line argument parsing with Node native `util.parseArgs` (`--url`, `--endpoint`, `--period`, `--concurrency`, `--requests`, `--hit-sla`, `--cold-sla`, `--token`, `--json`, `--help`).
   - Standard defaults: url `http://localhost:4000`, endpoint `/api/geo/choropleth`, period `2025-08`, concurrency `10`, requests `50`, hit SLA `300`ms, cold SLA `2000`ms.
   - Dual-scenario benchmark execution:
     a) Cache-hit scenario: warmup request to populate Redis cache (`petakeu:geo:choropleth:2025-08`), then `concurrency` parallel workers executing `requests` total requests to `/api/geo/choropleth?period=2025-08`.
     b) Cold-miss scenario: `concurrency` parallel workers executing requests with distinct non-cached period query parameters (e.g. `period=1970-01`, `period=1970-02`...) to guarantee PostgreSQL/PostGIS query execution on every request.
   - Latency collection with `performance.now()`, sorting, and computing exact percentiles (p50, p95, p99, min, avg, max, requestsPerSec).
   - PASS/FAIL determination: `pass = hitResult.p95Ms < hitSlaMs && coldResult.p95Ms < coldSlaMs`.
   - Process exit code: `process.exit(pass ? 0 : 1)` (with proper cleanup / output flush before exiting).
   - Output formatting: human-readable ASCII summary table if `--json` is not specified, or structured JSON stdout if `--json` is present.
   - Entry in root `package.json`: `"scripts": { "benchmark": "tsx scripts/benchmark-perf.ts" }`.
5. Write your complete analysis and code blueprint to `/home/noah/project/petakeu/.agents/explorer_m2_1/handoff.md`.
6. Send a message to your caller notifying them when complete.
</USER_REQUEST>
