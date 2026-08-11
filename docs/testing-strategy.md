# Testing Strategy Documentation

Comprehensive testing approach for Petakeu covering unit, integration, E2E, and performance testing.

---

## Testing Pyramid

```
                    ┌─────────────┐
                    │   E2E       │  ← Few, high confidence, slow
                    │  (Playwright)│
                   ┌───────────────┐
                   │ Integration   │  ← Medium count, medium speed
                   │  (API + DB)   │
                  ┌─────────────────┐
                  │   Unit          │  ← Many, fast, isolated
                  │  (Vitest)       │
                 ┌───────────────────┐
                 │   Static          │  ← Continuous, fastest
                 │  (TypeScript,     │
                 │   ESLint,         │
                 │   Prettier)       │
                └─────────────────────┘
```

## Current Verification Snapshot (2026-08-12)

The current roadmap implementation slice has been verified with:

| Command | Result | Scope |
|---------|--------|-------|
| `pnpm typecheck` | Pass | Server and web TypeScript projects |
| `pnpm test` | Pass | Server (50 tests) and web (5 tests) |
| `pnpm build` | Pass | Production server compilation and Vite bundle |

The new analytics coverage includes Zod query/target validation and frontend
period normalization, target-variance, and analytics utility behavior. Role
hierarchy, approval transitions, fiscal-period locks, and report ranking paths
also have focused server tests. Integration, browser, load, and security suites
remain release-hardening work as tracked in the roadmap.

---

## Test Categories

### 1. Static Analysis (Continuous)

| Tool | Purpose | Run On |
|------|---------|--------|
| TypeScript (`tsc --noEmit`) | Type safety | Every commit, CI |
| ESLint | Code quality, patterns | Every commit, CI |
| Prettier | Code formatting | Every commit, CI |
| `pnpm audit` | Vulnerability scanning | CI, scheduled weekly |

**Configuration:**
- Server: `apps/server/tsconfig.json`, `.eslintrc.js`
- Web: `apps/web/tsconfig.json`, `.eslintrc.js`

---

### 2. Unit Tests (Vitest)

#### Server (`apps/server`)

**Target Coverage:** ≥ 80% for services, 100% for utils

| Module | Test File | Key Scenarios |
|--------|-----------|---------------|
| `geo-service` | `geo-service.test.ts` | Quantile calculation, public mode, classification |
| `region-service` | (planned) | Filtering, hierarchy, summary calculation |
| `upload-service` | (planned) | Validation, parsing, deduplication, error handling |
| `report-service` | (planned) | Job creation, summary building, trend calculation |
| `analytics validators` | `validators/analytics.test.ts` | Period normalization, query bounds, target validation |
| `approval-service` | (focused server tests) | Role checks, state transitions, lock enforcement |
| `utils/format` | (planned) | Currency, number, date formatting |
| `utils/math` | (planned) | Quantile, percentile, classification |

**Example: Geo Service Tests**
```typescript
// apps/server/src/services/geo-service.test.ts
import { describe, it, expect } from "vitest";
import { buildQuantileLegend, classifyQuantile } from "../utils/math";

describe("buildQuantileLegend", () => {
  it("returns 5 quantile bins for normal distribution", () => {
    const values = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    const bins = buildQuantileLegend(values);
    
    expect(bins).toHaveLength(5);
    expect(bins[0].min).toBe(10);
    expect(bins[4].max).toBe(100);
  });

  it("handles single value", () => {
    const bins = buildQuantileLegend([42]);
    expect(bins).toHaveLength(1);
    expect(bins[0].min).toBe(42);
    expect(bins[0].max).toBe(42);
  });

  it("handles empty array", () => {
    expect(buildQuantileLegend([])).toEqual([]);
  });
});

describe("classifyQuantile", () => {
  it("classifies value into correct bin", () => {
    const edges = [25, 50, 75, 100];
    expect(classifyQuantile(10, edges)).toBe(0);
    expect(classifyQuantile(30, edges)).toBe(0);
    expect(classifyQuantile(60, edges)).toBe(1);
    expect(classifyQuantile(90, edges)).toBe(3);
  });
});
```

**Run Commands:**
```bash
# Server unit tests
pnpm --filter @petakeu/server test

# With coverage
pnpm --filter @petakeu/server test --coverage
```

#### Web (`apps/web`)

**Target Coverage:** ≥ 70% for components, 90% for hooks/utils

