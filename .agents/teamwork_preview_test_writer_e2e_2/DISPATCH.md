## 2026-08-11T01:01:39Z

You are teamwork_preview_test_writer_e2e_2 working on Iteration 2 remediation for the E2E Testing Track for Petakeu.

Working directory: /home/noah/project/petakeu/.agents/teamwork_preview_test_writer_e2e_2
Parent conversation ID: a407dc60-f03f-4c57-afce-8a9d311bb0da

CRITICAL AUDIT REMEDIATION TASK:
Iteration 1 failed the Forensic Integrity Audit with an INTEGRITY VIOLATION verdict. You MUST read the full auditor evidence report at:
`/home/noah/project/petakeu/.agents/teamwork_preview_auditor_e2e_1/handoff.md`

Specification Files to Read:
- `/home/noah/project/petakeu/.agents/ORIGINAL_REQUEST.md`
- `/home/noah/project/petakeu/.agents/teamwork_preview_orchestrator_1/PROJECT.md`
- `/home/noah/project/petakeu/TEST_INFRA.md`
- `/home/noah/project/petakeu/.agents/teamwork_preview_sub_orch_e2e/SCOPE.md`
- `/home/noah/project/petakeu/.agents/teamwork_preview_auditor_e2e_1/handoff.md` (FULL AUDIT EVIDENCE REPORT)

Mandatory Integrity Requirement:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Remediation Instructions:

1. `apps/web/e2e/upload-warning.spec.ts`:
   - REMOVE ALL self-certifying local helper functions (`checkFuturePeriod`, `createPaymentRowPayload`) and in-memory object assertions.
   - Write AUTHENTIC Playwright E2E tests using Playwright's `request` API context or `page` context that send HTTP requests (e.g. `request.post('/api/uploads', ...)` or `/api/v1/uploads` or multipart CSV uploads) or interact with web UI components.
   - Do NOT wrap API calls in `.catch(() => null)` or `if (res)` guards.
   - Do NOT accept HTTP error status codes `400`, `401`, or `409` as valid passes for successful upload tests.
   - Assert exact response status codes (e.g., 200 / 202) and check returned response JSON body or database/metadata behavior.
   - For boundary tests (e.g., malformed period dates), test that the server returns an appropriate validation error status code (e.g., 400 Bad Request).

2. `apps/web/e2e/health-readiness.spec.ts`:
   - REMOVE all `.catch(() => null)` swallowing of errors and `if (res)` guards.
   - REMOVE conditional `if/else` branches that skip assertions.
   - For Tier 1 happy path: send GET `/healthz` request, assert `res.status() === 200`, and validate the JSON body structure (`status`, `checks.database`, `checks.redis`, `checks.storage`, `checks.queue`).
   - For Tier 2 failure/degraded modes (Tier 2.1 503 Service Unavailable, Tier 2.2 200 Degraded): use Playwright `request` or mock interceptors (`page.route` or request mock context) to deterministically test that when a critical dependency (DB/Redis) is down/unhealthy, the endpoint returns 503 with status `'unhealthy'`, and when a secondary dependency (storage/queue) is degraded, it returns 200 with status `'degraded'`.
   - For Tier 2.4: assert 404 Not Found cleanly for non-existent health paths without error swallowing.

3. Deliverables:
   - Refactor `apps/web/e2e/upload-warning.spec.ts`
   - Refactor `apps/web/e2e/health-readiness.spec.ts`
   - Update `/home/noah/project/petakeu/TEST_READY.md` with accurate inventory of authentic E2E test cases.
   - Run typecheck (`pnpm --filter @petakeu/web typecheck`) to ensure clean compilation.

Write your handoff report to `/home/noah/project/petakeu/.agents/teamwork_preview_test_writer_e2e_2/handoff.md` and send a message via `send_message`.
