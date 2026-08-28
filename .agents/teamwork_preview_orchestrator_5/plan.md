# Execution Plan: Petakeu Release Hardening

## Overview
Execute end-to-end release hardening for Petakeu encompassing live service integration testing, Playwright E2E browser verification, security (CSP) & resilience (API client timeout/abort) hardening, and monorepo quality gates.

## Phase 0: Survey & Reconnaissance
- Spawn 3 parallel Explorers:
  - **Explorer 1 (Backend & Integration Tests)**: Investigate Docker compose configuration, backend backing services (PostGIS, Redis, MinIO), test setup for `PETAKEU_INTEGRATION=1`, report/upload worker integration pipelines, and connection teardowns.
  - **Explorer 2 (Frontend Security & Resilience)**: Investigate `apps/web/index.html` (CSP policy requirements, Leaflet tiles, fonts, APIs), server Helmet config, and `apps/web/src/api/client.ts` (fetch implementation, timeout, AbortController, error handling).
  - **Explorer 3 (E2E Test Suite & Monorepo Build)**: Investigate Playwright configuration and test specs (`apps/web/e2e`), core user journeys (Map, Upload, Reports), and monorepo build/lint/typecheck status.

## Phase 1: Security & Resilience Hardening
- Worker implements Content Security Policy in `apps/web/index.html` (and backend Helmet if needed) ensuring Leaflet tiles (`*.tile.openstreetmap.org`, etc.), fonts, APIs function without CSP violations.
- Worker implements configurable timeout & `AbortController` in `apps/web/src/api/client.ts` handling `AbortError` cleanly.
- Reviewer & Challenger verify security and resilience.

## Phase 2: Live Service Integration Testing
- Worker ensures Docker compose services are running, executes `PETAKEU_INTEGRATION=1` test suite for `@petakeu/server`, and verifies 0 skipped tests and clean teardown.
- Reviewer & Challenger verify integration test results.

## Phase 3: E2E Browser Verification
- Worker runs and verifies all Playwright E2E tests (`pnpm --filter @petakeu/web test:e2e` / `pnpm test:e2e`) across Map, Upload, Report journeys.
- Reviewer & Challenger verify E2E test passes and coverage.

## Phase 4: Full Monorepo Quality Gates & Forensic Audit
- Worker runs `pnpm lint`, `pnpm typecheck`, `pnpm build` across all packages.
- Forensic Auditor validates integrity (zero cheats/stubs/dummy implementations).
- Final review and victory reporting.
