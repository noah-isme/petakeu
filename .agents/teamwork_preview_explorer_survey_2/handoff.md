# Frontend Security (CSP) & API Resilience (Timeout/Abort) Investigation Report

## 1. Observation

### 1.1 HTML Entry Point & External Asset Audit (`apps/web/index.html`)
Direct inspection of `apps/web/index.html` (lines 1–27) revealed:
- **Fonts & CSS Preconnects**:
  ```html
  9:     <link rel="preconnect" href="https://fonts.googleapis.com" />
  10:    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  11:    <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700;800&family=Outfit:wght@400;500;600;700;800;900&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Space+Grotesk:wght@500;700&display=swap" rel="stylesheet" />
  12:    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin="" />
  ```
- **Inline Script for FOUC Prevention**:
  ```html
  13:    <script>
  14:      // Prevent FOUC: apply theme class before first paint
  15:      (function() {
  16:        var theme = localStorage.getItem('petakeu-theme') || 'system';
  17:        var isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  18:        if (isDark) document.documentElement.classList.add('dark');
  19:      })();
  20:    </script>
  ```
- **Module Entry**:
  ```html
  24:    <script type="module" src="/src/main.tsx"></script>
  ```
- **CSP State**: `index.html` currently lacks any `<meta http-equiv="Content-Security-Policy">` tag.

### 1.2 Map Tile Providers & Dynamic Assets
- **OpenStreetMap Tile Layer** (`apps/web/src/components/MapView.tsx:32-34`):
  ```tsx
  <TileLayer
    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
  />
  ```
  *(Subdomains `{s}` resolve to `a.tile.openstreetmap.org`, `b.tile.openstreetmap.org`, `c.tile.openstreetmap.org`)*.
- **CartoDB Voyager Tile Layer** (`apps/web/src/pages/MapPage.tsx:380-382`):
  ```tsx
  <TileLayer
    attribution="&copy; <a href='https://carto.com/attributions'>CartoDB</a>"
    url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
  />
  ```
  *(Subdomains `{s}` resolve to `a.basemaps.cartocdn.com`, `b.basemaps.cartocdn.com`, `c.basemaps.cartocdn.com`, `d.basemaps.cartocdn.com`)*.
- **Leaflet Marker Assets / CDNs**: `https://unpkg.com`, `https://*.openstreetmap.org`, `https://carto.com`.
- **MSW Service Worker**: `apps/web/public/mockServiceWorker.js` requiring worker execution permissions (`worker-src 'self' blob:`).

### 1.3 Backend Security Headers & Helmet Configuration
- **Express Helmet Middleware** (`apps/server/src/server.ts:60`):
  ```typescript
  app.use(helmet({ crossOriginResourcePolicy: false }));
  ```
- **Swagger Documentation Endpoint** (`apps/server/src/config/swagger.ts:443-454`):
  Served on `/api-docs` using `swagger-ui-express` in non-production environments.
- **MinIO / Storage Integration** (`apps/server/src/services/storage-service.ts:41-48`, `apps/server/src/db/minio.ts:17, 54, 74`):
  MinIO presigned URLs point to `http://localhost:9000` (dev/testing), `https://storage.petakeu.local` (local staging), or `https://*.petakeu.go.id` (production).

### 1.4 Frontend API Client & Request Handling (`apps/web/src/api/client.ts`)
- **`fetchJson` Implementation** (`apps/web/src/api/client.ts:72-84`):
  ```typescript
  async function fetchJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
    const headers = new Headers(init?.headers);
    const token = getAccessToken();
    if (token && !headers.has("Authorization")) {
      headers.set("Authorization", `Bearer ${token}`);
    }

    const response = await fetch(input, { ...init, headers });
    if (!response.ok) {
      throw await responseError(response);
    }
    return response.json() as Promise<T>;
  }
  ```
- **`downloadUploadTemplate` Implementation** (`apps/web/src/api/client.ts:335-345`):
  ```typescript
  async function downloadUploadTemplate() {
    const url = buildUrl("/uploads/template");
    const headers = new Headers();
    const token = getAccessToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
    const response = await fetch(url, { headers });
    if (!response.ok) {
      throw await responseError(response);
    }
    return response.blob();
  }
  ```
- **Deficiencies Identified**:
  1. No timeout mechanism: A hanging backend connection or network blackhole keeps the promise in a pending state indefinitely, resulting in frozen spinners in the UI.
  2. No `AbortController` integration: Caller cancellation or TanStack React Query query unmounts cannot cancel pending network fetches.
  3. No distinct `ApiTimeoutError` type: Callers only have `ApiHttpError` (which is only instantiated for non-2xx responses).

