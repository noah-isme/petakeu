# Scope: Milestone M2 (R2 - Comprehensive Readiness Health Checks)

## Architecture
- Backend Utility (`apps/server/src/utils/health.ts`) & Route (`apps/server/src/server.ts` / `/healthz`).
- Requirement R2: Perform active probing of API liveness, PostgreSQL/PostGIS database query execution (`SELECT 1 AS alive, PostGIS_Version() AS postgis_version`), Redis connection/ping, BullMQ worker queue status (`uploadQueue`, `reportQueue`), and MinIO storage bucket accessibility (`uploads`, `reports`).
- Status Codes: Return HTTP 200 when healthy/degraded; return HTTP 503 when critical dependencies (DB, Redis) are unreachable.
- JSON Response Schema: `status`, `checks: { database, redis, storage, queue }`, `timestamp`, `uptime`.

## Features Owned
1. PostGIS query probe in `checkDatabase()`.
2. Redis connection probe in `checkRedis()`.
3. Storage bucket accessibility probe in `checkStorage()`.
4. Queue job counts probe in `checkQueue()`.
5. HTTP status code rules & JSON schema mapping in `health.ts` and `server.ts`.
6. Unit/integration test suite in `apps/server/src/utils/health.test.ts`.

## File Write Boundaries
- Exclusive ownership:
  - `apps/server/src/utils/health.ts`
  - `apps/server/src/server.ts` (route status code handling)
  - `apps/server/src/utils/health.test.ts`

## Verification
- Build: `pnpm --filter @petakeu/server build`
- Typecheck: `pnpm --filter @petakeu/server typecheck`
- Test: `pnpm --filter @petakeu/server test`

## Milestone Status
Status: **DONE**
Gate Verdict: **PASS** (Iteration 2: All verification agents approved/cleaned)
Completed At: 2026-08-11T01:03:34Z


