# Plan: E2E Testing Track Orchestration

## Phase 1: Test Infrastructure Definition
- [x] Analyze `ORIGINAL_REQUEST.md`, `PROJECT.md`, and `SCOPE.md`.
- [x] Create `/home/noah/project/petakeu/TEST_INFRA.md` documenting philosophy, 4-tier methodology, feature inventory, and coverage goals for R1 and R2.

## Phase 2: E2E Test Suite Creation (Dispatch Workers)
- [ ] Create `apps/web/e2e/health-readiness.spec.ts` for Requirement R2 (Readiness checks GET /healthz).
  - Tier 1: GET /healthz 200 OK, JSON structure, checks for db, redis, storage, queue.
  - Tier 2: Degraded storage/queue returning 200 OK; 503 Service Unavailable when db or redis fails.
  - Tier 3: Health probe during active payload processing.
  - Tier 4: Real-world continuous monitoring & readiness validation.
- [ ] Create `apps/web/e2e/upload-warning.spec.ts` for Requirement R1 (Future Period Warning Flag).
  - Tier 1: Ingesting past/current period vs future period (`forecast=false` tag in meta).
  - Tier 2: Boundary dates (current month `2026-08`, future month `2026-09`, far future `2030-12`).
  - Tier 3: Concurrent upload streams with mixed historic and future dates.
  - Tier 4: Full flow: Upload file with future dates, verify `forecast=false` warning tag while preserving valid data ingestion.

## Phase 3: Review and Verification (Dispatch Reviewer & Auditor)
- [ ] Review E2E test files for completeness, Playwright best practices, and test independence.
- [ ] Execute Playwright test suite and audit test integrity (ensure no cheating, dummy mocks, or skipped assertions).

## Phase 4: Publishing & Handoff
- [ ] Create `/home/noah/project/petakeu/TEST_READY.md` summarizing test counts, runner instructions, and feature coverage checklist.
- [ ] Write `handoff.md` and notify parent orchestrator via `send_message`.
