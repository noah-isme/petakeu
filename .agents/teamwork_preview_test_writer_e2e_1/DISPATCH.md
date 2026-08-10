## 2026-08-10T18:22:26Z
<USER_REQUEST>
You are teamwork_preview_test_writer for the Petakeu E2E Test Suite.
Your working directory is: /home/noah/project/petakeu/.agents/teamwork_preview_test_writer_e2e_1

MANDATORY READ:
- Original Request: /home/noah/project/petakeu/.agents/ORIGINAL_REQUEST.md
- Global Project Architecture: /home/noah/project/petakeu/PROJECT.md
- Test Infra: /home/noah/project/petakeu/TEST_INFRA.md

Task:
Implement comprehensive, production-ready Playwright E2E test files under `apps/web/e2e/`:

1. `apps/web/e2e/choropleth-caching.spec.ts` (Tier 1: Choropleth Caching & Query Params)
   - Test `GET /api/v1/geo/choropleth` with period, level (`1`, `2`), parent UUIDs, public mode.
   - Verify GeoJSON response structure (`type: "FeatureCollection"`, `features`, `properties.id`, `properties.neto`).
   - Verify Redis caching headers / response timing on subsequent requests with identical parameters.
   - Include >= 5 distinct test cases covering equivalence classes and query parameters.

2. `apps/web/e2e/region-summary-caching.spec.ts` (Tier 2: Region Summary Caching & Invalidation)
   - Test `GET /api/v1/regions/:id/summary?from=YYYY-MM&to=YYYY-MM`.
   - Verify summary data structure (`region`, `totals`, `monthlyBreakdown`).
   - Test cache hit consistency for repeated calls.
   - Test cache invalidation flow after triggering payment uploads or MV refresh endpoints.
   - Include >= 5 distinct test cases covering normal summary, cache hits, invalidation, and boundary date ranges.

3. `apps/web/e2e/report-generation.spec.ts` (Tier 3: Report Generation Job Enqueueing & Download)
   - Test `POST /api/v1/reports` with report types (`pdf`, `excel`), period ranges (`from`, `to`), region selection.
   - Test `GET /api/v1/reports/:id` status polling (`queued`, `processing`, `completed`).
   - Verify `completed` response contains `downloadUrl` and `summary` JSON metadata (`totalRegions`, `totalNeto`, `changePercentage`, `topGainers`, `topDecliners`).
   - Verify download URL endpoint access and response headers (`Content-Type` for PDF/Excel).
   - Include >= 5 distinct test cases.

4. `apps/web/e2e/real-world-flow.spec.ts` (Tier 4: Real-World Scenarios & Workload Workflows)
   - Real-world map interaction and report export workflow.
   - Multi-region summary comparison and report generation flow.
   - Edge case / error handling for invalid report IDs, invalid region IDs, invalid date formats.
   - Include >= 5 realistic application-level scenario tests.

Verification:
Execute `pnpm --filter @petakeu/web test:e2e` or `npx playwright test` (or check syntax/types/imports if services aren't running locally). Document test run output and pass status in your handoff report.

DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Write your handoff report to `/home/noah/project/petakeu/.agents/teamwork_preview_test_writer_e2e_1/handoff.md` and send a message back to the orchestrator when done.
</USER_REQUEST>
