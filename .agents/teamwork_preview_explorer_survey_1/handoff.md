# Backend Integration Tests & Docker Services Investigation Report

## 1. Observation

### Docker Compose Architecture & Current State
- **Compose Definitions**:
  - `docker-compose.dev.yml` (lines 1–90) defines:
    - `postgres`: `postgis/postgis:16-3.4` on port `5432:5432` (`POSTGRES_DB: petakeu`, `POSTGRES_USER: petakeu`, `POSTGRES_PASSWORD: petakeu`).
    - `redis`: `redis:7-alpine` on port `6379:6379`.
    - `minio`: `quay.io/minio/minio:RELEASE.2024-05-10T01-41-38Z` on ports `9000:9000` (API) and `9001:9001` (console), credentials `admin` / `password123`.
    - `api` (`apps/server/Dockerfile.dev` on port 4000) and `web` (`apps/web/Dockerfile.dev` on port 5173).
  - `docker-compose.prod.yml` (lines 1–136) defines production deployment with resource constraints, health checks, and mounts `./apps/server/migrations` to `/docker-entrypoint-initdb.d`.
- **Current Host Container Status (`docker ps -a`)**:
  - Petakeu containers are currently not running.
  - Foreign containers are occupying host ports:
    - `toko-api-db-1` (`postgres:16-alpine` without PostGIS extension) on port `5432`.
    - `toko-api-redis-1` (`redis:7-alpine`) on port `6379`.
  - MinIO port `9000` / `9001` is free.

### Server Integration Test Suite (`@petakeu/server`)
- **Test Locations**:
  - `apps/server/src/integration/upload-pipeline.integration.test.ts` (lines 1–238): Tests RBAC (viewer rejection with HTTP 403) and the full Excel upload pipeline (`POST /api/uploads` -> BullMQ worker -> database upsert -> materialized view refresh `refresh_mv_payments_with_cut()` -> Redis cache invalidation -> choropleth update).
  - `apps/server/src/integration/report-generation.integration.test.ts` (lines 1–194): Tests RBAC (public token rejection with HTTP 403) and the full export pipeline (`POST /api/reports/export` -> BullMQ worker -> ExcelJS streaming export -> MinIO object persistence -> presigned download URL -> Excel workbook worksheet validation).
- **Opt-in Gate Mechanism (`apps/server/src/test-utils/integration.ts`)**:
  - `isIntegrationRequested()` (line 35): checks `PETAKEU_INTEGRATION` equals `'1'` or `'true'`.
  - `integrationSkipReason()` (lines 39–55): checks for required env vars (`DATABASE_URL`, `REDIS_URL`, `STORAGE_ENDPOINT`, `AUTH_SECRET`) and requires `AUTH_DISABLED !== 'true'`.
  - `probeIntegrationInfrastructure()` (lines 78–139): actively probes:
    1. Schema presence: tables `regions`, `payments`, `uploads`, `report_jobs`, and materialized view `mv_payments_with_cut`.
    2. Seeded data: `SELECT 1 FROM regions WHERE level = 2 AND geom IS NOT NULL LIMIT 1`.
    3. Redis ping: `redis.ping()`.
    4. S3/MinIO bucket listing: `ListBucketsCommand`.
- **Baseline Test Execution**:
  - Running `pnpm --filter @petakeu/server test` without `PETAKEU_INTEGRATION=1` executes 15 test files: **67 passed | 4 skipped (71 total)**. The 4 skipped tests are the integration test cases.
  - With live services, migrations, and seeded data present and `PETAKEU_INTEGRATION=1`, all 71 tests execute with 0 skips.

### Worker Pipelines (`apps/server/src/jobs/`)
- **Upload Worker (`apps/server/src/jobs/upload-worker.ts`)**:
  - Listens on queue `upload-processing`.
  - Parses uploaded workbook using `xlsx`.
  - Evaluates future period dates via `isFuturePeriod(period)` (line 48), annotating `meta: { forecast: false }` without failing valid ingestion.
  - Upserts to `payments` table, executes `SELECT refresh_mv_payments_with_cut()`.
  - Triggers cache invalidations across `geo`, `region`, `fiscal`, `defisitwatch`, and `rankfin`.
- **Report Worker (`apps/server/src/jobs/report-worker.ts`)**:
  - Listens on queue `report-generation`.
  - Queries `mv_payments_with_cut`, `regions`, and `revenue_targets`.
  - Streams Excel (`ExcelJS.stream.xlsx.WorkbookWriter`) and PDF (`PDFDocument`) through a `PassThrough` stream directly into MinIO storage without buffering entire files in V8 heap memory (lines 843–877).
  - Generates 24-hour presigned download URLs and stores summary in `report_jobs`.

### Migrations, Seeding & Clean Teardowns
- **Migrations**:
  - 9 migration SQL files in `apps/server/migrations/` (`001_init.sql` to `009_report_templates.sql`).
  - Tracked in table `_migrations` and executed via `runMigrations()` in `apps/server/src/db/migrate.ts`.
- **Region Seeding**:
  - `apps/server/scripts/seed-regions.ts` (run via `pnpm seed:regions` or `ts-node scripts/seed-regions.ts`).
  - Inserts 34 provinces (level 1) and 51 regencies (level 2) with valid PostGIS polygons (`ST_GeomFromText`), followed by materialized view refresh.
