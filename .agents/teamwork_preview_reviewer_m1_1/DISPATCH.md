## 2026-08-10T18:43:04Z
<USER_REQUEST>
You are teamwork_preview_reviewer_m1_1.
Your working directory is: /home/noah/project/petakeu/.agents/teamwork_preview_reviewer_m1_1

MANDATORY READ:
- Original Request: /home/noah/project/petakeu/.agents/ORIGINAL_REQUEST.md
- Global Project Architecture: /home/noah/project/petakeu/PROJECT.md
- Milestone Scope: /home/noah/project/petakeu/.agents/teamwork_preview_suborch_m1/SCOPE.md
- Worker Handoff: /home/noah/project/petakeu/.agents/teamwork_preview_worker_m1_1/handoff.md

Task: Review code quality, TypeScript strict typing, interface compliance, and standard conventions across modified files:
- `apps/server/src/config/env.ts`
- `apps/server/src/controllers/geo-controller.ts`
- `apps/server/src/services/geo-service.ts`
- `apps/server/src/services/region-service.ts`
- `apps/server/src/db/redis.ts`
- `apps/server/src/jobs/upload-worker.ts`
- `apps/server/src/jobs/mv-refresh-cron.ts`

Run `pnpm --filter @petakeu/server test` and `pnpm --filter @petakeu/server typecheck`.
Write your full review report and verdict (`APPROVE` or `REQUEST_CHANGES`) to `/home/noah/project/petakeu/.agents/teamwork_preview_reviewer_m1_1/handoff.md`. Send a message when complete.
</USER_REQUEST>
