# Project: Petakeu Release Hardening

## Architecture
- GovTech Monorepo (Turborepo + pnpm)
- `apps/web`: React 18 + Vite, Leaflet, Recharts, React Query, Tailwind CSS v4, Playwright E2E
- `apps/server`: Express 4 + TypeScript, PostgreSQL 16 + PostGIS 3.4, Redis, BullMQ workers, MinIO S3 storage, Vitest integration tests

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Docker Backing Services | PostgreSQL/PostGIS, Redis, MinIO via docker-compose | M2 | User Request |
| 2 | Live Server Integration Tests | `PETAKEU_INTEGRATION=1` test suite, upload & report worker pipelines, clean connection teardown | M2 | User Request |
| 3 | E2E Browser Verification | Playwright tests for Map, Upload, Report journeys | M3 | User Request |
| 4 | CSP Security Hardening | CSP `<meta>` or Helmet preventing XSS, compatible with Leaflet tiles, fonts, APIs | M1 | User Request |
| 5 | API Client Resilience | Configurable timeout & `AbortController` in `apps/web/src/api/client.ts` | M1 | User Request |
| 6 | Monorepo Quality Gates | `pnpm lint`, `pnpm typecheck`, `pnpm build` across all packages | M4 | User Request |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 0 | Survey & Reconnaissance | Investigate Docker, server tests, client.ts, CSP, E2E specs | none | DONE |
| 1 | Security & Resilience Hardening | CSP in index.html/server + timeout/abort in client.ts | M0 | DONE |
| 2 | Live Service Integration Tests | Docker compose up + PETAKEU_INTEGRATION=1 tests passing | M0, M1 | DONE |
| 3 | E2E Browser Verification | Playwright tests passing for all journeys | M1, M2 | IN_PROGRESS |
| 4 | Monorepo Quality & Audit | Lint, typecheck, build, Forensic Audit CLEAN | M1, M2, M3 | PLANNED |

## Code Layout
- `apps/web/index.html` — HTML entry point & CSP meta tag
- `apps/web/src/api/client.ts` — Frontend API client with fetch/timeout/abort logic
- `apps/server/src/index.ts` / `apps/server/src/app.ts` — Server entry point & Helmet security headers
- `apps/server/tests/` or `apps/server/src/**/__tests__/` — Server unit & integration tests
- `apps/web/e2e/` — Playwright test specs
- `docker-compose.yml` — Backing services definition
