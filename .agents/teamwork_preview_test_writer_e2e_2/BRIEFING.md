# BRIEFING — 2026-08-11T01:03:30Z

## Mission
Refactor E2E test files `apps/web/e2e/upload-warning.spec.ts` and `apps/web/e2e/health-readiness.spec.ts` to remediate Iteration 1 Forensic Audit Integrity Violations, ensuring authentic Playwright E2E tests, deterministic failure mode assertions, zero defensive error swallowing, and update `TEST_READY.md`.

## 🔒 My Identity
- Archetype: test_writer
- Roles: specialist, qa
- Working directory: /home/noah/project/petakeu/.agents/teamwork_preview_test_writer_e2e_2
- Original parent: a407dc60-f03f-4c57-afce-8a9d311bb0da
- Milestone: E2E-Track Iteration 2 Remediation

## 🔒 Key Constraints
- NO CHEATING. All implementations must be authentic Playwright E2E tests sending HTTP requests or interacting with web UI components.
- REMOVE all self-certifying local helper functions (`checkFuturePeriod`, `createPaymentRowPayload`) and in-memory object assertions in `upload-warning.spec.ts`.
- REMOVE all `.catch(() => null)` swallowing of errors and `if (res)` guards.
- REMOVE conditional `if/else` branches that skip assertions.
- Do NOT accept HTTP 400, 401, or 409 error status codes as valid passes for successful upload tests.
- Assert exact response status codes (200 / 202) and returned response JSON body structure / metadata behavior.
- For Tier 2 health failure modes, use Playwright `request` or mock interceptors (`page.route`) to deterministically test 503 unhealthy and 200 degraded status mapping.
- Update `/home/noah/project/petakeu/TEST_READY.md`.
- Ensure typecheck passes (`pnpm --filter @petakeu/web typecheck`).

## Current Parent
- Conversation ID: a407dc60-f03f-4c57-afce-8a9d311bb0da
- Updated: not yet

## Task Summary
- **What to build**: Refactor `upload-warning.spec.ts` and `health-readiness.spec.ts` to be 100% authentic, deterministic Playwright tests. Update `TEST_READY.md`.
- **Success criteria**: Zero self-certifying mock helpers, zero `.catch(() => null)`, zero conditional skips, 100% clean typecheck.
- **Interface contracts**: PROJECT.md & ORIGINAL_REQUEST.md
- **Code layout**: `apps/web/e2e/`

## Loaded Skills
- **Source**: `/home/noah/project/petakeu/.agents/skills/graphify/SKILL.md`
- **Local copy**: N/A
- **Core methodology**: Codebase knowledge graph navigation

## Quality Status
- **Build/test result**: Typecheck pending
- **Lint status**: Pending
- **Tests added/modified**: `upload-warning.spec.ts`, `health-readiness.spec.ts`, `TEST_READY.md`

## Key Decisions Made
- Use Playwright `request` API or `page.route` to deterministically test health readiness endpoints and file uploads without local dummy mock functions.

## Artifact Index
- `DISPATCH.md` — Dispatch prompt
- `BRIEFING.md` — Briefing document
