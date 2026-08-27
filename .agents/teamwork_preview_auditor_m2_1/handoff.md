# Forensic Integrity Audit Report: Milestone 2 (Live Service Integration Tests)

**Work Product**: `apps/server/src/integration/`, `apps/server/src/db/minio.ts`, `apps/server/src/test-utils/integration.ts`  
**Profile**: General Project / Live Integration  
**Verdict**: **CLEAN**

---

## 1. Observation

### Source Code Inspection & Forensic Analysis
1. **`apps/server/src/db/minio.ts`**:
   - Lines 9–11: Imports genuine AWS S3 SDK packages `@aws-sdk/client-s3`, `@aws-sdk/lib-storage` (`Upload`), and `@aws-sdk/s3-request-presigner` (`getSignedUrl`).
   - Lines 63–82: Implements `uploadStreamToS3` using the `@aws-sdk/lib-storage` `Upload` class to support parallel multipart stream uploads to MinIO/S3 without buffering the entire payload into heap memory.
   - Lines 84–92: Implements `getPresignedDownloadUrl` using `getSignedUrl` on `GetObjectCommand`.
   - No mock overrides, dummy constants, or fake return facades exist in this module.

2. **`apps/server/src/test-utils/integration.ts`**:
   - Lines 78–139: `probeIntegrationInfrastructure()` actively checks PostgreSQL connectivity, verifies that required tables and materialized views (`regions`, `payments`, `uploads`, `report_jobs`, `mv_payments_with_cut`) exist, asserts seeded PostGIS level-2 geometry rows exist (`SELECT 1 FROM regions WHERE level = 2 AND geom IS NOT NULL LIMIT 1`), checks Redis liveness via `redis.ping()`, and checks MinIO bucket accessibility via `getS3Client().send(new ListBucketsCommand({}))`.
   - Lines 223–230: Generates real cryptographic JWT tokens using `jsonwebtoken` signed with `process.env.AUTH_SECRET`.
   - Lines 263–273: Creates dynamic valid Excel binary buffers using `xlsx`.
   - Lines 301–323: Manages BullMQ job lifecycle and ensures proper queue cleanup on Redis.

3. **`apps/server/src/integration/upload-pipeline.integration.test.ts`**:
   - Lines 144–152: Verifies authorization enforcement by asserting HTTP 403 when a viewer token attempts to create an upload.
   - Lines 154–236: Exercises full upload flow:
     - Pre-checks Redis GeoJSON choropleth cache key (`petakeu:geo:choropleth:${period}`).
     - Creates dynamic multipart Excel upload payload with unique labels.
     - Enqueues upload via HTTP POST to `/api/uploads` (HTTP 202).
     - Upload worker picks up BullMQ job and processes it.
     - Waits for upload record status to reach `persisted`.
     - Directly queries PostgreSQL `payments` table to verify row persistence (`amount`, `period`, `source`).
     - Directly queries PostgreSQL `mv_payments_with_cut` materialized view to verify aggregation update.
     - Directly checks Redis to confirm cache invalidation (`toBeNull()`).
     - Queries `buildChoropleth(period)` to confirm GeoJSON feature value updated.

4. **`apps/server/src/integration/report-generation.integration.test.ts`**:
   - Lines 111–123: Asserts HTTP 403 when a public token requests report generation.
   - Lines 125–193: Exercises full report generation pipeline:
     - Enqueues report export via HTTP POST to `/api/reports/export` (HTTP 201).
     - Report worker processes BullMQ job and streams generated Excel workbook directly to MinIO.
     - Polls `/api/reports/:id` until terminal status `completed`.
     - Validates presigned download URL signature and expiration parameters.
     - Verifies MinIO object metadata directly via `HeadObjectCommand` (`ContentLength > 0`).
     - Downloads the generated report via `fetch(downloadUrl)` and parses workbook sheets via `ExcelJS.Workbook()`, verifying worksheet names `Setoran ${period}` and `Top 10 Peringkat`.
     - Directly queries PostgreSQL `report_jobs` table to verify persisted status, download URL, and summary metadata.

### Independent Behavioral Verification & Test Execution
- Independent test suite execution command:
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
- Result:
  ```
   Test Files  15 passed (15)
        Tests  71 passed (71)
     Start at  13:46:48
     Duration  11.46s (transform 4.02s, setup 4ms, collect 35.85s, tests 10.46s, environment 24ms, prepare 7.59s)
  ```
  - `src/integration/report-generation.integration.test.ts`: 2 passed (1883ms).
  - `src/integration/upload-pipeline.integration.test.ts`: 2 passed (1588ms).
  - Skipped: 0.
  - Failures: 0.

---

## 2. Logic Chain

1. **Absence of Prohibited Patterns**:
   - Zero hardcoded test results: Dynamic inputs (`uniqueLabel`, `findUnlockedPeriod`) and dynamic assertions against live DB state are used throughout.
   - Zero facades: `minio.ts`, `integration.ts`, and server services execute real queries, commands, and streaming operations against live endpoints.
   - Zero mock shortcuts in integration tests: Ripgrep search across `apps/server/src/integration/` and `apps/server/src/test-utils/` confirms zero mock calls (`vi.mock`, `vi.fn`, `vi.spyOn`).

2. **Genuine Live Service Interactions**:
   - PostgreSQL / PostGIS: Schema migrations 001–009 and region geometries are queried and verified. Payments and report jobs are written to and read from Postgres tables.
   - Redis: Keys are set, retrieved, and invalidated. BullMQ queues (`upload-processing`, `report-generation`) communicate via Redis connections.
   - MinIO: Buckets are probed, objects are streamed via `@aws-sdk/lib-storage`, inspected with `HeadObjectCommand`, and fetched via presigned S3 URLs.

3. **Complete Pass Rate**:
   - All 15 test files and 71 tests in `@petakeu/server` passed with 0 skipped tests.

---

## 3. Caveats

- **Backing Service Prerequisites**: Running integration tests requires active PostgreSQL (with PostGIS), Redis, and MinIO instances (e.g. via `docker compose -f docker-compose.dev.yml up -d`) along with seeded database tables (`pnpm seed:regions`). If containers are stopped, tests cleanly detect missing services and skip rather than false-failing.

---

## 4. Conclusion

**Verdict: CLEAN**

Milestone 2 (Live Service Integration Tests) satisfies all integrity and technical requirements:
- Live backing services (PostgreSQL 16 + PostGIS 3.4, Redis 7, MinIO) are genuinely exercised without mocks or facades.
- Object streaming via `@aws-sdk/lib-storage` in `apps/server/src/db/minio.ts` functions end-to-end.
- All 71 tests across 15 test files pass with 0 skipped tests and clean connection teardowns.

---

## 5. Verification Method

To independently re-verify:

```bash
# 1. Ensure docker services are up
docker compose -f docker-compose.dev.yml ps

# 2. Run the server integration test suite
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
