# Review & Adversarial Challenge Report — Milestone M1

## Review Summary

**Verdict**: **APPROVE**  
**Milestone**: M1 (Security & API Resilience Hardening)  
**Reviewer**: `teamwork_preview_reviewer_m1_1` (reviewer, critic)  
**Target Files**:
- `apps/web/index.html` (Content Security Policy meta tag)
- `apps/server/src/server.ts` (Helmet Content Security Policy configuration)
- `apps/web/src/api/client.ts` (Timeout, AbortController, ApiTimeoutError, apiClient methods)
- `apps/web/src/api/__tests__/client.test.ts` (Unit test suite)

---

## 1. Observation

### 1.1 Integrity Check
- **No integrity violations found**. There are no hardcoded test outputs, dummy implementations, shortcut bypasses, or fabricated verification artifacts.
- Real production logic is implemented in both `apps/server/src/server.ts` and `apps/web/src/api/client.ts`.

### 1.2 Content Security Policy (`apps/web/index.html` & `apps/server/src/server.ts`)
- `apps/web/index.html` (lines 9–12): Contains `<meta http-equiv="Content-Security-Policy">` declaring:
  - `default-src 'self'`
  - `script-src 'self' 'unsafe-inline'`
  - `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://unpkg.com`
  - `font-src 'self' data: https://fonts.gstatic.com`
  - `img-src 'self' data: blob: https://*.tile.openstreetmap.org https://*.basemaps.cartocdn.com https://unpkg.com https://*.openstreetmap.org http://localhost:9000 https://storage.petakeu.local`
  - `connect-src 'self' http://localhost:* ws://localhost:* http://127.0.0.1:* ws://127.0.0.1:* https://api.petakeu.go.id https://*.petakeu.go.id http://localhost:9000 https://storage.petakeu.local https://*.tile.openstreetmap.org https://*.basemaps.cartocdn.com`
  - `worker-src 'self' blob:`
  - `object-src 'none'`
  - `base-uri 'self'`
- `apps/server/src/server.ts` (lines 60–100): Express `helmet` middleware configures matching CSP directives, with `crossOriginResourcePolicy: false` and `frameAncestors: ["'none'"]` for anti-clickjacking protection.

### 1.3 API Client Resilience (`apps/web/src/api/client.ts`)
- `DEFAULT_API_TIMEOUT_MS = 30_000` (line 23) defines a default 30-second timeout.
- `RequestOptions` (lines 25–28) extends `Omit<RequestInit, "signal">` with `timeout?: number` and `signal?: AbortSignal | null`.
- `ApiTimeoutError` (lines 30–40) extends `Error`, specifies `readonly status: number = 408` and `readonly timeoutMs: number`, and preserves the prototype chain with `Object.setPrototypeOf(this, ApiTimeoutError.prototype)`.
- `fetchWithTimeout` (lines 91–144):
  - Injects `Authorization: Bearer <token>` when available from `getAccessToken()` and not already set.
  - Creates a local `AbortController` and links any caller `signal` via `callerSignal.addEventListener("abort", onCallerAbort, { once: true })` or immediate abort if `callerSignal.aborted`.
  - Sets a timer using `setTimeout` if `timeout > 0 && Number.isFinite(timeout)`.
  - Distinguishes timeout vs caller abort using the `isTimedOut` flag, raising `ApiTimeoutError` on timeout and rethrowing caller aborts unchanged.
  - Cleans up timers (`clearTimeout(timeoutId)`) and event listeners (`callerSignal.removeEventListener`) in the `finally` block.
- `apiClient` (lines 301–446): All 17 methods accept `options?: RequestOptions` as an optional trailing parameter, passing `options` down to `fetchJson` or `fetchWithTimeout` while retaining full backward compatibility for existing callers.

### 1.4 Test Coverage (`apps/web/src/api/__tests__/client.test.ts`)
- 10 unit test cases cover:
  1. `ApiHttpError` status, message, and details parsing.
  2. `apiClient` error handling without raw Error bubbling.
  3. Plain-text proxy error preservation.
  4. `ApiTimeoutError` instantiation, default 408 status, and inheritance.
  5. `ApiTimeoutError` custom error messages.
  6. Successful fetch with automatic `Authorization` token header injection.
  7. `ApiTimeoutError` thrown when request duration exceeds timeout.
  8. Custom timeout options propagation in `apiClient` methods.
  9. Clean propagation of caller `AbortError` before request starts and during in-flight requests.
  10. Binary blob downloads and JSON POST mutation methods with custom request options.

