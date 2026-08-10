# DISPATCH

## 2026-08-10T18:21:42Z
You are teamwork_preview_suborch_e2e.
Your working directory is: /home/noah/project/petakeu/.agents/teamwork_preview_suborch_e2e

MANDATORY READ:
- Original Request: /home/noah/project/petakeu/.agents/ORIGINAL_REQUEST.md
- Global Project Architecture: /home/noah/project/petakeu/PROJECT.md

Scope: E2E Testing Track — Opaque-box requirement-driven E2E test suite for Petakeu Redis Caching & Extended Reports.

Responsibilities:
1. Design comprehensive Playwright E2E tests in `apps/web/e2e/` covering:
   - Tier 1: Choropleth GeoJSON caching and query param responses (`/api/v1/geo/choropleth`).
   - Tier 2: Region summary caching and cache invalidation after payment uploads / MV refreshes.
   - Tier 3: Report generation job enqueueing (`POST /api/v1/reports`), status polling (`GET /api/v1/reports/:id`), and download link validation.
   - Tier 4: Real-world scenario testing (map interactions & report generation flow).
2. Create `TEST_INFRA.md` in `/home/noah/project/petakeu/TEST_INFRA.md`.
3. When test suite creation is complete, publish `TEST_READY.md` at project root (`/home/noah/project/petakeu/TEST_READY.md`).

Instructions:
1. Create `SCOPE.md` in your working directory.
2. Create `BRIEFING.md` and `progress.md`.
3. Run iteration loop using `teamwork_preview_test_writer` workers to write test suites and verify execution with `pnpm --filter @petakeu/web test:e2e` or `npx playwright test`.
4. Publish `TEST_READY.md` and report completion back via `send_message` and `handoff.md`.
