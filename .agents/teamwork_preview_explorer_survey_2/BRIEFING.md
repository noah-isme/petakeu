# BRIEFING — 2026-08-27T06:22:00Z

## Mission
Investigate Frontend Security (CSP & Helmet headers) and Resilience (API Client Timeout/Abort) across apps/web and apps/server.

## 🔒 My Identity
- Archetype: explorer
- Roles: frontend security, api resilience investigation
- Working directory: /home/noah/project/petakeu/.agents/teamwork_preview_explorer_survey_2
- Original parent: a6110b4e-1e73-4377-a3cd-d5df07b846d3
- Milestone: Security & Resilience Survey

## 🔒 Key Constraints
- Read-only investigation — do NOT implement directly in source code
- Produce structured 5-component handoff report
- Check external assets, tile providers, fonts, API endpoints, MinIO presigned URLs
- Formulate CSP & API client timeout/abort design

## Current Parent
- Conversation ID: a6110b4e-1e73-4377-a3cd-d5df07b846d3
- Updated: 2026-08-27T06:18:00Z

## Investigation State
- **Explored paths**:
  - `apps/web/index.html` (external fonts, leaflet css, inline script)
  - `apps/web/src/components/MapView.tsx` (OpenStreetMap tiles)
  - `apps/web/src/pages/MapPage.tsx` (CartoDB tiles)
  - `apps/server/src/server.ts` (Helmet middleware & CORS)
  - `apps/server/src/config/swagger.ts` (Swagger UI `/api-docs`)
  - `apps/server/src/services/storage-service.ts` & `apps/server/src/db/minio.ts` (MinIO presigned URLs)
  - `apps/web/src/api/client.ts` (Fetch handling, ApiHttpError, normalization helpers)
  - All callers of `apiClient` across `apps/web/src/hooks/` and `apps/web/src/pages/`
- **Key findings**:
  - `apps/web/index.html` lacks CSP `<meta>` tag.
  - Tile providers require `https://*.tile.openstreetmap.org` and `https://*.basemaps.cartocdn.com` in `img-src` / `connect-src`.
  - Google Fonts requires `https://fonts.googleapis.com` in `style-src` and `https://fonts.gstatic.com` in `font-src`.
  - Leaflet CSS in `index.html` requires `https://unpkg.com` in `style-src`.
  - `apps/web/src/api/client.ts` lacks fetch timeout and abort signal support; designed `fetchWithTimeout`, `ApiTimeoutError`, and `RequestOptions` with backward-compatible method signatures.
- **Unexplored areas**: None remaining for this survey scope.

## Key Decisions Made
- Formulated complete CSP policy for `apps/web/index.html` and Helmet in `apps/server/src/server.ts`.
- Formulated `ApiTimeoutError` and `fetchWithTimeout` AbortController implementation for `apps/web/src/api/client.ts`.
- Documented findings in `handoff.md`.

## Artifact Index
- DISPATCH.md — incoming dispatch instructions
- BRIEFING.md — working memory and identity
- progress.md — liveness and task heartbeat
- handoff.md — 5-component handoff report
