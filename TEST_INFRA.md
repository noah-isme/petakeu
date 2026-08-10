# E2E Test Infra: Petakeu Redis Caching & Extended Reports

## Test Philosophy
- Opaque-box, requirement-driven. No dependency on implementation design.
- Methodology: Category-Partition + BVA + Pairwise + Workload Testing.

## Feature Inventory
| # | Feature | Source (requirement) | Tier 1 | Tier 2 | Tier 3 | Tier 4 |
|---|---------|---------------------|:------:|:------:|:------:|:------:|
| 1 | Choropleth Query Parameters & Caching | ORIGINAL_REQUEST R1 | 5 | 5 | ✓ | ✓ |
| 2 | Region Summary Caching & Invalidation | ORIGINAL_REQUEST R1 | 5 | 5 | ✓ | ✓ |
| 3 | Report Enqueueing, Polling & Download | ORIGINAL_REQUEST R2 | 5 | 5 | ✓ | ✓ |
| 4 | Integrated Real-World Flow | ORIGINAL_REQUEST R1 & R2 | — | — | — | 5 |

## Test Architecture
- Test runner: Playwright (`pnpm --filter @petakeu/web test:e2e` or `npx playwright test`)
- Test directory: `apps/web/e2e/`
- Spec Files:
  - `apps/web/e2e/choropleth-caching.spec.ts` (Tier 1)
  - `apps/web/e2e/region-summary-caching.spec.ts` (Tier 2)
  - `apps/web/e2e/report-generation.spec.ts` (Tier 3)
  - `apps/web/e2e/real-world-flow.spec.ts` (Tier 4)

## Real-World Application Scenarios (Tier 4)
| # | Scenario | Features Exercised | Complexity |
|---|----------|--------------------|------------|
| 1 | Map Interaction & Choropleth Cache Verification | Choropleth query params, period selection, cache hit performance | Medium |
| 2 | Region Breakdown Summary & Cache Invalidation | Region summary API, payment upload trigger, cache invalidation | High |
| 3 | End-to-End Report Generation & Download | Report POST enqueue, status polling, MinIO storage download link | High |
| 4 | Integrated Regional Analytics & Export Workflow | Choropleth inspection -> Region summary lookup -> Export PDF/Excel report | High |
| 5 | Concurrent Report Requests & Invalidation Flow | Concurrent report enqueueing and summary cache invalidation | High |

## Coverage Thresholds
- Tier 1: ≥5 test cases for Choropleth GeoJSON caching & query params (`/api/v1/geo/choropleth`)
- Tier 2: ≥5 test cases for Region summary caching & invalidation (`/api/v1/regions/:id/summary`)
- Tier 3: ≥5 test cases for Report job enqueueing (`POST /api/v1/reports`), polling (`GET /api/v1/reports/:id`), and download links
- Tier 4: ≥5 realistic application scenarios combining UI map interaction and report export workflows
