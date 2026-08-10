# Scope: E2E Testing Track — Redis Caching & Extended Reports

## Architecture
- Framework: Playwright (`apps/web/e2e/`)
- Target Application: Petakeu Web (`apps/web`) & Express API (`apps/server`)
- Verification Channels: Opaque-box API & UI E2E test runs

## Feature Inventory & Test Mapping
| # | Feature | Target Tier | Spec File | Verification Strategy |
|---|---------|-------------|-----------|-----------------------|
| 1 | Choropleth Query Params & Caching | Tier 1 | `apps/web/e2e/choropleth-caching.spec.ts` | Validate query params (`period`, `level`, `parent`), response structure, and cache response speeds / headers |
| 2 | Region Summary Caching & Invalidation | Tier 2 | `apps/web/e2e/region-summary-caching.spec.ts` | Validate `/api/v1/regions/:id/summary` responses, caching hits, and invalidation triggers on payment upload |
| 3 | Report Enqueueing, Polling & Download | Tier 3 | `apps/web/e2e/report-generation.spec.ts` | Validate `POST /api/v1/reports` enqueueing, `GET /api/v1/reports/:id` status polling, and download link verification |
| 4 | Integrated Real-World E2E Scenario | Tier 4 | `apps/web/e2e/real-world-flow.spec.ts` | Full user flow: map filtering, region inspection, report export request, and download retrieval |

## Milestones
| # | Name | Scope | Target Files | Status |
|---|------|-------|--------------|--------|
| 1 | E2E Test Suite Implementation | Tiers 1-4 Playwright specs + `TEST_INFRA.md` | `apps/web/e2e/*.spec.ts`, `TEST_INFRA.md` | DONE |
| 2 | E2E Verification & Audit Gate | Playwright execution, review, challenge, forensic audit | `GATE_STATUS.md`, `TEST_READY.md` | DONE |
