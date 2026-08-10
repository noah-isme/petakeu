## 2026-08-11T01:13:15Z
<USER_REQUEST>
You are teamwork_preview_explorer_survey_1.
Your working directory is: /home/noah/project/petakeu/.agents/teamwork_preview_explorer_survey_1

MANDATORY: Read the original user request at: /home/noah/project/petakeu/.agents/ORIGINAL_REQUEST.md

Task: Survey the codebase regarding item 1 of the roadmap requirements:
1. Redis Caching for Choropleth GeoJSON (`choropleth:{period}:{level}:{parent}`) & Region Summaries (`/api/v1/regions/:id/summary`) with configurable TTLs, cache hits metric logging (`petakeu_cache_hits_total`), and explicit cache invalidation when new uploads are processed or materialized views refresh.

Investigate:
- Existing route files and controllers for choropleth GeoJSON and region summaries (`apps/server/src/routes/`, `apps/server/src/controllers/`, `apps/server/src/services/`).
- Existing Redis connection/client configuration (e.g. `apps/server/src/lib/redis.ts` or similar).
- Existing metrics/Prometheus setup (how metrics like counters are created and registered).
- Upload processing flow and materialized view (`mv_payments_with_cut`) refresh triggers/jobs (e.g. `apps/server/src/jobs/`, `apps/server/src/services/upload.service.ts` or similar) to see where explicit cache invalidation must be inserted.
- Relevant data structures, TTL configurations, environment variable conventions, and existing tests.

Deliverables:
1. Create `progress.md` in your working directory to report status.
2. Write comprehensive analysis to `/home/noah/project/petakeu/.agents/teamwork_preview_explorer_survey_1/analysis.md`.
3. Write standard handoff report to `/home/noah/project/petakeu/.agents/teamwork_preview_explorer_survey_1/handoff.md` with findings, exact file locations, signatures, and recommendations.
</USER_REQUEST>