### 1.5 Callers of `apiClient` Across `apps/web`
- **React Query Hooks**:
  - `apps/web/src/hooks/useAuditLogs.ts` -> `apiClient.listAuditLogs`
  - `apps/web/src/hooks/useChoropleth.ts` -> `apiClient.getChoropleth`
  - `apps/web/src/hooks/useRegionSummary.ts` -> `apiClient.getRegionSummary`
  - `apps/web/src/hooks/useRegions.ts` -> `apiClient.getRegions`
  - `apps/web/src/hooks/useReportJobs.ts` -> `apiClient.listReportJobs`
  - `apps/web/src/hooks/useUploads.ts` -> `apiClient.listUploads`, `getUpload`, `getUploadRows`
- **Pages & Components**:
  - `apps/web/src/pages/UploadPage.tsx` -> `apiClient.uploadFile`, `updateUploadRow`, `confirmUpload`, `cancelUpload`, `downloadUploadTemplate`, `createRegionAlias`
  - `apps/web/src/pages/ReportsPage.tsx` -> `apiClient.createReport`
  - `apps/web/src/pages/AdminDashboard.tsx` -> `apiClient.createReport`
  - `apps/web/src/components/admin/UploadForm.tsx` -> `apiClient.uploadFile`
  - `apps/web/src/pages/MapDashboard.tsx` & `apps/web/src/hooks/useAnalytics.ts` (currently have standalone un-resilient `fetch` helpers).

---

## 2. Logic Chain

1. **CSP Requirements**:
   - Leaflet map rendering in `MapView.tsx` and `MapPage.tsx` fetches raster PNG tiles from `https://*.tile.openstreetmap.org` and `https://*.basemaps.cartocdn.com`. Therefore, `img-src` must include both wildcard hostnames, plus `data:` and `blob:`.
   - Google Fonts loaded in `index.html` requires `style-src https://fonts.googleapis.com` and `font-src https://fonts.gstatic.com data:`.
   - Leaflet CSS loaded from `https://unpkg.com/leaflet@1.9.4/dist/leaflet.css` requires `style-src https://unpkg.com`.
   - The inline theme script in `index.html:13-19` and Vite's dev HMR style/script injection require `'unsafe-inline'` for `style-src` and `script-src` in SPA mode.
   - Network fetches (`connect-src`) must allow API communication to `'self'`, `http://localhost:*`, `http://127.0.0.1:*`, `ws://localhost:*`, `ws://127.0.0.1:*`, `https://api.petakeu.go.id`, `https://*.petakeu.go.id`, MinIO storage `http://localhost:9000`, `https://storage.petakeu.local`, as well as tile endpoints if fetched via canvas/AJAX.
   - `object-src 'none'`, `base-uri 'self'`, and `worker-src 'self' blob:` ensure XSS vectors via object/embed tags are blocked while MSW service workers operate without friction.

2. **API Client Resilience Architecture**:
   - Introducing `ApiTimeoutError` (with `status: 408` and `timeoutMs`) provides a clear, typed distinction between HTTP status failures and network timeouts.
   - Introducing `RequestOptions` (with `timeout?: number; signal?: AbortSignal | null`) allows callers to specify custom per-request timeouts (e.g. 5s for fast health checks, 60s for report generation) or pass TanStack Query abort signals.
   - Centralizing all fetch calls through a unified `fetchWithTimeout` helper ensures that:
     1. An internal timer fires `controller.abort()` when `DEFAULT_TIMEOUT_MS` (30,000ms) elapses.
     2. An external signal (if provided) is listened to and aborted cleanly without memory leaks.
     3. Timers and event listeners are guaranteed to be cleaned up in a `finally` block.
     4. `AbortError` triggered by an intentional caller abort is distinguishable from a timeout abort.
   - By adding `options?: RequestOptions` as an optional trailing parameter to all 17 methods on `apiClient`, 100% backward compatibility is preserved for all existing caller call sites while unlocking opt-in custom configuration.

---

## 3. Caveats

1. **Meta Tag CSP Limitations**: Certain CSP directives (such as `frame-ancestors`) are ignored by browsers when specified inside an HTML `<meta>` tag per the W3C CSP Level 2/3 specification. Therefore, `frame-ancestors` must be enforced at the HTTP header level via Express Helmet (`apps/server/src/server.ts`) and Nginx reverse proxy (`apps/web/nginx.conf`).
2. **Vite Development vs. Production Inline Scripts**: In local development, Vite injects module scripts and HMR wrappers dynamically. Hence, `'unsafe-inline'` in `script-src` is necessary for smooth developer experience and Playwright MSW testing.

---

## 4. Conclusion & Concrete Implementation Blueprint

### 4.1 CSP Implementation in `apps/web/index.html`
Insert the following `<meta>` tag immediately within `<head>` in `apps/web/index.html`:

