# Execution Plan — Milestone M1 (R1: Future Period Warning Flag)

## Overview
Sub-Orchestration plan for implementing `isFuturePeriod` validation, row warning tagging `meta: { forecast: false }`, SQL bulk UPSERT update, and comprehensive unit tests for upload-worker.

## Steps
1. **Setup & Initialization** [Completed]
   - Initialize BRIEFING.md, plan.md, progress.md, DISPATCH.md.
   - Review ORIGINAL_REQUEST.md, PROJECT.md, and SCOPE.md.

2. **Step 2a: Explorer Investigation** [In Progress]
   - Dispatch `teamwork_preview_explorer` to analyze `apps/server/src/jobs/upload-worker.ts`, existing payments schema, `isFuturePeriod` signature/logic, and bulk UPSERT query structure.

3. **Step 2b: Worker Implementation** [Pending]
   - Dispatch `teamwork_preview_worker` with Explorer findings to implement changes in `upload-worker.ts` and write unit/integration tests in `upload-worker.test.ts`.
   - Verify build and tests pass (`pnpm --filter @petakeu/server build && pnpm --filter @petakeu/server test`).

4. **Step 2c: Peer Review** [Pending]
   - Dispatch 2 `teamwork_preview_reviewer` agents independently to evaluate implementation quality, completeness, and edge case coverage.

5. **Step 2d: Empirical Challenge** [Pending]
   - Dispatch 2 `teamwork_preview_challenger` agents to stress test and run unit/integration verification across past, current, future, and year-end dates.

6. **Step 2e: Forensic Audit** [Pending]
   - Dispatch `teamwork_preview_auditor` to conduct static analysis, runtime verification, and integrity check (check for cheating/facades).

7. **Step 2f: Gate Assessment** [Pending]
   - Evaluate results in `GATE_STATUS.md`. Require: Build pass, test pass, 2 APPROVEs, 2 Challenger confirmations, Auditor CLEAN.

8. **Wrap-up & Handoff** [Pending]
   - Update `SCOPE.md` status to DONE.
   - Write `handoff.md` and send completion message to parent conversation ID `b1dc6c9d-7751-46e1-9d46-ac82bca60cf1`.
