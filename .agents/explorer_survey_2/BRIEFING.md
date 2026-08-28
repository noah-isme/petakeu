# BRIEFING — 2026-08-11T17:05:50Z

## Mission
Investigate Requirement R2 (Performance Benchmarking Script) for Petakeu codebase and produce a comprehensive design & survey report in `handoff.md`.

## 🔒 My Identity
- Archetype: Teamwork explorer
- Roles: Read-only investigator / analyst
- Working directory: /home/noah/project/petakeu/.agents/explorer_survey_2
- Original parent: 0e3fc0db-4153-4222-a396-01443a918ce8
- Milestone: Requirement R2 Survey & Design

## 🔒 Key Constraints
- Read-only investigation — do NOT implement production/script changes
- Produce structured report `handoff.md` in working directory
- Follow AGENTS.md rules and graphify rules

## Current Parent
- Conversation ID: 0e3fc0db-4153-4222-a396-01443a918ce8
- Updated: 2026-08-11T17:05:50Z

## Investigation State
- **Explored paths**: `apps/server/src/routes/v1/geo.ts`, `apps/server/src/controllers/geo-controller.ts`, `apps/server/src/services/geo-service.ts`, `apps/server/src/db/redis.ts`, `apps/server/src/utils/metrics.ts`, `apps/server/src/middleware/auth.ts`, `package.json`, `apps/server/package.json`
- **Key findings**: 
  - Endpoint path: `GET /api/geo/choropleth` (or `/api/v1/geo/choropleth`).
  - Redis cache key: `petakeu:geo:choropleth:{period}`.
  - Cold miss triggering: parameter-based period variation (`1970-01`, etc.) or Redis flush.
  - Cache hit triggering: single warmup request followed by concurrent requests to same URL.
  - Concurrency generation: native Node `fetch` + Promise worker pool (C ≥ 10).
  - CLI argument handling: Node standard `util.parseArgs`.
  - Machine-parseable JSON output mode + human-readable CLI report.
  - Verification: `npx tsx scripts/benchmark-perf.ts`, SLA exit status 0 (PASS) or 1 (FAIL).
- **Unexplored areas**: None, survey complete.

## Key Decisions Made
- Prepared detailed design architecture and skeleton implementation for `scripts/benchmark-perf.ts` in `handoff.md`.

## Artifact Index
- `/home/noah/project/petakeu/.agents/explorer_survey_2/DISPATCH.md` — Received task dispatch
- `/home/noah/project/petakeu/.agents/explorer_survey_2/BRIEFING.md` — Working memory briefing
- `/home/noah/project/petakeu/.agents/explorer_survey_2/handoff.md` — 5-component handoff report for R2
