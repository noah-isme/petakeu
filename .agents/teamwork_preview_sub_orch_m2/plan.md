# Plan — Milestone M2 (Comprehensive Readiness Health Checks)

## Objective
Implement and verify active health readiness probing (`GET /healthz`) covering DB (PostGIS), Redis (ping), Storage (MinIO buckets), and Queue (BullMQ job counts) with correct HTTP status mapping (200 healthy/degraded vs 503 unhealthy) and comprehensive unit tests.

## Steps
1. **Setup & Initialization**: Initialize state files (`BRIEFING.md`, `plan.md`, `progress.md`, `DISPATCH.md`) and start heartbeat cron. [DONE]
2. **Phase A - Exploration**: Dispatch Explorer (`m2_explorer`) to inspect existing `apps/server/src/utils/health.ts` and `apps/server/src/server.ts`, and detail exact probe logic, error handling, HTTP 200/503 rules, and JSON response schema. [IN-PROGRESS]
3. **Phase B - Implementation**: Dispatch Worker (`m2_worker`) to implement health probe changes and unit test suite `apps/server/src/utils/health.test.ts`. Require build + test verification.
4. **Phase C - Review**: Dispatch 2 Reviewers independently (`m2_reviewer_1`, `m2_reviewer_2`) to audit code, probe logic, status codes, and test coverage.
5. **Phase D - Empirical Stress Testing**: Dispatch 2 Challengers (`m2_challenger_1`, `m2_challenger_2`) to verify 200 healthy, 200 degraded, and 503 unhealthy scenarios.
6. **Phase E - Forensic Integrity Audit**: Dispatch Forensic Auditor (`m2_auditor`) to verify zero cheating, static analysis, and runtime tracing.
7. **Phase F - Gate Verification & Completion**: Evaluate gate criteria in `GATE_STATUS.md`, update `SCOPE.md` status to DONE, write `handoff.md`, and notify parent.