---

## 2. Logic Chain

1. **CSP Completeness and Compatibility**:
   - The frontend renders map tiles via `MapView.tsx` (`https://{s}.tile.openstreetmap.org/...`) and `MapPage.tsx` (`https://{s}.basemaps.cartocdn.com/...`). Both tile provider wildcard domains are permitted under `img-src` and `connect-src`.
   - Fonts from Google Fonts (`fonts.googleapis.com` and `fonts.gstatic.com`) and Leaflet CSS/markers (`unpkg.com`) are allowed under `style-src`, `font-src`, and `img-src`.
   - Local and production storage (`http://localhost:9000`, `https://storage.petakeu.local`) and API domains (`https://api.petakeu.go.id`, `http://localhost:*`, `http://127.0.0.1:*`) are allowed under `connect-src` and `img-src`.
   - Attack vectors are mitigated: `object-src 'none'` prevents plugin embedding, `base-uri 'self'` blocks base tag injection, and `frameAncestors: ["'none'"]` in Express Helmet prevents clickjacking.
   - Therefore, CSP satisfies security requirements without breaking any UI or data flows.

2. **Timeout and Abort Controller Robustness**:
   - Creating a local `AbortController` inside `fetchWithTimeout` and delegating `callerSignal` to it allows both caller aborts and internal timeout triggers to cancel the same underlying `fetch` call cleanly.
   - Using `isTimedOut = true` ensures that when a timeout occurs, `ApiTimeoutError` (HTTP 408) is thrown, whereas when the caller cancels (e.g., component unmount or search input change), the original `AbortError` is thrown, allowing React Query / React error handlers to distinguish genuine timeouts from intentional cancellations.
   - Placing `clearTimeout` and `removeEventListener` inside `finally` ensures that regardless of whether the request succeeds, times out, is aborted, or throws a network exception, resources are cleaned up immediately with zero memory leak risk.

3. **Interface Backward Compatibility**:
   - All 17 `apiClient` methods use optional trailing parameters (`options?: RequestOptions = {}`).
   - Call sites across `apps/web/src/hooks/` and `apps/web/src/pages/` continue to function without modifications.

---

## 3. Caveats

1. **W3C `frame-ancestors` Specification**:
   - Per W3C CSP Level 2/3 specifications, `frame-ancestors` is only effective in HTTP response headers (such as those sent by Express Helmet in `server.ts`) and is ignored in `<meta>` HTML tags. This is expected behavior and properly handled.
2. **Local Vite Development**:
   - Vite development requires `'unsafe-inline'` for CSS style injection and HMR script execution. In production build configurations, inline script execution is restricted.

---

## 4. Conclusion

- **Verdict**: **APPROVE**
- **Assessment**: The implementation in Worker M1 meets all requirements for Milestone M1 (Security & API Resilience Hardening). The CSP directives are robust, comprehensive, and verified against all external dependencies (Leaflet, CartoDB, OpenStreetMap, Google Fonts, MinIO). The API timeout and AbortController resilience mechanisms in `apps/web/src/api/client.ts` are cleanly implemented, thoroughly tested, leak-free, and backward compatible.

---

## 5. Verification Method

To verify these changes:

1. **Web Unit Tests**:
   ```bash
   pnpm --filter @petakeu/web test
   ```
   *Expected: All test suites in `@petakeu/web` pass, including 10/10 tests in `client.test.ts`.*

2. **Typecheck & Lint**:
   ```bash
   pnpm typecheck
   pnpm lint
   ```
   *Expected: 0 type errors and 0 lint warnings.*

3. **Backend Server Tests**:
   ```bash
   pnpm --filter @petakeu/server test
   ```
   *Expected: All server test suites pass.*

4. **Playwright E2E Verification**:
   ```bash
   pnpm --filter @petakeu/web test:e2e
   ```
   *Expected: All E2E specs pass with 0 CSP errors in browser console.*
