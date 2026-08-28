## 2026-08-27T06:35:00Z
You are teamwork_preview_worker_m2.
Your working directory is `/home/noah/project/petakeu/.agents/teamwork_preview_worker_m2`.
Create your working directory if needed.
The project workspace root is `/home/noah/project/petakeu`.
Read `/home/noah/project/petakeu/.agents/ORIGINAL_REQUEST.md` and Explorer 1 findings at `/home/noah/project/petakeu/.agents/teamwork_preview_explorer_survey_1/handoff.md`.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Scope & Tasks for Milestone 2: Live Service Integration Tests:
1. Docker Backing Services:
   - Ensure PostgreSQL (with PostGIS 3.4+), Redis 7, and MinIO are running via Docker Compose (`docker compose -f docker-compose.dev.yml up -d postgres redis minio` or `docker compose up -d`).
   - If foreign containers occupy ports 5432 or 6379 (`toko-api-db-1`, `toko-api-redis-1`), stop them before starting Petakeu containers.
   - Verify health of containers.
2. Database Schema & Seeding:
   - Apply migrations (`001_init.sql` to `009_report_templates.sql`) using `runMigrations()` from `apps/server/src/db/migrate.ts`.
   - Run region seeding (`pnpm seed:regions` or `pnpm --filter @petakeu/server seed:regions`).
3. Run Live Integration Test Suite in `@petakeu/server`:
   - Execute the server test suite with `PETAKEU_INTEGRATION=1` and standard environment variables:
     - `PETAKEU_INTEGRATION=1`
     - `DATABASE_URL=postgresql://petakeu:petakeu@localhost:5432/petakeu`
     - `REDIS_URL=redis://localhost:6379`
     - `STORAGE_ENDPOINT=http://localhost:9000`
     - `STORAGE_ACCESS_KEY=admin`
     - `STORAGE_SECRET_KEY=password123`
     - `STORAGE_BUCKET=uploads`
     - `STORAGE_REPORTS_BUCKET=reports`
     - `AUTH_SECRET=development-secret-for-jwt-signing-minimum-32-chars-long`
     - `AUTH_DISABLED=false`
   - Run `pnpm --filter @petakeu/server test`.
4. Validate Pipelines & Clean Teardowns:
   - Verify that all 71 tests across 15 test files pass with 0 skipped tests.
   - Verify that `upload-pipeline.integration.test.ts` and `report-generation.integration.test.ts` pass completely.
   - Verify that database connections, Redis clients, and BullMQ workers cleanly tear down with no hanging processes.
5. If any test or connection issue arises, debug and resolve it authentically.

Write your handoff report to `/home/noah/project/petakeu/.agents/teamwork_preview_worker_m2/handoff.md`.
Send a completion message back to the orchestrator when finished.
