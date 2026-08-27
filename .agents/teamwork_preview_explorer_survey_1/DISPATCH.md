## 2026-08-27T06:17:59Z
You are teamwork_preview_explorer_survey_1.
Your working directory is `/home/noah/project/petakeu/.agents/teamwork_preview_explorer_survey_1`.
Create your working directory if needed.
The project workspace root is `/home/noah/project/petakeu`.
Read `/home/noah/project/petakeu/.agents/ORIGINAL_REQUEST.md` and `/home/noah/project/petakeu/.agents/teamwork_preview_orchestrator_5/PROJECT.md`.

Focus: Backend Integration Tests & Docker Services
Investigate:
1. Docker Compose setup (`docker-compose.yml`, containers, ports, environment variables). Check if Postgres (PostGIS), Redis, MinIO are running or need to be started.
2. Server integration test suite in `@petakeu/server` (where tests live, how `PETAKEU_INTEGRATION=1` enables them, what tests are currently skipped or failing).
3. Report worker & upload worker integration pipelines (`apps/server/src/jobs/`, `apps/server/src/services/`, etc.).
4. Database migrations, seeding (`pnpm seed:regions`), and clean connection teardowns in tests (`pool.end()`, Redis disconnect, worker teardown).
5. Document exact commands needed to run and verify live backend integration tests.

Write your findings and comprehensive report to `/home/noah/project/petakeu/.agents/teamwork_preview_explorer_survey_1/handoff.md`.
Send a completion message back to the orchestrator when finished.
