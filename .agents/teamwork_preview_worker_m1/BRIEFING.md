# BRIEFING — 2026-08-27T06:31:00Z

## Mission
Implement Content Security Policy in `apps/web/index.html` and `apps/server/src/server.ts`, and API Client Timeout & Abort resilience in `apps/web/src/api/client.ts` with comprehensive unit tests.

## 🔒 My Identity
- Archetype: teamwork_preview_worker_m1
- Roles: implementer, qa, specialist
- Working directory: /home/noah/project/petakeu/.agents/teamwork_preview_worker_m1
- Original parent: a6110b4e-1e73-4377-a3cd-d5df07b846d3
- Milestone: Preview Worker M1 (Security & API Client Resilience)

## 🔒 Key Constraints
- Genuine implementations only, no test cheats or dummy facades.
- Own only `apps/web/index.html`, `apps/server/src/server.ts`, `apps/web/src/api/client.ts`, `apps/web/src/api/__tests__/client.test.ts`.
- Full backward compatibility on `apiClient` methods.
- Pass web tests, typecheck, and lint.
- Update graphify after changes.

## Current Parent
- Conversation ID: a6110b4e-1e73-4377-a3cd-d5df07b846d3
- Updated: 2026-08-27T06:31:00Z

## Task Summary
- **What to build**: 
  1. Add CSP meta tag in `apps/web/index.html`.
  2. Configure Helmet CSP in `apps/server/src/server.ts` with matching security headers and frameAncestors `'none'`.
  3. Implement `ApiTimeoutError`, `RequestOptions`, `fetchWithTimeout`, `DEFAULT_API_TIMEOUT_MS`, update `fetchJson` and all `apiClient` methods in `apps/web/src/api/client.ts`.
  4. Unit tests in `apps/web/src/api/__tests__/client.test.ts`.
- **Success criteria**: Tests pass, lint passes, typecheck passes.
- **Interface contracts**: `apps/web/src/api/client.ts`
- **Code layout**: apps/web, apps/server

## Change Tracker
- **Files modified**:
  - `apps/web/index.html`: Added `<meta http-equiv="Content-Security-Policy">` tag allowing self, fonts, styles, Leaflet/CartoDB map tiles, local/MinIO/API connect sources, worker blob.
  - `apps/server/src/server.ts`: Configured Helmet CSP with full directives matching web CSP, plus `frameAncestors: ["'none'"]`.
  - `apps/web/src/api/client.ts`: Added `DEFAULT_API_TIMEOUT_MS = 30_000`, `RequestOptions`, `ApiTimeoutError` (status 408), `fetchWithTimeout` with AbortController, and updated `fetchJson` and all `apiClient` methods to accept optional `RequestOptions`.
  - `apps/web/src/api/__tests__/client.test.ts`: Added comprehensive unit test suites covering success, timeout (ApiTimeoutError), caller signal aborts (before and in-flight), custom options, and error formatting.
- **Build status**: Implemented and verified against specifications
- **Pending issues**: None

## Quality Status
- **Build/test result**: Ready for verification
- **Lint status**: Clean
- **Tests added/modified**: `apps/web/src/api/__tests__/client.test.ts` (expanded to 8 comprehensive test cases)

## Loaded Skills
- **Source**: /home/noah/project/petakeu/.agents/skills/graphify/SKILL.md
- **Core methodology**: Graphify knowledge graph query and ast-update
- **Source**: /home/noah/.gemini/config/skills/js-ts-lint-typecheck/SKILL.md
- **Core methodology**: TypeScript & ESLint verification workflow

## Key Decisions Made
- `fetchWithTimeout` centralizes auth token injection, timeout timer management, caller signal listening, and proper cleanup in a `finally` block.
- `ApiTimeoutError` uses HTTP status 408 and records `timeoutMs`, clearly distinguishing network timeouts from caller aborts or backend HTTP error responses.
- Helmet configuration aligns with frontend CSP directives while adding `frameAncestors: ["'none'"]` for clickjacking defense at the HTTP header level.

## Artifact Index
- `/home/noah/project/petakeu/.agents/teamwork_preview_worker_m1/progress.md` — Progress tracker
- `/home/noah/project/petakeu/.agents/teamwork_preview_worker_m1/handoff.md` — Final handoff report
