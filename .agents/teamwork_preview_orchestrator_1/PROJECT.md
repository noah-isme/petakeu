# Project: Petakeu Roadmap R1 & R2

## Architecture
- Monorepo: Turborepo + pnpm workspaces (`apps/web`, `apps/server`).
- Backend: Express 4 + TypeScript (`apps/server`).
- Database: PostgreSQL 16 + PostGIS 3.4 (`getPgPool()`).
- Cache & Queue: Redis 7 + BullMQ 5 (`uploadQueue`, `reportQueue`).
- Object Storage: MinIO (`@aws-sdk/client-s3`).
- Data Flow for Uploads: `upload-controller` -> `upload-service` -> MinIO storage & BullMQ `uploadQueue` -> `upload-worker` (`processUpload`) -> `payments` table bulk UPSERT (`meta JSONB`).
- Health Probe Flow: `GET /healthz` -> `server.ts` -> `health.ts` (`performHealthChecks`) -> probes DB (PostGIS), Redis, Storage (MinIO buckets), Queue (BullMQ queues) -> returns HTTP status 200/503 & JSON report.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | `isFuturePeriod` Validation | Exported helper checking incoming payment period (`YYYY-MM`) against `CURRENT_DATE` | M1 | survey_explorer_1 |
| 2 | Warning Metadata Tagging | Tag future period payment rows with `meta: { forecast: false }` without rejecting valid data | M1 | survey_explorer_1 |
| 3 | Payment UPSERT Meta Field | Update `INSERT INTO payments` SQL to store `meta` JSONB on insert & conflict update | M1 | survey_explorer_1 |
| 4 | R1 Unit & Integration Tests | Unit tests for `isFuturePeriod` (past, current, future) & upload-worker job processing in `apps/server/src/jobs/upload-worker.test.ts` | M1 | survey_explorer_1 |
| 5 | PostGIS DB Health Probe | Upgrade `checkDatabase()` in `health.ts` to execute `SELECT 1 AS alive, PostGIS_Version() AS postgis_version` | M2 | survey_explorer_2 |
| 6 | Redis Connection Probe | Execute `redis.ping()` returning `'PONG'` in `checkRedis()` in `health.ts` | M2 | survey_explorer_2 |
| 7 | MinIO Storage Probe | Verify `uploads` and `reports` bucket accessibility in `checkStorage()` in `health.ts` | M2 | survey_explorer_2 |
| 8 | BullMQ Worker Queue Probe | Implement `checkQueue()` probing `uploadQueue` & `reportQueue` job counts in `health.ts` | M2 | survey_explorer_2 |
| 9 | Readiness HTTP Status & Schema | Implement HTTP 200 (healthy/degraded) vs 503 (DB/Redis unhealthy) status code mapping & JSON schema in `health.ts` and `server.ts` | M2 | survey_explorer_2 |
| 10 | R2 Unit & Integration Tests | Create comprehensive mock test suite `apps/server/src/utils/health.test.ts` covering healthy, degraded, and 503 failure modes | M2 | survey_explorer_2 |
| 11 | E2E Test Suite (Tiers 1-4) | Requirements-driven E2E test suite for R1 and R2 in `apps/web/e2e/` (Tiers 1-4) | E2E-Track | survey_explorer_3 |
| 12 | E2E Test Pass & Tier 5 Hardening | Pass 100% E2E tests and conduct white-box adversarial coverage hardening | M3 | Orchestrator Spec |

