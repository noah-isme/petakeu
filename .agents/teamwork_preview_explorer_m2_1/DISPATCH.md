# Dispatch — Explorer (Milestone M2)

## 2026-08-11T00:56:40Z

You are `teamwork_preview_explorer_m2_1`.
Working directory: `/home/noah/project/petakeu/.agents/teamwork_preview_explorer_m2_1`

## Objective
Investigate existing codebase for Milestone M2: Comprehensive Readiness Health Checks (`GET /healthz`).
Detail exact probe implementation requirements for DB (PostGIS), Redis, MinIO storage, and BullMQ worker queue, as well as HTTP status code mapping and JSON schema.

## Inputs
- `/home/noah/project/petakeu/.agents/ORIGINAL_REQUEST.md`
- `/home/noah/project/petakeu/.agents/teamwork_preview_orchestrator_1/PROJECT.md`
- `/home/noah/project/petakeu/.agents/teamwork_preview_sub_orch_m2/SCOPE.md`

## Instructions
1. Read the input files above and examine `apps/server/src/utils/health.ts`, `apps/server/src/server.ts`, DB pool, Redis client, MinIO client, and BullMQ queue definitions in `apps/server/src/`.
2. Detail exact probe logic for:
   - Database probe: query execution `SELECT 1 AS alive, PostGIS_Version() AS postgis_version` using `getPgPool()`.
   - Redis probe: `redis.ping()` returning `'PONG'` using Redis client.
   - Storage probe: bucket accessibility check for `uploads` and `reports` buckets.
   - Queue probe: `uploadQueue` and `reportQueue` job counts (`active`, `waiting`, `completed`, `failed`).
   - HTTP status rules: 503 if DB or Redis is unhealthy; 200 if DB and Redis are healthy (even if storage or queue is degraded); 200 if all healthy.
   - JSON response schema format.
3. Write your complete analysis to `/home/noah/project/petakeu/.agents/teamwork_preview_explorer_m2_1/analysis.md` and create a clear handoff report at `/home/noah/project/petakeu/.agents/teamwork_preview_explorer_m2_1/handoff.md`.
4. Send a message to parent sub-orchestrator when finished.
