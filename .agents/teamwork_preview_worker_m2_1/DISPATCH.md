# Dispatch — Worker (Milestone M2)

## 2026-08-11T00:56:55Z

You are `teamwork_preview_worker_m2_1`.
Working directory: `/home/noah/project/petakeu/.agents/teamwork_preview_worker_m2_1`

## Mandatory Integrity Warning
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Objective
Implement Milestone M2 (Requirement R2: Comprehensive Readiness Health Checks `GET /healthz`) in Petakeu server codebase:
1. Update `apps/server/src/utils/health.ts`
2. Update `apps/server/src/server.ts`
3. Create comprehensive test suite `apps/server/src/utils/health.test.ts`

## File Write Boundaries
You have exclusive write ownership of:
- `apps/server/src/utils/health.ts`
- `apps/server/src/server.ts`
- `apps/server/src/utils/health.test.ts`

Do not modify files outside this boundary.

## Specification & Interface Contracts
Refer to `/home/noah/project/petakeu/.agents/teamwork_preview_orchestrator_1/PROJECT.md § Interface Contracts`:

1. `checkDatabase()` in `apps/server/src/utils/health.ts`:
   - Query: `SELECT 1 AS alive, PostGIS_Version() AS postgis_version` via `getPgPool().query(...)`
   - On success: `{ status: 'healthy', latencyMs, details: { query: 'SELECT 1 AS alive, PostGIS_Version() AS postgis_version', postgisVersion } }`
   - On error: `{ status: 'unhealthy', latencyMs, error: error.message }`

2. `checkRedis()` in `apps/server/src/utils/health.ts`:
   - Query: `getRedisClient().ping()`
   - On success: `{ status: 'healthy', latencyMs, details: { command: 'PING' } }`
   - On error: `{ status: 'unhealthy', latencyMs, error: error.message }`

3. `checkStorage()` in `apps/server/src/utils/health.ts`:
   - Probe MinIO storage bucket accessibility for `uploads` and `reports` (or call storage health check).
   - On success: `{ status: 'healthy', latencyMs, details: { provider: 'MinIO/S3', buckets: ['uploads', 'reports'] } }`
   - On error/degraded: `{ status: 'degraded', latencyMs, details: { provider: 'MinIO/S3', buckets: ['uploads', 'reports'] }, error: error.message }`

4. `checkQueue()` in `apps/server/src/utils/health.ts`:
   - Probe BullMQ queue instances `uploadQueue` and `reportQueue` job counts (`active`, `waiting`, `completed`, `failed`).
   - On success: `{ status: 'healthy', latencyMs, details: { uploadQueue: { active, waiting, completed, failed }, reportQueue: { active, waiting, completed, failed } } }`
   - On error/degraded: `{ status: 'degraded', latencyMs, error: error.message }`

5. `performHealthChecks()` overall status mapping:
   - `unhealthy`: DB is `'unhealthy'` OR Redis is `'unhealthy'`
   - `degraded`: DB and Redis are `'healthy'`, but Storage or Queue is `'degraded'`
   - `healthy`: All 4 components are `'healthy'`

6. `apps/server/src/server.ts` route `GET /healthz` and `GET /health`:
   - HTTP Status 503 if overall status is `'unhealthy'`
   - HTTP Status 200 if overall status is `'healthy'` or `'degraded'`

7. Unit Test Suite `apps/server/src/utils/health.test.ts`:
   - Create tests using Vitest with proper mocks.
   - Cover healthy state (200), degraded storage/queue (200), unhealthy DB (503), unhealthy Redis (503).

## Verification Requirements
Run the following build and test commands and include exact command output in your report:
- `pnpm --filter @petakeu/server build`
- `pnpm --filter @petakeu/server test`

Write your completion report to `/home/noah/project/petakeu/.agents/teamwork_preview_worker_m2_1/handoff.md` and notify parent.
