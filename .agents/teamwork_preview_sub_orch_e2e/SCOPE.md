# Scope: E2E Testing Track

## Architecture
- Framework: Playwright (`apps/web/playwright.config.ts`, test dir: `apps/web/e2e/`).
- Design: Requirement-driven, opaque-box testing for Requirement R1 (Future Period Warning Flag) and Requirement R2 (Comprehensive Readiness Health Checks).
- Deliverables: `TEST_INFRA.md` and `TEST_READY.md` at project root (`/home/noah/project/petakeu/`).

## Feature Inventory & Test Tiers

### Tier 1 - Feature Coverage (>=5 test cases per feature area)
- **R1 Coverage**: Verify upload handling with valid historic dates vs future period dates (`forecast=false` tag).
- **R2 Coverage**: Verify `GET /healthz` endpoint structure, status code 200 for healthy services, and individual component checks (`database`, `redis`, `storage`, `queue`).

### Tier 2 - Boundary & Corner Cases (>=5 test cases per feature area)
- **R1 Boundary**: Test period date edge cases (current month `2026-08`, future month `2026-09`, future year `2030-12`, invalid period format).
- **R2 Boundary**: Verify response status codes and body structure under simulated failure modes (503 Service Unavailable when DB or Redis is down, 200 OK when storage/queue degraded).

### Tier 3 - Cross-Feature Combinations
- Verify health check readiness during active background upload jobs.

### Tier 4 - Real-World Application Scenarios
- End-to-end flow: Upload data with historic + future periods, verify warning status metadata, verify system healthz status endpoint remains responsive.

## File Write Boundaries
- Exclusive ownership: `apps/web/e2e/health-readiness.spec.ts`, `apps/web/e2e/upload-warning.spec.ts`, `/home/noah/project/petakeu/TEST_INFRA.md`, `/home/noah/project/petakeu/TEST_READY.md`.
