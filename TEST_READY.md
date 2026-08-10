# E2E Test Suite Ready

## Test Runner
- Command: `pnpm --filter @petakeu/web test:e2e` or `npx playwright test`
- Expected: all tests pass with exit code 0

## Coverage Summary
| Tier | Count | Description |
|------|------:|-------------|
| 1. Feature Coverage | 6 | GeoJSON choropleth query params & Redis caching (`/api/v1/geo/choropleth`) |
| 2. Boundary & Corner | 6 | Region summary caching (`/api/v1/regions/:id/summary`) & upload invalidation |
| 3. Cross-Feature | 6 | PDF & Excel report job enqueueing (`POST /api/v1/reports`), polling & downloads |
| 4. Real-World Application | 5 | Integrated map UI interactions, regional analytics, export & invalidation flows |
| **Total** | **23** | **Production-grade E2E test cases across 4 spec files** |

## Feature Checklist
| Feature | Tier 1 | Tier 2 | Tier 3 | Tier 4 |
|---------|:------:|:------:|:------:|:------:|
| Choropleth Caching & Query Params (`/api/v1/geo/choropleth`) | 6 | — | — | ✓ |
| Region Summary Caching & Invalidation (`/api/v1/regions/:id/summary`) | — | 6 | — | ✓ |
| PDF & Excel Report Enqueueing, Polling & Download | — | — | 6 | ✓ |
| Integrated Map & Export Workflows | — | — | — | 5 |
