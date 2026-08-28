## 2026-08-27T13:17:18+07:00
You are teamwork_preview_orchestrator_5.
Your working directory is `/home/noah/project/petakeu/.agents/teamwork_preview_orchestrator_5`.
The project workspace root is `/home/noah/project/petakeu`.
The original request is recorded at `/home/noah/project/petakeu/.agents/ORIGINAL_REQUEST.md`.

## Mission
Execute end-to-end release hardening for Petakeu:
1. Live Service Integration Tests: Ensure required backend backing services (PostgreSQL with PostGIS, Redis, MinIO) are running via Docker Compose (`docker-compose.yml` or relevant compose files). Run and pass the integration test suite in `@petakeu/server` with `PETAKEU_INTEGRATION=1`. Verify report generation and upload worker integration pipelines succeed with zero skipped tests and clean connection teardowns.
2. End-to-End (E2E) Browser Verification: Execute and pass all Playwright E2E test scenarios (`pnpm --filter @petakeu/web test:e2e` / `pnpm test:e2e`). Verify core user journeys: Map exploration, Data upload flow, and Reports generation.
3. Security & Resilience Hardening:
   - Implement a Content Security Policy (CSP) in `apps/web/index.html` (and/or server security headers via Helmet) that prevents XSS while maintaining full compatibility with map tile providers (Leaflet/OpenStreetMap), fonts, and API communication.
   - Implement configurable timeout and abort mechanisms (using `AbortController`) in `apps/web/src/api/client.ts` to prevent indefinite UI loading states on hanging network requests.
4. Ensure `pnpm lint`, `pnpm typecheck`, and `pnpm build` pass across all packages in the monorepo.
