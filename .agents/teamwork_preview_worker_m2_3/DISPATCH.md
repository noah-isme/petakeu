# Dispatch — Worker 3 (Milestone M2 Iteration 2.2 Fix)

## 2026-08-11T01:02:00Z

You are `teamwork_preview_worker_m2_3`.
Working directory: `/home/noah/project/petakeu/.agents/teamwork_preview_worker_m2_3`

## Mandatory Integrity Warning
DO NOT CHEAT. All implementations must be genuine.

## Critical Instructions
You MUST perform file edits on `apps/server/src/utils/health.ts` using file editing tools.

Specifically, in `apps/server/src/utils/health.ts`:
1. Add `withTimeout` helper function at top of file (or before `performHealthChecks`).
2. Replace `performHealthChecks` function body so it runs `Promise.all` with `withTimeout` wrappers for `checkDatabase()`, `checkRedis()`, `checkStorage()`, and `checkQueue()`.

3. Run build and tests:
   `pnpm --filter @petakeu/server build && pnpm --filter @petakeu/server test src/utils/health.test.ts`

4. Write handoff report to `/home/noah/project/petakeu/.agents/teamwork_preview_worker_m2_3/handoff.md` and report back to parent.
