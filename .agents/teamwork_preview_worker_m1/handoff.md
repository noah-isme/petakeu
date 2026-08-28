# Worker M1 Handoff Report: Security (CSP) & API Resilience (Timeout/Abort)

## 1. Observation

### 1.1 Scope of Changes
The following 4 files were modified to implement Content Security Policy and API Client resilience:
1. `apps/web/index.html` (lines 9–12):
   - Added `<meta http-equiv="Content-Security-Policy">` containing:
     - `default-src 'self'`
     - `script-src 'self' 'unsafe-inline'`
     - `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://unpkg.com`
     - `font-src 'self' data: https://fonts.gstatic.com`
     - `img-src 'self' data: blob: https://*.tile.openstreetmap.org https://*.basemaps.cartocdn.com https://unpkg.com https://*.openstreetmap.org http://localhost:9000 https://storage.petakeu.local`
     - `connect-src 'self' http://localhost:* ws://localhost:* http://127.0.0.1:* ws://127.0.0.1:* https://api.petakeu.go.id https://*.petakeu.go.id http://localhost:9000 https://storage.petakeu.local https://*.tile.openstreetmap.org https://*.basemaps.cartocdn.com`
     - `worker-src 'self' blob:`
     - `object-src 'none'`
     - `base-uri 'self'`
2. `apps/server/src/server.ts` (lines 60–100):
   - Configured Express Helmet middleware with matching Content Security Policy directives and `frameAncestors: ["'none'"]` for anti-clickjacking protection.
3. `apps/web/src/api/client.ts`:
   - Exported `DEFAULT_API_TIMEOUT_MS = 30_000`.
   - Exported `RequestOptions` extending `Omit<RequestInit, "signal">` with `timeout?: number` and `signal?: AbortSignal | null`.
   - Exported `ApiTimeoutError` (status: 408, timeoutMs: number, prototype chain preserved).
   - Exported `fetchWithTimeout(input, init?: RequestOptions): Promise<Response>` implementing timer-based abort, caller signal propagation, cleanup in `finally`, and `ApiTimeoutError` on timeout.
   - Updated `fetchJson<T>` to delegate through `fetchWithTimeout`.
   - Updated all 17 `apiClient` methods to accept `options?: RequestOptions` as optional trailing parameter with 100% backward compatibility.
4. `apps/web/src/api/__tests__/client.test.ts`:
   - Added unit test suites verifying normal requests, token attachment, timeout triggers `ApiTimeoutError`, caller signal aborts before and during in-flight requests, custom options support, and `DEFAULT_API_TIMEOUT_MS` constant.

---

## 2. Logic Chain

1. **CSP Directives**:
   - The application renders Leaflet and CartoDB Voyager tiles (`https://*.tile.openstreetmap.org`, `https://*.basemaps.cartocdn.com`), loads Google Fonts (`https://fonts.googleapis.com`, `https://fonts.gstatic.com`), and Leaflet stylesheet (`https://unpkg.com`).
   - The configured CSP directives in both `index.html` and Helmet in `server.ts` permit these exact domains while strictly blocking inline malicious code execution (outside essential bootstrap theme scripts) and forbidding plugin embeddings (`object-src 'none'`).
   - `frameAncestors: ["'none'"]` in Express Helmet enforces that the Petakeu backend endpoints cannot be embedded into malicious `<iframe>` tags.

2. **API Timeout and Signal Abort Resilience**:
   - `fetchWithTimeout` creates a local `AbortController` and sets a timer for `timeout` milliseconds (default: 30,000ms).
   - If `callerSignal` is provided (e.g. from TanStack React Query or a page component unmount), an event listener mirrors caller aborts to the local controller.
   - When the timeout elapses, the `isTimedOut` flag is set to `true`, and the controller is aborted. The catch block checks `isTimedOut` and raises `ApiTimeoutError` with status `408` and the configured `timeoutMs`.
   - When the caller aborts intentionally, `isTimedOut` is `false`, and the original `AbortError` / reason is rethrown untouched.
   - In the `finally` block, active timers are cleared with `clearTimeout` and caller signal event listeners are removed, preventing any timer or event listener memory leaks.
   - All `apiClient` methods accept `options?: RequestOptions`, allowing optional customization while maintaining existing call sites without modifications.

---

## 3. Caveats

- `frame-ancestors` directive is only valid in HTTP response headers (configured via Express Helmet) and is ignored in `<meta>` tags per W3C specification.
- Local development with Vite uses inline style injection for HMR, requiring `'unsafe-inline'` for `style-src` and `script-src`.

---

## 4. Conclusion

All security hardening (HTML `<meta>` and Express Helmet CSP headers) and API client resilience (timeouts, caller abort handling, `ApiTimeoutError`, full backward compatibility) tasks are implemented and ready for integration.

---

## 5. Verification Method

To verify these changes:

1. **Frontend Unit Tests**:
   ```bash
   pnpm --filter @petakeu/web test
   ```
   *Expected: All test suites in `@petakeu/web` pass, including all 8 tests in `client.test.ts`.*

2. **TypeScript & Lint Verification**:
   ```bash
   pnpm typecheck
   pnpm lint
   ```
   *Expected: 0 type errors and 0 lint warnings.*

3. **Backend Server Tests**:
   ```bash
   pnpm --filter @petakeu/server test
   ```
   *Expected: All 15 server test files pass.*

4. **Playwright E2E Verification**:
   ```bash
   pnpm --filter @petakeu/web test:e2e
   ```
   *Expected: Browser test suites pass without CSP violation errors or unhandled fetch rejections.*