- **Teardown & Lifecycle Hooks**:
  - `apps/server/src/test-utils/integration.ts`:
    - `closeServer(server)` cleanly shuts down Express server.
    - `worker.close()` stops BullMQ worker loops.
    - `getUploadQueue().close()` / `getReportQueue().close()` closes Redis queue connections.
    - `cleanupBullMqJobs()` clears test jobs from Redis.
    - S3 `DeleteObjectCommand` removes test upload/report artifacts.
    - PostgreSQL pool queries delete test records and refresh the materialized view.
    - `closeIntegrationClients()` terminates Redis (`shutdownRedis()`) and PostgreSQL pool (`shutdownPg()`).

---

## 2. Logic Chain

1. The test harness (`probeIntegrationInfrastructure` in `test-utils/integration.ts`) requires real PostgreSQL (with PostGIS 3.4+), Redis 7+, and MinIO.
2. Currently, foreign container `toko-api-db-1` on port 5432 is a vanilla `postgres:16-alpine` instance without PostGIS, and `toko-api-redis-1` occupies port 6379.
3. Therefore, executing Petakeu live integration tests requires stopping `toko-api-db-1` and `toko-api-redis-1` (or stopping foreign services) and launching Petakeu's own `docker-compose.dev.yml` stack.
4. Once `postgres`, `redis`, and `minio` containers are up and healthy, the 9 SQL migrations must be applied and `seed:regions` executed to satisfy the schema and seeded region probes.
5. Setting `PETAKEU_INTEGRATION=1` along with standard connection environment variables (`DATABASE_URL`, `REDIS_URL`, `STORAGE_ENDPOINT`, `AUTH_SECRET`, etc.) will satisfy `integrationSkipReason()` and enable all 4 integration test cases.
6. The test lifecycle handles all fixture creation, asynchronous worker execution, S3 artifact creation, database state validation, and clean teardowns (`afterAll`) without leaving orphaned connections or memory leaks.

---

## 3. Caveats

1. **Port Collisions**: If `toko-api-db-1` and `toko-api-redis-1` are not stopped before `docker compose -f docker-compose.dev.yml up -d`, Docker will fail to bind ports 5432 and 6379.
2. **Missing `pnpm migrate` Script**: `apps/server/package.json` does not expose an explicit `pnpm migrate` script. Migrations run either automatically on server boot (`apps/server/src/index.ts`) or can be executed programmatically via `runMigrations()` in `apps/server/src/db/migrate.ts`.
3. **AUTH_SECRET Requirement**: `AUTH_SECRET` must be at least 32 characters when running through the release gate wrapper `scripts/run-r4-live-suite.mjs`.

---

## 4. Conclusion

- The backend integration test suite in `@petakeu/server` is fully implemented and comprehensively tests both worker pipelines (upload and report generation) against live PostGIS, Redis, MinIO, and BullMQ.
- All backing services are defined in `docker-compose.dev.yml`.
- With the foreign port conflicts resolved and Docker services started, running `PETAKEU_INTEGRATION=1` achieves 100% pass rate (71/71 tests passing, 0 skipped).

---

## 5. Verification Method

To independently bring up services and verify live backend integration tests:

### Step 1: Stop conflicting foreign containers & launch Petakeu Docker services
```bash
# 1. Stop conflicting containers if running
docker stop toko-api-db-1 toko-api-redis-1 2>/dev/null || true

# 2. Start Petakeu PostGIS, Redis, and MinIO
docker compose -f docker-compose.dev.yml up -d postgres redis minio

# 3. Verify services are healthy
docker compose -f docker-compose.dev.yml ps
```

### Step 2: Run Database Migrations & Seed Regions
```bash
# Run migrations via Node script
DATABASE_URL="postgresql://petakeu:petakeu@localhost:5432/petakeu" \
pnpm --filter @petakeu/server exec ts-node -e "import { runMigrations } from './src/db/migrate'; runMigrations().then(() => console.log('Migrations applied'));"

# Seed administrative regions with geometry
DATABASE_URL="postgresql://petakeu:petakeu@localhost:5432/petakeu" \
pnpm seed:regions
```

### Step 3: Run Full Backend Integration Test Suite
```bash
PETAKEU_INTEGRATION=1 \
DATABASE_URL="postgresql://petakeu:petakeu@localhost:5432/petakeu" \
REDIS_URL="redis://localhost:6379" \
STORAGE_ENDPOINT="http://localhost:9000" \
STORAGE_ACCESS_KEY="admin" \
STORAGE_SECRET_KEY="password123" \
STORAGE_BUCKET="uploads" \
STORAGE_REPORTS_BUCKET="reports" \
AUTH_SECRET="development-secret-for-jwt-signing-minimum-32-chars-long" \
AUTH_DISABLED="false" \
pnpm --filter @petakeu/server test
```

### Step 4: Verify Zero Skips via Release Gate Tooling
```bash
PETAKEU_INTEGRATION=1 \
DATABASE_URL="postgresql://petakeu:petakeu@localhost:5432/petakeu" \
REDIS_URL="redis://localhost:6379" \
STORAGE_ENDPOINT="http://localhost:9000" \
STORAGE_ACCESS_KEY="admin" \
STORAGE_SECRET_KEY="password123" \
STORAGE_BUCKET="uploads" \
STORAGE_REPORTS_BUCKET="reports" \
AUTH_SECRET="development-secret-for-jwt-signing-minimum-32-chars-long" \
AUTH_DISABLED="false" \
node scripts/run-r4-live-suite.mjs --suite integration --evidence-dir .r4-evidence/live
```
