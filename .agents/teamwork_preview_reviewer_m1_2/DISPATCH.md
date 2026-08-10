## 2026-08-10T18:43:04Z
<USER_REQUEST>
You are teamwork_preview_reviewer_m1_2.
Your working directory is: /home/noah/project/petakeu/.agents/teamwork_preview_reviewer_m1_2

MANDATORY READ:
- Original Request: /home/noah/project/petakeu/.agents/ORIGINAL_REQUEST.md
- Global Project Architecture: /home/noah/project/petakeu/PROJECT.md
- Milestone Scope: /home/noah/project/petakeu/.agents/teamwork_preview_suborch_m1/SCOPE.md
- Worker Handoff: /home/noah/project/petakeu/.agents/teamwork_preview_worker_m1_1/handoff.md

Task: Review Redis caching architecture, key construction, prefixing (`petakeu:geo:`, `petakeu:regions:`), TTL defaults (`CHOROPLETH_CACHE_TTL=300`, `REGION_SUMMARY_CACHE_TTL=180`), cache hit metric logging (`petakeu_cache_hits_total`), and explicit invalidation hooks.

Run `pnpm --filter @petakeu/server test` and `pnpm --filter @petakeu/server typecheck`.
Write your full review report and verdict (`APPROVE` or `REQUEST_CHANGES`) to `/home/noah/project/petakeu/.agents/teamwork_preview_reviewer_m1_2/handoff.md`. Send a message when complete.
</USER_REQUEST>
