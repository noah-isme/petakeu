# BRIEFING — 2026-08-12T00:35:45Z

## Mission
Investigate and design a concrete, step-by-step implementation plan and complete TypeScript code blueprint for `scripts/benchmark-perf.ts` and the `"benchmark"` script in `package.json` for Milestone 2.

## 🔒 My Identity
- Archetype: Explorer
- Roles: Benchmark Script Explorer / Codebase Investigator
- Working directory: /home/noah/project/petakeu/.agents/explorer_m2_1
- Original parent: d19bad89-ee65-43c9-b648-a9c3d71386f3
- Milestone: Milestone 2 (Performance Benchmarking Script)

## 🔒 Key Constraints
- Read-only investigation — do NOT implement code changes in the main application / repository source, only produce plan and code blueprint in handoff report within your working directory.
- Use Node native `util.parseArgs` for command-line parsing.
- Default values: url `http://localhost:4000`, endpoint `/api/geo/choropleth`, period `2025-08`, concurrency `10`, requests `50`, hit SLA `300`ms, cold SLA `2000`ms.
- Dual-scenario benchmark execution: Cache-hit (warmup then repeated requests) and Cold-miss (unique period params like `1970-01`, `1970-02`...).
- Percentiles & stats: p50, p95, p99, min, avg, max, requestsPerSec.
- Pass/fail rule: `hitResult.p95Ms < hitSlaMs && coldResult.p95Ms < coldSlaMs`. Exit code 0 on pass, 1 on fail.
- Output formatting: ASCII table or structured JSON stdout depending on `--json`.
- Root package.json script: `"benchmark": "tsx scripts/benchmark-perf.ts"`.

## Current Parent
- Conversation ID: d19bad89-ee65-43c9-b648-a9c3d71386f3
- Updated: 2026-08-12T00:35:45Z

## Investigation State
- **Explored paths**:
  - `apps/server/src/routes/v1/geo.ts`
  - `apps/server/src/controllers/geo-controller.ts`
  - `apps/server/src/services/geo-service.ts`
  - `apps/server/src/routes/index.ts` & `apps/server/src/routes/v1/index.ts`
  - `apps/server/src/middleware/auth.ts`
  - Root `package.json`
- **Key findings**:
  - Full HTTP path for national choropleth endpoint: `GET /api/geo/choropleth` (or `http://localhost:4000/api/geo/choropleth`).
  - Auth: `requireAuth` uses JWT token header (`Authorization: Bearer <jwt>`) if `AUTH_DISABLED=false` and `AUTH_SECRET` is set.
  - Redis key prefix: `petakeu:geo:choropleth:{period}`.
  - Native `util.parseArgs` handles all 10 CLI options clean and type-safe.
  - Workers pull asynchronously from shared counter for exact `requests` execution across `concurrency` parallel connections.
  - Distinct period parameters (`1970-01`, `1970-02`...) guarantee 100% cold cache-miss rate hitting PostgreSQL/PostGIS.
- **Unexplored areas**: None. Design is fully complete.

## Key Decisions Made
- Designed clean, single-file TypeScript script `scripts/benchmark-perf.ts` using zero external dependencies (Node native `fetch`, `performance.now()`, `util.parseArgs`).
- Formatted `handoff.md` with complete 5 components and full runnable code blueprint.

## Artifact Index
- `/home/noah/project/petakeu/.agents/explorer_m2_1/DISPATCH.md` — Initial dispatch message
- `/home/noah/project/petakeu/.agents/explorer_m2_1/BRIEFING.md` — Working memory and context state
- `/home/noah/project/petakeu/.agents/explorer_m2_1/progress.md` — Progress tracker and liveness heartbeat
- `/home/noah/project/petakeu/.agents/explorer_m2_1/handoff.md` — Final analysis and blueprint deliverable
