# Milestone 2 Empirical Challenge Report: Live Integration Tests

## 1. Observation

### 1.1 Full Test Suite Execution with Live Services
The test suite in `@petakeu/server` was executed against live PostgreSQL 16 (with PostGIS 3.4), Redis 7, and MinIO storage using the following command:

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

**Verbatim Execution Summary:**
```text
Test Files  16 passed (16)
     Tests  76 passed (76)
  Start at  13:52:37
  Duration  9.39s
```

All test suites executed without error:
- `src/middleware/auth.test.ts` (3/3 passed)
- `src/jobs/report-branding.test.ts` (1/1 passed)
- `src/services/upload-validation.test.ts` (4/4 passed)
- `src/validators/report.test.ts` (4/4 passed)
- `src/jobs/report-worker.test.ts` (4/4 passed)
- `src/jobs/upload-worker.test.ts` (8/8 passed)
- `src/validators/analytics.test.ts` (5/5 passed)
- `src/jobs/scheduled-report-cron.test.ts` (4/4 passed)
- `src/services/report-email-service.test.ts` (2/2 passed)
- `src/services/geo-service.test.ts` (3/3 passed)
- `src/utils/health.test.ts` (24/24 passed)
- `src/db/redis.test.ts` (3/3 passed)
- `src/services/region-service.test.ts` (2/2 passed)
- `src/integration/report-generation.integration.test.ts` (2/2 passed)
- `src/integration/upload-pipeline.integration.test.ts` (2/2 passed)
- `src/integration/lifecycle.integration.test.ts` (5/5 passed)

**Zero tests were skipped** across all test suites (`Skipped: 0`).

### 1.2 Isolated Integration Suite Verification
Running the dedicated integration suites in isolation:
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
pnpm --filter @petakeu/server test src/integration/
```
Output:
```text
Test Files  2 passed (2)
     Tests  4 passed (4)
  Duration  4.66s
```

### 1.3 Deep Inspection of Integration Test Integrity
1. **Upload Pipeline Integration (`src/integration/upload-pipeline.integration.test.ts`)**:
   - Gated by `probeIntegrationInfrastructure()`.
   - Starts a live Express server on a dynamic port (`listenApp`), a live BullMQ upload worker (`startUploadWorker()`), and initializes MinIO buckets (`initStorage()`).
   - Generates a valid XLSX file with real BPS codes from the seeded PostGIS `regions` table.
   - Issues a `POST /api/uploads` multipart request with an `operator` role JWT.
   - Polls `/api/uploads/:id` until terminal status `persisted`.
   - Directly queries PostgreSQL `payments` table to verify payment row insertion.
   - Directly queries PostgreSQL materialized view `mv_payments_with_cut` to verify that `refresh_mv_payments_with_cut()` updated aggregated revenue sums.
   - Directly checks Redis to verify that choropleth cache (`petakeu:geo:choropleth:${period}`) was invalidated and subsequent GeoJSON generation recalculates correctly.
   - Verifies 403 Forbidden enforcement for `viewer` role tokens.
   - Cleanly deletes test payments, uploads, S3 objects, and BullMQ jobs in `afterAll`.

2. **Report Generation Integration (`src/integration/report-generation.integration.test.ts`)**:
   - Gated by `probeIntegrationInfrastructure()`.
   - Starts live Express server, live BullMQ report worker (`startReportWorker()`), and storage initialization.
   - Issues `POST /api/reports/export` for an Excel export with `viewer` role JWT.
   - Polls `/api/reports/:id` until terminal status `completed`.
   - Asserts presigned `downloadUrl` includes `X-Amz-Signature` and `X-Amz-Expires=86400`.
   - Executes S3 `HeadObjectCommand` to verify physical existence in MinIO with `ContentLength > 0`.
   - Executes `fetch(downloadUrl)` to download the real spreadsheet from MinIO and loads it into `ExcelJS.Workbook`, asserting worksheet names `Setoran ${period}` and `Top 10 Peringkat`.
   - Verifies 403 Forbidden enforcement for `public` role tokens.
   - Cleanly deletes test report jobs, S3 objects, and BullMQ jobs in `afterAll`.

3. **Lifecycle & Teardown Verification (`src/integration/lifecycle.integration.test.ts`)**:
   - Verifies idempotent double-shutdown of PostgreSQL pool and Redis client without dangling handles or unhandled rejections.
   - Verifies HTTP server listener lifecycle and socket release.
   - Verifies BullMQ worker and queue instance clean teardowns without lingering Redis connections.
   - Verifies 0 active TCP socket leaks upon teardown.

### 1.4 Code Quality & Static Analysis
- `pnpm --filter @petakeu/server typecheck` passed with 0 errors.
- `pnpm --filter @petakeu/server lint` passed with 0 errors (4 ignorable warnings for unused variables/default member).

---

## 2. Logic Chain

1. **Infrastructure Preconditions**: Active Docker containers `petakeu-postgres-1` (PostGIS 16-3.4), `petakeu-redis-1` (Redis 7), and `petakeu-minio-1` (MinIO) were running and healthy on their designated ports (`5432`, `6379`, `9000/9001`).
2. **Schema & Geometry Validation**: Migrations 001–009 and regional seed data (34 provinces, 57 regencies) are intact, satisfying `probeIntegrationInfrastructure()`.
3. **Execution & Non-Mocking Proof**: Neither the upload pipeline nor report generation test suites mock database queries, Redis cache calls, or MinIO S3 client commands. The tests execute true end-to-end flows: HTTP request $\rightarrow$ Express controller $\rightarrow$ BullMQ Redis queue $\rightarrow$ background worker $\rightarrow$ MinIO streaming upload $\rightarrow$ PostgreSQL insertion / MV refresh $\rightarrow$ cache invalidation.
4. **Zero-Skip Verification**: In all test runs with `PETAKEU_INTEGRATION=1`, zero tests were skipped (`Skipped: 0`).
5. **Clean Resource Teardown**: Teardowns terminate HTTP listeners, close BullMQ workers and queues, delete created test objects in MinIO, clean database test records, and shutdown pool/client sockets cleanly.

---

## 3. Caveats

- **Host Port Management**: Backing services must retain exclusive access to ports 5432, 6379, and 9000. Foreign containers or local daemons attempting to bind these ports must be stopped before test execution.
- **Node.js Environment**: Tests require Node.js $\ge 20$ and valid `AUTH_SECRET` ($\ge 32$ characters) for JWT verification.

---

## 4. Conclusion

### **VERDICT: APPROVE**

Milestone 2 integration tests have been empirically challenged and thoroughly verified.
- The `PETAKEU_INTEGRATION=1` server test suite executes successfully against live PostgreSQL (PostGIS), Redis, and MinIO.
- Both the upload pipeline and report generation integration tests execute real I/O pipelines and pass with 100% success.
- Zero tests are skipped across all test files.
- Static typing and linting checks are fully compliant.

---

## 5. Verification Method

To reproduce the empirical test execution independently:

```bash
# 1. Ensure Docker backing services are running and healthy
docker compose -f docker-compose.dev.yml ps

# 2. Run the complete server integration test suite
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

# 3. Verify static typechecking and linting
pnpm --filter @petakeu/server typecheck
pnpm --filter @petakeu/server lint
```
