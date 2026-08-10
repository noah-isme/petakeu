# Project Execution Plan — Petakeu R1 & R2

## Overview
This plan defines the step-by-step orchestration strategy for delivering:
1. **R1**: Future Period Warning Flag (`forecast=false`) validation in upload pipeline (`upload-service.ts` / `upload-worker.ts`).
2. **R2**: Comprehensive Readiness Health Checks (`GET /healthz`) probing PostGIS, Redis, BullMQ worker queue, and MinIO storage in `apps/server/src/utils/health.ts` and `apps/server/src/routes/v1/health.ts` (or relevant route files).

## Phases

### Phase 0: Survey & Scope Mapping (Current)
- Dispatch 3 parallel Explorers to investigate:
  - Explorer 1: Upload pipeline (`upload-service.ts`, `upload-worker.ts`, database schema/payments table columns, validation mechanisms).
  - Explorer 2: Health check infrastructure (`apps/server/src/utils/health.ts`, routes, dependencies for PostGIS/DB, Redis, BullMQ, MinIO).
  - Explorer 3: Existing testing framework, test runners, E2E test setup, unit test locations.
- Aggregate Explorer findings into `PROJECT.md` (Feature Inventory, Architecture, Milestones, Interface Contracts).

### Phase 1: Dual Track Execution Setup
- **E2E Testing Track**: Spawn E2E Testing Sub-Orchestrator to design test infrastructure, write Tier 1-4 opaque-box tests for R1 and R2, and produce `TEST_READY.md`.
- **Implementation Track**:
  - **Milestone 1 (M1)**: R1 Implementation (Future Period Warning Flag `forecast=false` tagging & handling).
  - **Milestone 2 (M2)**: R2 Implementation (Comprehensive Readiness Health Checks probing DB, Redis, BullMQ, MinIO with 200 vs 503 status code logic).
  - **Milestone 3 (M3 - Final)**: Pass 100% E2E test suite + Adversarial Coverage Hardening (Tier 5).

### Phase 2: Implementation & Verification Loop (per Milestone)
For each milestone:
1. Explorer analyzes milestone scope and proposes fix/implementation strategy.
2. Worker implements changes and executes unit/integration tests.
3. Reviewer 1 & 2 independently review code, design compliance, and test verification.
4. Challenger 1 & 2 stress test and verify edge cases/correctness.
5. Forensic Auditor (`teamwork_preview_auditor`) performs integrity check (BINARY VETO).
6. Gate evaluation: Pass if build/tests pass, all Reviewers APPROVE, Challengers confirm, Auditor CLEAN.

### Phase 3: Final Verification & Victory Audit
- Run full unit, integration, and E2E test suites.
- Perform final Victory Audit.
- Deliver `handoff.md` and notify parent/Sentinel.