| Module | Test File | Key Scenarios |
|--------|-----------|---------------|
| `Legend` | `Legend.test.tsx` | Quantile labels, empty state |
| `hooks/useChoropleth` | (planned) | Fetching, caching, error states |
| `hooks/useRegionSummary` | (planned) | Fetching, public mode, params |
| `hooks/useUploads` | (planned) | Polling, status transitions |
| `hooks/useReportJobs` | (planned) | Polling, expiration |
| `lib/format` | (planned) | Currency, numbers, dates |
| `lib/utils` | (planned) | Classnames, helpers |
| `analytics-utils` | `components/analytics/__tests__/analytics-utils.test.ts` | Period labels, variance, achievement, trend helpers |

**Example: Component Test**
```tsx
// apps/web/src/components/__tests__/Legend.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Legend } from "../Legend";

describe("Legend", () => {
  it("renders 5 quantile items with formatted labels", () => {
    render(<Legend stops={[1_000_000, 2_000_000, 3_000_000, 4_000_000, 5_000_000]} />);
    
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(5);
    expect(items[0].textContent).toContain("≤ Rp 1.000.000");
    expect(items[4].textContent).toContain("> Rp 4.000.000");
  });

  it("returns null for empty stops", () => {
    const { container } = render(<Legend stops={[]} />);
    expect(container.firstChild).toBeNull();
  });
});
```

**Run Commands:**
```bash
# Web unit tests
pnpm --filter @petakeu/web test

# With coverage
pnpm --filter @petakeu/web test --coverage

# Watch mode
pnpm --filter @petakeu/web test --watch
```

---

### 3. Integration Tests (Vitest + Testcontainers)

**Purpose:** Test API endpoints with real database/Redis

**Setup:** Use Testcontainers for PostgreSQL/Redis in CI

```typescript
// tests/integration/regions.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PostgreSqlContainer, RedisContainer } from "@testcontainers/postgresql";
import { createApp } from "../../apps/server/src/server";
import { pgPool } from "../../apps/server/src/db/postgres";

describe("Regions API Integration", () => {
  let pgContainer: PostgreSqlContainer;
  let redisContainer: RedisContainer;
  let app: Express;
  let server: http.Server;

  beforeAll(async () => {
    // Start containers
    pgContainer = await new PostgreSqlContainer("postgis/postgis:16-3.4")
      .withDatabase("petakeu")
      .withUsername("petakeu")
      .withPassword("petakeu")
      .start();
    
    redisContainer = await new RedisContainer("redis:7-alpine").start();

    // Set env
    process.env.DATABASE_URL = pgContainer.getConnectionUri();
    process.env.REDIS_URL = redisContainer.getConnectionUri();

    // Create app and run migrations
    app = await createApp();
    await runMigrations(pgContainer.getConnectionUri());
    
    server = app.listen(0);
  });

  afterAll(async () => {
    await server.close();
    await pgContainer.stop();
    await redisContainer.stop();
  });

  it("GET /api/regions returns seeded regions", async () => {
    const response = await request(server).get("/api/regions");
    expect(response.status).toBe(200);
    expect(response.body.data.length).toBeGreaterThan(0);
  });

  it("GET /api/regions?level=province filters correctly", async () => {
    const response = await request(server).get("/api/regions?level=province");
    expect(response.status).toBe(200);
    expect(response.body.data.every((r: any) => r.level === "province")).toBe(true);
  });
});
```

**Run Commands:**
```bash
# Integration tests (requires Docker)
pnpm test:integration

# In CI with Testcontainers
```

---

### 4. End-to-End Tests (Playwright)

**Purpose:** Test critical user journeys in real browser

**Scenarios:**

| Scenario | Priority | Description |
|----------|----------|-------------|
| Map loads with choropleth | P0 | Verify map renders, legend shows, regions clickable |
| Region detail panel opens | P0 | Click region → panel shows totals, trend, download |
| Public mode hides values | P0 | `?public=1` → no amounts shown, only classes |
| Upload Excel file | P1 | Drag/drop → progress → success/error display |
| Duplicate upload rejected | P1 | Same file → 409 error shown |
| Generate report | P1 | Submit → polling → download link appears |
| Report URL expires | P2 | Wait 30s → URL becomes "Expired" |
| Period selector changes data | P1 | Switch period → map updates |
| Map mode toggle | P2 | Choropleth ↔ Heatmap toggle works |
| MSW scenario switching | P1 | `?scenario=spike` shows spike data |

**Playwright Config:**
```typescript
// apps/web/playwright.config.ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: "html",
  use: {
    baseURL: "http://localhost:5173",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
    { name: "Mobile Chrome", use: { ...devices["Pixel 5"] } },
    { name: "Mobile Safari", use: { ...devices["iPhone 12"] } },
  ],
  webServer: {
    command: "pnpm dev:web",
    url: "http://localhost:5173",
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
```

