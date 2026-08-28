## 2026-08-27T06:27:52Z

You are teamwork_preview_worker_m1.
Your working directory is `/home/noah/project/petakeu/.agents/teamwork_preview_worker_m1`.
Create your working directory if needed.
The project workspace root is `/home/noah/project/petakeu`.
Read `/home/noah/project/petakeu/.agents/ORIGINAL_REQUEST.md` and the detailed blueprint in `/home/noah/project/petakeu/.agents/teamwork_preview_explorer_survey_2/handoff.md`.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Scope & Write Ownership:
You own:
- `apps/web/index.html`
- `apps/server/src/server.ts`
- `apps/web/src/api/client.ts`
- `apps/web/src/api/__tests__/client.test.ts` (or relevant test files)

Tasks:
1. Content Security Policy (CSP):
   - Add the Content Security Policy meta tag in `apps/web/index.html` within `<head>`:
     - `default-src 'self'`
     - `script-src 'self' 'unsafe-inline'`
     - `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://unpkg.com`
     - `font-src 'self' data: https://fonts.gstatic.com`
     - `img-src 'self' data: blob: https://*.tile.openstreetmap.org https://*.basemaps.cartocdn.com https://unpkg.com https://*.openstreetmap.org http://localhost:9000 https://storage.petakeu.local`
     - `connect-src 'self' http://localhost:* ws://localhost:* http://127.0.0.1:* ws://127.0.0.1:* https://api.petakeu.go.id https://*.petakeu.go.id http://localhost:9000 https://storage.petakeu.local https://*.tile.openstreetmap.org https://*.basemaps.cartocdn.com`
     - `worker-src 'self' blob:`
     - `object-src 'none'`
     - `base-uri 'self'`
   - Update Helmet configuration in `apps/server/src/server.ts` with matching security headers and frameAncestors `'none'`.
2. API Client Timeout & Abort Resilience:
   - In `apps/web/src/api/client.ts`:
     - Define `DEFAULT_API_TIMEOUT_MS = 30_000` (or 15_000-30_000ms).
     - Define and export `RequestOptions` extending `Omit<RequestInit, "signal">` with `timeout?: number` and `signal?: AbortSignal | null`.
     - Define and export `ApiTimeoutError` (status: 408, timeoutMs: number, custom error name and prototype).
     - Implement `fetchWithTimeout(input, init?: RequestOptions): Promise<Response>` with `AbortController`, timer-based abort, cleanup in `finally`, caller `signal` forwarding, and `isTimedOut` check throwing `ApiTimeoutError`.
     - Update `fetchJson<T>` to use `fetchWithTimeout` and accept `RequestOptions`.
     - Add `options?: RequestOptions` optional parameter to all `apiClient` methods (`listUploads`, `getUpload`, `uploadFile`, `createReport`, `getChoropleth`, `getRegionSummary`, etc.) preserving full backward compatibility.
3. Unit Testing:
   - Add/update unit tests in `apps/web/src/api/__tests__/client.test.ts` verifying:
     - Normal successful requests work.
     - Timeout triggers `ApiTimeoutError`.
     - Caller `signal` abort triggers `AbortError` cleanly.
     - Custom timeout values are respected.
4. Verify:
   - Run `pnpm --filter @petakeu/web test`
   - Run `pnpm typecheck`
   - Run `pnpm lint`

Write your handoff report to `/home/noah/project/petakeu/.agents/teamwork_preview_worker_m1/handoff.md`.
Send a completion message back to the orchestrator when finished.
