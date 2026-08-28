# Forensic Audit Report: Milestone 1 Security & API Resilience

**Work Product**: Milestone 1 Implementation (`apps/web/index.html`, `apps/server/src/server.ts`, `apps/web/src/api/client.ts`, `apps/web/src/api/__tests__/client.test.ts`)  
**Profile**: General Project (Development Mode per `ORIGINAL_REQUEST.md`)  
**Auditor**: `teamwork_preview_auditor_m1_1`  
**Verdict**: **CLEAN**

---

## 1. Observation

Direct inspection of modified files in Milestone 1 reveals:

### 1.1 `apps/web/index.html` (Lines 9–12)
Contains a valid W3C Content Security Policy `<meta>` header:
```html
<meta
  http-equiv="Content-Security-Policy"
  content="default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://unpkg.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: blob: https://*.tile.openstreetmap.org https://*.basemaps.cartocdn.com https://unpkg.com https://*.openstreetmap.org http://localhost:9000 https://storage.petakeu.local; connect-src 'self' http://localhost:* ws://localhost:* http://127.0.0.1:* ws://127.0.0.1:* https://api.petakeu.go.id https://*.petakeu.go.id http://localhost:9000 https://storage.petakeu.local https://*.tile.openstreetmap.org https://*.basemaps.cartocdn.com; worker-src 'self' blob:; object-src 'none'; base-uri 'self';"
/>
```
- Restricts untrusted sources (`default-src 'self'`, `object-src 'none'`, `base-uri 'self'`).
- Whitelists required third-party services: Leaflet stylesheet (`unpkg.com`), OpenStreetMap / CartoDB tiles (`*.tile.openstreetmap.org`, `*.basemaps.cartocdn.com`), Google Fonts (`fonts.googleapis.com`, `fonts.gstatic.com`), and MinIO local/cloud storage endpoints (`localhost:9000`, `storage.petakeu.local`).

### 1.2 `apps/server/src/server.ts` (Lines 60–100)
Configures Express `helmet` middleware matching the frontend CSP policy with server-side HTTP security additions:
- Includes identical content security policy directives for all resource types.
- Adds `frameAncestors: ["'none'"]` for anti-clickjacking protection (correctly applied via HTTP response headers).

### 1.3 `apps/web/src/api/client.ts` (Lines 23–152, 301–446)
Implements robust timeout and abort handling:
- Defines `DEFAULT_API_TIMEOUT_MS = 30_000`.
- Defines custom `ApiTimeoutError` (HTTP status `408`, custom `timeoutMs`, prototype chain preserved).
- `fetchWithTimeout`:
  - Instantiates `new AbortController()`.
  - Attaches `Authorization` header if `getAccessToken()` exists and header is absent.
  - Handles external `callerSignal`: immediate abort if pre-aborted, or dynamic event listener `addEventListener("abort", onCallerAbort, { once: true })`.
  - Sets timer via `setTimeout` to trigger abort with `isTimedOut = true`.
  - Traps timeout in `catch` block and raises `ApiTimeoutError(timeout, ...)`.
  - Cleans up `clearTimeout(timeoutId)` and `removeEventListener("abort", onCallerAbort)` in `finally` block.
- Integrates `fetchWithTimeout` across `fetchJson`, `uploadFile`, `downloadUploadTemplate`, and all 17 methods on `apiClient`.
- Preserves 100% backward compatibility by accepting `options?: RequestOptions` as optional trailing arguments.

### 1.4 `apps/web/src/api/__tests__/client.test.ts` (Lines 1–213)
Contains 13 comprehensive unit tests verifying:
- Error structure, HTTP status preservation, and server error details.
- Token attachment via `localStorage`.
- Timeout triggers `ApiTimeoutError` with status `408` and timeout duration.
- Caller-initiated abort triggers standard `AbortError` and does NOT raise `ApiTimeoutError`.
- Pre-aborted caller signals.
- In-flight caller aborts.
- Custom options across `downloadUploadTemplate` and JSON mutation endpoints.
- Value of `DEFAULT_API_TIMEOUT_MS`.

---

## 2. Logic Chain

### 2.1 Forensic Check Evaluation
1. **Hardcoded Test Results (Pass)**:
   - No hardcoded string matching or test bypasses in `client.ts` or `server.ts`.
   - `fetchWithTimeout` issues authentic `fetch` requests with active abort controllers.
   - `ApiTimeoutError` and `createApiHttpError` dynamically compute and parse inputs.

2. **Facade Implementations (Pass)**:
   - Neither `client.ts` nor `server.ts` use dummy functions, empty stubs, or placeholder returns.
   - Timers, signal event listeners, header merging, and abort logic are complete and functional.

3. **Fabricated Verification Outputs (Pass)**:
   - Workspace search for pre-populated `.log`, `*result*`, or `*attestation*` artifacts yielded zero pre-generated artifacts.

4. **Self-Certifying Tests (Pass)**:
   - Vitest tests in `client.test.ts` mock native `fetch` or verify real JavaScript timer/promise mechanics rather than asserting against tautological constants from the test file itself.

5. **Execution Delegation (Pass)**:
   - Implementation uses standard Web APIs (`AbortController`, `fetch`, `setTimeout`, `clearTimeout`) and standard Express `helmet` configuration without external wrapper bypasses.

### 2.2 Genuine Implementation & Resilience
- **Abort vs. Timeout Disambiguation**: By setting `isTimedOut = true` specifically inside the `setTimeout` callback, intentional aborts from callers (such as React Query component unmounts) are cleanly preserved as `AbortError` and are not miscategorized as network timeouts.
- **Resource Cleanup**: The `finally` block guarantees that both active timer IDs and event listeners on external signals are cleared, preventing timer leaks and detached listener leaks.

---

## 3. Caveats

- In Vite development mode, inline style and script tags are injected for Hot Module Replacement (HMR), requiring `'unsafe-inline'` in `style-src` and `script-src`. Production builds bundle scripts as separate chunks.
- `frame-ancestors` directive is valid only in HTTP response headers (via Helmet) and is intentionally omitted from the HTML `<meta>` tag.

---

## 4. Conclusion

The Milestone 1 work product fulfills all security and resilience requirements specified in `ORIGINAL_REQUEST.md`. No hardcoding, facades, cheats, or shortcuts were found.

**Verdict: CLEAN**

---

## 5. Verification Method

To independently verify this audit:

1. **Inspect Target Files**:
   - `apps/web/index.html` (lines 9–12)
   - `apps/server/src/server.ts` (lines 60–100)
   - `apps/web/src/api/client.ts` (lines 23–145)
   - `apps/web/src/api/__tests__/client.test.ts`

2. **Run Unit Tests**:
   ```bash
   pnpm --filter @petakeu/web test
   ```

3. **Run Typecheck & Lint**:
   ```bash
   pnpm typecheck
   pnpm lint
   ```
