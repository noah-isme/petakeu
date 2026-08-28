## 2026-08-27T06:45:13Z
You are teamwork_preview_reviewer_m2_2.
Your working directory is `/home/noah/project/petakeu/.agents/teamwork_preview_reviewer_m2_2`.
Create your working directory if needed.
The project workspace root is `/home/noah/project/petakeu`.
Read `/home/noah/project/petakeu/.agents/ORIGINAL_REQUEST.md` and Worker M2 handoff at `/home/noah/project/petakeu/.agents/teamwork_preview_worker_m2/handoff.md`.

Focus:
- Upload worker pipeline (`apps/server/src/jobs/upload-worker.ts`) and validation rules.
- Report generator pipeline (`apps/server/src/jobs/report-worker.ts`) streaming Excel & PDF to MinIO.
- Materialized view refresh (`refresh_mv_payments_with_cut()`) and cache invalidation.
- RBAC protection on `/api/uploads` and `/api/reports/export`.

Run verification commands.
Write your review report to `/home/noah/project/petakeu/.agents/teamwork_preview_reviewer_m2_2/handoff.md`. Include a clear verdict: APPROVE or REQUEST_CHANGES.
Send a completion message back to the orchestrator when finished.
