## 2026-08-27T07:21:12Z
You are teamwork_preview_worker_m3_fix.
Your working directory is `/home/noah/project/petakeu/.agents/teamwork_preview_worker_m3_fix`.
Create your working directory if needed.
The project workspace root is `/home/noah/project/petakeu`.
Read:
- `/home/noah/project/petakeu/.agents/ORIGINAL_REQUEST.md`
- Auditor handoff with full evidence: `/home/noah/project/petakeu/.agents/teamwork_preview_auditor_m3_1/handoff.md`
- Reviewer 1 handoff: `/home/noah/project/petakeu/.agents/teamwork_preview_reviewer_m3_1/handoff.md`
- Reviewer 2 handoff: `/home/noah/project/petakeu/.agents/teamwork_preview_reviewer_m3_2/handoff.md`

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Remediation Tasks:
1. `apps/web/vite.config.ts`:
   - Fix TypeScript typing:
     - Import `defineConfig` from `"vitest/config"`.
     - Import `type Plugin, type ViteDevServer, type Connect` from `"vite"`.
     - Import `type ServerResponse` from `"node:http"`.
     - Type `configureServer(server: ViteDevServer)` and `(req: Connect.IncomingMessage, res: ServerResponse, next: Connect.NextFunction)`.
   - In `devMockServerPlugin`:
     - For `POST /api/reports/export` and `POST /api/v1/reports/export`: Parse request body JSON asynchronously, and extract `format` (`pdf` or `excel`), `period`, `regionIds`. Return the actual requested `format`, not hardcoded `"pdf"`.
     - For `GET /api/reports/:id` and `GET /api/v1/reports/:id`: If ID is `00000000-0000-0000-0000-000000000000`, return HTTP 404 (`{"error": "Report not found"}`). Otherwise, return terminal status `"completed"` with progress `100` and downloadUrl.
     - For `/healthz*` and `/api/healthz*`: Only return 200 for exact `/healthz`, `/api/healthz`, `/api/v1/healthz`. For unknown subpaths (e.g. `/healthz/non-existent`, `/healthz-invalid-route-123`, `/health/unknown`), return HTTP 404 with JSON error.
     - For any other unhandled `/api/*` or `/healthz/*` requests, return HTTP 404 rather than passing through to Vite's HTML fallback.
2. `apps/web/src/mocks/handlers.ts`:
   - In `handleGetRegionSummary`: Cache and retain the `lastUpdated` timestamp per `regionId` and period so repeated requests with `X-Cache: HIT` return the consistent cached timestamp instead of generating a new `nowIso()` timestamp each time.
3. `apps/web/src/api/__tests__/client.test.ts`:
   - Verify all unit tests pass, ensuring `downloadUploadTemplate` tests match actual mock behavior.
4. `apps/server/src/jobs/report-worker.test.ts`:
   - Ensure the large multi-region streaming test has adequate Vitest test timeout (e.g. 30_000ms) so it does not time out under load.
5. Verification:
   - Run `pnpm build` (verify `tsc -b && vite build` completes with exit code 0).
   - Run `pnpm typecheck` and `pnpm lint`.
   - Run `pnpm test` (all unit tests pass).
   - Run `pnpm --filter @petakeu/web test:e2e` (all E2E tests pass).

Write your handoff report to `/home/noah/project/petakeu/.agents/teamwork_preview_worker_m3_fix/handoff.md`.
Send a completion message back to the orchestrator when finished.