```html
<meta
  http-equiv="Content-Security-Policy"
  content="default-src 'self';
    script-src 'self' 'unsafe-inline';
    style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://unpkg.com;
    font-src 'self' data: https://fonts.gstatic.com;
    img-src 'self' data: blob: https://*.tile.openstreetmap.org https://*.basemaps.cartocdn.com https://unpkg.com https://*.openstreetmap.org http://localhost:9000 https://storage.petakeu.local;
    connect-src 'self' http://localhost:* ws://localhost:* http://127.0.0.1:* ws://127.0.0.1:* https://api.petakeu.go.id https://*.petakeu.go.id http://localhost:9000 https://storage.petakeu.local https://*.tile.openstreetmap.org https://*.basemaps.cartocdn.com;
    worker-src 'self' blob:;
    object-src 'none';
    base-uri 'self';"
/>
```

### 4.2 Helmet Configuration in `apps/server/src/server.ts`
Update line 60 of `apps/server/src/server.ts` with explicit security policies:

```typescript
app.use(
  helmet({
    crossOriginResourcePolicy: false,
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://unpkg.com"],
        fontSrc: ["'self'", "data:", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "blob:", "https:", "http://localhost:9000"],
        connectSrc: ["'self'", "https://api.petakeu.go.id", "http://localhost:*", "ws://localhost:*"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
  })
);
```

### 4.3 Resilience & Timeout Implementation in `apps/web/src/api/client.ts`

```typescript
export const DEFAULT_API_TIMEOUT_MS = 30_000;

export interface RequestOptions extends Omit<RequestInit, "signal"> {
  timeout?: number;
  signal?: AbortSignal | null;
}

export class ApiTimeoutError extends Error {
  readonly status: number = 408;
  readonly timeoutMs: number;

  constructor(timeoutMs: number, message?: string) {
    super(message ?? `Permintaan melebihi batas waktu ${timeoutMs / 1000} detik.`);
    this.name = "ApiTimeoutError";
    this.timeoutMs = timeoutMs;
    Object.setPrototypeOf(this, ApiTimeoutError.prototype);
  }
}

export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestOptions
): Promise<Response> {
  const { timeout = DEFAULT_API_TIMEOUT_MS, signal: callerSignal, ...restInit } = init ?? {};
  const headers = new Headers(restInit.headers);
  const token = getAccessToken();
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let isTimedOut = false;

  const onCallerAbort = () => {
    controller.abort(callerSignal?.reason);
  };

  if (callerSignal) {
    if (callerSignal.aborted) {
      controller.abort(callerSignal.reason);
    } else {
      callerSignal.addEventListener("abort", onCallerAbort, { once: true });
    }
  }

  if (timeout > 0 && Number.isFinite(timeout)) {
    timeoutId = setTimeout(() => {
      isTimedOut = true;
      controller.abort(new Error(`Timeout of ${timeout}ms exceeded`));
    }, timeout);
  }

  try {
    return await fetch(input, {
      ...restInit,
      headers,
      signal: controller.signal
    });
  } catch (err: unknown) {
    if (isTimedOut) {
      throw new ApiTimeoutError(timeout, `Permintaan waktu habis setelah ${timeout / 1000} detik.`);
    }
    throw err;
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    if (callerSignal) {
      callerSignal.removeEventListener("abort", onCallerAbort);
    }
  }
}

async function fetchJson<T>(input: RequestInfo | URL, init?: RequestOptions): Promise<T> {
  const response = await fetchWithTimeout(input, init);
  if (!response.ok) {
    throw await responseError(response);
  }
  return response.json() as Promise<T>;
}
```

---

## 5. Verification Method

### 5.1 Unit & Integration Test Commands
1. **Frontend Unit Tests**:
   ```bash
   pnpm --filter @petakeu/web test
   ```
   *Expected: All 6 test suites pass, including extended tests in `apps/web/src/api/__tests__/client.test.ts` for timeout and signal abort handling.*
2. **Typecheck & Lint Across Monorepo**:
   ```bash
   pnpm typecheck && pnpm lint
   ```
   *Expected: 0 errors across `@petakeu/web` and `@petakeu/server`.*
3. **Backend Unit & Integration Tests**:
   ```bash
   pnpm --filter @petakeu/server test
   ```
   *Expected: 15 test files pass with 0 failures.*
4. **E2E Playwright Suite**:
   ```bash
   pnpm --filter @petakeu/web test:e2e
   ```
   *Expected: Map exploration, data upload, report generation, and security contract suites pass without CSP or network errors.*

### 5.2 Invalidation Conditions
- Any tile layer failing to load with CSP violation `Refused to load the image ... because it violates the following Content Security Policy directive` in browser devtools / Playwright console logs.
- Hanging network requests in `client.ts` taking >30s without throwing `ApiTimeoutError`.
- Regression in existing `apiClient` callers or unhandled exceptions when queries are aborted.