**Example Test:**
```typescript
// apps/web/tests/e2e/map.spec.ts
import { test, expect } from "@playwright/test";

test.describe("Map Dashboard", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/?scenario=normal");
    await page.waitForLoadState("networkidle");
  });

  test("loads choropleth map with legend", async ({ page }) => {
    // Wait for map to load
    await expect(page.locator(".leaflet-container")).toBeVisible();
    
    // Check legend has 5 items
    const legendItems = page.locator('[role="listitem"]');
    await expect(legendItems).toHaveCount(5);
  });

  test("clicking region opens detail panel", async ({ page }) => {
    // Click first region on map
    await page.locator(".leaflet-interactive").first().click();
    
    // Verify detail panel appears
    await expect(page.locator("text=Detail Wilayah")).toBeVisible();
    await expect(page.locator("text=Total Realisasi")).toBeVisible();
    await expect(page.locator("text=Tren 12 Bulan")).toBeVisible();
  });

  test("public mode hides numerical values", async ({ page }) => {
    await page.goto("/?scenario=normal&public=1");
    await page.waitForLoadState("networkidle");
    
    // Click region
    await page.locator(".leaflet-interactive").first().click();
    
    // Verify badge shows public mode
    await expect(page.locator("text=Mode Publik")).toBeVisible();
    
    // Verify no currency amounts shown
    await expect(page.locator("text=Rp")).not.toBeVisible();
  });

  test("scenario spike shows spike data", async ({ page }) => {
    await page.goto("/?scenario=spike");
    await page.waitForLoadState("networkidle");
    
    // Verify Surabaya/Jakarta have high values (visual check via legend)
    const legendItems = page.locator('[role="listitem"]');
    const lastItem = legendItems.last();
    await expect(lastItem).toContainText("Sangat Tinggi");
  });
});
```

**Run Commands:**
```bash
# Install browsers
pnpm --filter @petakeu/web exec playwright install

# Run E2E tests
pnpm --filter @petakeu/web test:e2e

# Headed mode for debugging
pnpm --filter @petakeu/web test:e2e --headed

# Debug mode
pnpm --filter @petakeu/web test:e2e --debug
```

---

### 5. Performance Tests (k6)

**Purpose:** Validate performance targets

**Scenarios:**

| Test | Target | Tool |
|------|--------|------|
| Choropleth API (cache hit) | p95 < 300ms | k6 |
| Choropleth API (cold) | p95 < 2s | k6 |
| Upload 10MB file | < 10s | k6 |
| Report generation | < 60s | k6 |
| Concurrent users (100) | Error rate < 1% | k6 |

**k6 Script:**
```javascript
// tests/performance/choropleth.js
import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  stages: [
    { duration: "30s", target: 10 },   // Ramp up
    { duration: "1m", target: 50 },    // Steady state
    { duration: "30s", target: 100 },  // Peak
    { duration: "30s", target: 0 },    // Ramp down
  ],
  thresholds: {
    http_req_duration: ["p(95)<300"],  // Cache hit target
    http_req_failed: ["rate<0.01"],    // <1% errors
  },
};

const BASE_URL = __ENV.API_URL || "http://localhost:4000";
const TOKEN = __ENV.AUTH_TOKEN;

export default function () {
  const headers = {
    Authorization: `Bearer ${TOKEN}`,
    "Content-Type": "application/json",
  };

  // Test choropleth endpoint
  const response = http.get(`${BASE_URL}/api/geo/choropleth?period=2025-08`, { headers });
  
  check(response, {
    "status is 200": (r) => r.status === 200,
    "has features": (r) => r.json().features.length > 0,
    "has legend": (r) => r.json().metadata.legend !== undefined,
  });

  sleep(1);
}
```

**Run:**
```bash
# Install k6
# Run
k6 run tests/performance/choropleth.js -e API_URL=https://api.petakeu.go.id -e AUTH_TOKEN=$TOKEN
```

---

## CI/CD Integration

### GitHub Actions Workflow

