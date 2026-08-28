## 2026-08-27T06:17:59Z
You are teamwork_preview_explorer_survey_2.
Your working directory is `/home/noah/project/petakeu/.agents/teamwork_preview_explorer_survey_2`.
Create your working directory if needed.
The project workspace root is `/home/noah/project/petakeu`.
Read `/home/noah/project/petakeu/.agents/ORIGINAL_REQUEST.md` and `/home/noah/project/petakeu/.agents/teamwork_preview_orchestrator_5/PROJECT.md`.

Focus: Frontend Security (CSP) & Resilience (API Client Timeout/Abort)
Investigate:
1. `apps/web/index.html` and backend Helmet security headers (`apps/server/src/index.ts` / `app.ts`).
2. Identify all external assets, tile providers (Leaflet OpenStreetMap `*.tile.openstreetmap.org`, CartoDB, etc.), fonts (Google Fonts, etc.), and API communication endpoints (`/api/*`, MinIO presigned URLs) to formulate an airtight Content Security Policy (CSP) that prevents XSS without breaking maps, fonts, or APIs.
3. `apps/web/src/api/client.ts`: Examine how fetch requests are handled. Plan the implementation of configurable timeouts (e.g. default 15-30s) using `AbortController`, handling `AbortError` / timeout errors cleanly, and allowing per-request custom timeouts/signals.
4. Check any components or hooks calling `client.ts` to ensure compatibility.

Write your findings and concrete implementation recommendations to `/home/noah/project/petakeu/.agents/teamwork_preview_explorer_survey_2/handoff.md`.
Send a completion message back to the orchestrator when finished.