## Milestones
| # | Name | Scope | Dependencies | Status | Conversation ID |
|---|------|-------|-------------|--------|-----------------|
| E2E-Track | E2E Test Suite Creation | Opaque-box E2E test suite for R1 & R2 (Tiers 1-4) publishing `TEST_READY.md` | None | IN_PROGRESS | a407dc60-f03f-4c57-afce-8a9d311bb0da |
| M1 | Future Period Warning Flag (R1) | Implement `isFuturePeriod`, warning tag `forecast=false`, payments upsert, & unit tests | None | IN_PROGRESS | 96118095-9f5d-4cd5-995f-41f5753fbd6b |
| M2 | Readiness Health Checks (R2) | Implement DB/PostGIS, Redis, Storage, Queue probes, HTTP 200/503 status rules, & unit tests | None | DONE | b5498e98-dd96-4165-ad51-b7c590614691 |
| M3 | Final Milestone & Tier 5 Hardening | Pass 100% E2E tests (Tiers 1-4) + Adversarial Coverage Hardening (Tier 5) | E2E-Track, M1, M2 | PLANNED | - |

## Interface Contracts

### 1. Future Period Warning Flag (R1)
- **Helper Signature**:
  ```ts
  export function isFuturePeriod(period: string, referenceDate: Date = new Date()): boolean
  ```
  - Input: `period` string formatted as `"YYYY-MM"`, optional `referenceDate` `Date` object.
  - Output: `true` if `period` is strictly after the month/year of `referenceDate`, `false` otherwise.
- **Payment Row Representation**:
  - Payment entity includes `meta: Record<string, unknown>`.
  - Future period rows set `meta.forecast = false`.
  - Non-future rows maintain empty/default `meta = {}`.
- **Database UPSERT Query**:
  ```sql
  INSERT INTO payments(id, region_id, period, amount, source, meta)
  VALUES(gen_random_uuid(), $1, ($2 || '-01')::date, $3, $4, $5::jsonb)
  ON CONFLICT (region_id, period, source)
  DO UPDATE SET amount = EXCLUDED.amount, meta = EXCLUDED.meta, updated_at = NOW()
  ```

### 2. Comprehensive Readiness Health Checks (R2)
- **Endpoint**: `GET /healthz`
- **Response Format**:
  ```json
  {
    "status": "healthy" | "degraded" | "unhealthy",
    "checks": {
      "database": {
        "status": "healthy" | "unhealthy",
        "latencyMs": number,
        "details": { "query": string, "postgisVersion": string },
        "error"?: string
      },
      "redis": {
        "status": "healthy" | "unhealthy",
        "latencyMs": number,
        "details": { "command": string },
        "error"?: string
      },
      "storage": {
        "status": "healthy" | "degraded",
        "latencyMs": number,
        "details": { "provider": string, "buckets": string[] },
        "error"?: string
      },
      "queue": {
        "status": "healthy" | "degraded",
        "latencyMs": number,
        "details": {
          "uploadQueue": { "active": number, "waiting": number, "completed": number, "failed": number },
          "reportQueue": { "active": number, "waiting": number, "completed": number, "failed": number }
        },
        "error"?: string
      }
    },
    "timestamp": string,
    "uptime": number
  }
  ```
- **HTTP Status Code Mapping**:
  - `checks.database.status === 'unhealthy'` OR `checks.redis.status === 'unhealthy'` => **HTTP 503** (overall status `'unhealthy'`).
  - Database and Redis healthy, but `storage` or `queue` is `'degraded'` => **HTTP 200** (overall status `'degraded'`).
  - All 4 components healthy => **HTTP 200** (overall status `'healthy'`).

## Code Layout
- `apps/server/src/jobs/upload-worker.ts`: Upload job processing, `isFuturePeriod()`, payments UPSERT with `meta`.
- `apps/server/src/jobs/upload-worker.test.ts`: R1 Unit and integration tests.
- `apps/server/src/utils/health.ts`: Component probes (`checkDatabase`, `checkRedis`, `checkStorage`, `checkQueue`), overall health summary.
- `apps/server/src/server.ts`: Route registration for `/healthz`, status code assignment (200 vs 503).
- `apps/server/src/utils/health.test.ts`: R2 Unit and integration tests with mocks.
- `apps/web/e2e/health-readiness.spec.ts`: R2 E2E Playwright test suite.
- `apps/web/e2e/upload-warning.spec.ts`: R1 E2E Playwright test suite.