```yaml
# .github/workflows/test.yml
name: Test

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  static-analysis:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm typecheck

  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - run: pnpm install --frozen-lockfile
      - run: pnpm test --run --reporter=junit
      - uses: actions/upload-artifact@v4
        with:
          name: coverage
          path: coverage/

  integration-tests:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgis/postgis:16-3.4
        env:
          POSTGRES_DB: petakeu
          POSTGRES_USER: petakeu
          POSTGRES_PASSWORD: petakeu
        ports: ["5432:5432"]
        options: >-
          --health-cmd "pg_isready -U petakeu"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
      redis:
        image: redis:7-alpine
        ports: ["6379:6379"]
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - run: pnpm install --frozen-lockfile
      - run: pnpm test:integration

  e2e-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @petakeu/web build
      - run: pnpm --filter @petakeu/web exec playwright install --with-deps
      - run: pnpm --filter @petakeu/web test:e2e
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: apps/web/test-results/

  performance-tests:
    if: github.event_name == 'schedule' || github.event_name == 'workflow_dispatch'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: grafana/k6-action@v0.2.0
        with:
          filename: tests/performance/choropleth.js
          env: |
            API_URL=https://api.staging.petakeu.go.id
            AUTH_TOKEN=${{ secrets.STAGING_AUTH_TOKEN }}
```

---

## Test Data Management

### Fixtures

```typescript
// tests/fixtures/regions.ts
export const mockRegions = [
  { id: "prov-31", code: "31", name: "DKI Jakarta", level: "province" },
  { id: "city-jakarta", code: "3171", name: "Kota Jakarta Selatan", level: "regency", parentId: "prov-31" },
];

// tests/fixtures/payments.ts
export const mockPayments = [
  { regionId: "city-jakarta", period: "2025-08", amount: 1_500_000_000, source: "PAD" },
];
```

### Database Seeding for Tests

```sql
-- tests/sql/seed_test_data.sql
INSERT INTO regions (id, code_bps, name, level, geom) VALUES
  ('prov-31', '31', 'DKI Jakarta', 1, ST_GeomFromText('MULTIPOLYGON(...)', 4326)),
  ('city-jakarta', '3171', 'Kota Jakarta Selatan', 2, 'prov-31', ST_GeomFromText('MULTIPOLYGON(...)', 4326));

INSERT INTO payments (region_id, period, amount, source) VALUES
  ('city-jakarta', '2025-08-01', 1500000000, 'PAD');
```

---

## Coverage Requirements

| Category | Minimum Coverage | Target |
|----------|-----------------|--------|
| Server Services | 80% | 90% |
| Server Utils | 100% | 100% |
| Web Components | 70% | 80% |
| Web Hooks | 90% | 95% |
| Web Utils | 90% | 95% |
| Integration | N/A | All endpoints |
| E2E | N/A | All P0/P1 scenarios |

**Enforce in CI:**
```json
// vitest.config.ts
export default defineConfig({
  test: {
    coverage: {
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 70,
        statements: 80,
      },
    },
  },
});
```

---

## Debugging Tests

### Common Issues

| Issue | Solution |
|-------|----------|
| MSW not mocking in tests | Ensure `setupFiles` includes MSW setup |
| Async state not updated | Use `waitFor` / `findBy` queries |
| Timer issues | Use `vi.useFakeTimers()` |
| Database not reset | Use transactions + rollback |
| Flaky E2E | Add retries, better selectors, wait for network idle |

### Debug Commands

```bash
# Run single test file
pnpm test -- apps/server/src/services/geo-service.test.ts

# Run with verbose output
pnpm test -- --reporter=verbose

# Debug in VS Code
# Add breakpoint, run "Debug Test" from test explorer

# E2E debug
pnpm test:e2e -- --debug

# Update snapshots
pnpm test -- -u
```

---

## Test Maintenance

### Adding New Tests

1. **Unit:** Add to `__tests__/` or alongside module
2. **Integration:** Add to `tests/integration/`
3. **E2E:** Add to `apps/web/tests/e2e/`

### Review Checklist

- [ ] Test name describes behavior (not implementation)
- [ ] Tests are independent (no shared state)
- [ ] Edge cases covered (empty, error, boundary)
- [ ] No hardcoded IDs/timestamps
- [ ] Mocks are minimal and realistic
- [ ] Cleanup in `afterEach`/`afterAll`

### Test Debt Tracking

| Technical Debt | Priority | Owner |
|----------------|----------|-------|
| No integration tests for upload/report | High | Backend |
| No E2E tests for admin dashboard | Medium | Frontend |
| No contract testing (Pact) | Low | Both |
| No visual regression tests | Low | Frontend |
| No chaos engineering | Future | Platform |

---

## References

- [Vitest Documentation](https://vitest.dev/)
- [Playwright Documentation](https://playwright.dev/)
- [Testing Library](https://testing-library.com/)
- [k6 Load Testing](https://k6.io/docs/)
- [Testcontainers](https://testcontainers.com/)
- [MSW Testing](https://mswjs.io/docs/recipes/testing)
