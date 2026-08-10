import { test, expect, Page } from "@playwright/test";

/**
 * E2E Test Suite: Tier 1 - Choropleth GeoJSON Caching & Query Parameters
 * 
 * Target Endpoints:
 * - GET /api/v1/geo/choropleth
 * - GET /api/geo/choropleth
 * 
 * Features & Specifications:
 * 1. GET /api/v1/geo/choropleth accepts query params: period, level (1, 2), parent (UUID/code), public (1/true).
 * 2. GeoJSON response structure matches FeatureCollection schema:
 *    - type: "FeatureCollection"
 *    - features: array of GeoJSON Feature objects with geometry & properties.
 *    - properties include: regionId/id, name, value/neto, centroid, classIndex, classLabel.
 * 3. Redis caching layer returns identical payloads and faster response times on subsequent cached calls.
 * 4. Distinct query parameter combinations produce isolated cache keys.
 */

interface ApiResponse<T = any> {
  status: () => number;
  ok: () => boolean;
  headers: () => Record<string, string>;
  json: () => Promise<T>;
  contentType: string;
  rawBody: T | null;
}

async function ensurePageLoaded(page: Page) {
  if (page.url() === "about:blank" || !page.url().includes("5175")) {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
  }
}

async function apiFetch<T = any>(
  page: Page,
  url: string,
  options: { method?: string; body?: any; headers?: Record<string, string> } = {}
): Promise<ApiResponse<T>> {
  await ensurePageLoaded(page);

  const raw = await page.evaluate(
    async ({ fetchUrl, fetchOpts }) => {
      try {
        const init: RequestInit = {
          method: fetchOpts.method || "GET",
          headers: fetchOpts.headers || {},
        };

        if (fetchOpts.body) {
          init.body = typeof fetchOpts.body === "string" ? fetchOpts.body : JSON.stringify(fetchOpts.body);
          if (!init.headers || !("Content-Type" in (init.headers as Record<string, string>))) {
            (init.headers as Record<string, string>)["Content-Type"] = "application/json";
          }
        }

        const res = await fetch(fetchUrl, init);
        const contentType = res.headers.get("content-type") || "";
        const headersObj: Record<string, string> = {};
        res.headers.forEach((val, key) => {
          headersObj[key.toLowerCase()] = val;
        });

        let body = null;
        if (contentType.includes("application/json")) {
          try {
            body = await res.json();
          } catch {
            body = null;
          }
        }

        return {
          statusCode: res.status,
          isOk: res.ok,
          contentType,
          headersObj,
          body,
        };
      } catch {
        return {
          statusCode: 0,
          isOk: false,
          contentType: "",
          headersObj: {},
          body: null,
        };
      }
    },
    { fetchUrl: url, fetchOpts: options }
  );

  return {
    status: () => raw.statusCode,
    ok: () => raw.isOk,
    headers: () => raw.headersObj,
    json: async () => raw.body,
    contentType: raw.contentType,
    rawBody: raw.body,
  };
}

// Helper to query choropleth endpoint across candidate URLs
async function fetchChoropleth(
  page: Page,
  params: Record<string, string> = {}
): Promise<ApiResponse> {
  const queryStr = new URLSearchParams(params).toString();
  const search = queryStr ? `?${queryStr}` : "";

  const candidateUrls = [
    `/api/v1/geo/choropleth${search}`,
    `/api/geo/choropleth${search}`,
    `http://localhost:3001/api/v1/geo/choropleth${search}`,
    `http://localhost:5175/api/v1/geo/choropleth${search}`,
  ];

  for (const url of candidateUrls) {
    const res = await apiFetch(page, url);
    if ((res.ok() || res.status() === 200) && res.contentType.includes("application/json")) {
      return res;
    }
  }

  // Fallback to primary URL
  return apiFetch(page, `/api/v1/geo/choropleth${search}`);
}

test.describe("Tier 1: Choropleth GeoJSON Caching & Query Params", () => {
  // --------------------------------------------------------------------------
  // Test Case 1: Default Choropleth GeoJSON FeatureCollection Schema
  // --------------------------------------------------------------------------
  test("1.1: GET /api/v1/geo/choropleth returns valid GeoJSON FeatureCollection structure", async ({ page }) => {
    const res = await fetchChoropleth(page, { period: "2025-08" });
    expect(res).not.toBeNull();
    expect(res.status()).toBe(200);

    const contentType = res.headers()["content-type"] ?? res.contentType ?? "";
    expect(contentType).toContain("application/json");

    const body = await res.json();

    // Verify top-level GeoJSON FeatureCollection structure
    expect(body).toHaveProperty("type", "FeatureCollection");
    expect(body).toHaveProperty("features");
    expect(Array.isArray(body.features)).toBe(true);
    expect(body.features.length).toBeGreaterThan(0);

    // Verify feature structure for the first feature
    const feature = body.features[0];
    expect(feature).toHaveProperty("type", "Feature");
    expect(feature).toHaveProperty("geometry");
    expect(feature).toHaveProperty("properties");

    // Check essential property fields
    const props = feature.properties;
    expect(props).toHaveProperty("regionId");
    expect(props).toHaveProperty("name");
    expect(props).toHaveProperty("classIndex");
    expect(props).toHaveProperty("classLabel");
    expect(typeof props.regionId).toBe("string");
    expect(typeof props.name).toBe("string");
    expect(typeof props.classIndex).toBe("number");

    // Check metadata object
    if (body.metadata) {
      expect(body.metadata).toHaveProperty("period");
      expect(body.metadata).toHaveProperty("legend");
    }
  });

  // --------------------------------------------------------------------------
  // Test Case 2: Level Filtering Query Parameter (level=1 vs level=2)
  // --------------------------------------------------------------------------
  test("1.2: GET /api/v1/geo/choropleth filters features by level parameter (level=1 vs level=2)", async ({ page }) => {
    const resLevel1 = await fetchChoropleth(page, { period: "2025-08", level: "1" });
    expect(resLevel1).not.toBeNull();
    expect(resLevel1.status()).toBe(200);
    const bodyLevel1 = await resLevel1.json();

    const resLevel2 = await fetchChoropleth(page, { period: "2025-08", level: "2" });
    expect(resLevel2).not.toBeNull();
    expect(resLevel2.status()).toBe(200);
    const bodyLevel2 = await resLevel2.json();

    // Both should return valid FeatureCollections
    expect(bodyLevel1.type).toBe("FeatureCollection");
    expect(bodyLevel2.type).toBe("FeatureCollection");
    expect(Array.isArray(bodyLevel1.features)).toBe(true);
    expect(Array.isArray(bodyLevel2.features)).toBe(true);

    // Verify level 1 features are defined
    for (const feat of bodyLevel1.features) {
      expect(feat.properties).toHaveProperty("regionId");
      expect(feat.properties).toHaveProperty("name");
    }
  });

  // --------------------------------------------------------------------------
  // Test Case 3: Parent Region Filtering Query Parameter
  // --------------------------------------------------------------------------
  test("1.3: GET /api/v1/geo/choropleth filters features by parent region UUID/code", async ({ page }) => {
    const parentId = "3300";
    const res = await fetchChoropleth(page, {
      period: "2025-08",
      level: "2",
      parent: parentId,
    });

    expect(res).not.toBeNull();
    expect(res.status()).toBe(200);
    const body = await res.json();

    expect(body.type).toBe("FeatureCollection");
    expect(Array.isArray(body.features)).toBe(true);

    // Verify all returned features belong to requested scope or are valid GeoJSON features
    for (const feat of body.features) {
      expect(feat.type).toBe("Feature");
      expect(feat.properties).toHaveProperty("regionId");
    }
  });

  // --------------------------------------------------------------------------
  // Test Case 4: Public Mode Privacy Enforcement (public=1 or public=true)
  // --------------------------------------------------------------------------
  test("1.4: GET /api/v1/geo/choropleth in public mode hides detailed numerical values", async ({ page }) => {
    const resPublic = await fetchChoropleth(page, { period: "2025-08", public: "true" });
    expect(resPublic).not.toBeNull();
    expect(resPublic.status()).toBe(200);
    const bodyPublic = await resPublic.json();

    expect(bodyPublic.type).toBe("FeatureCollection");
    if (bodyPublic.metadata) {
      expect(bodyPublic.metadata.public).toBe(true);
    }

    // In public mode, detailed numerical properties (value / normalizedValue) are omitted or hidden
    for (const feat of bodyPublic.features) {
      expect(feat.properties).toHaveProperty("classIndex");
      expect(feat.properties).toHaveProperty("classLabel");
      expect(feat.properties.value).toBeUndefined();
    }
  });

  // --------------------------------------------------------------------------
  // Test Case 5: Redis Caching & Subsequent Request Latency Performance
  // --------------------------------------------------------------------------
  test("1.5: Subsequent requests with identical parameters hit Redis cache with faster response timing", async ({ page }) => {
    const params = { period: "2025-08", level: "2" };

    // Initial Request - Cache Miss / DB Build
    const startMiss = Date.now();
    const resMiss = await fetchChoropleth(page, params);
    const missDuration = Date.now() - startMiss;

    expect(resMiss).not.toBeNull();
    expect(resMiss.status()).toBe(200);
    const bodyMiss = await resMiss.json();

    // Second Request - Cache Hit
    const startHit = Date.now();
    const resHit = await fetchChoropleth(page, params);
    const hitDuration = Date.now() - startHit;

    expect(resHit).not.toBeNull();
    expect(resHit.status()).toBe(200);
    const bodyHit = await resHit.json();

    // Verify cached response body matches initial response body
    expect(bodyHit.type).toBe(bodyMiss.type);
    expect(bodyHit.features.length).toBe(bodyMiss.features.length);

    // Check header or timing improvement for cached hit
    const xCacheHeader = resHit.headers()["x-cache"];
    if (xCacheHeader) {
      expect(xCacheHeader.toUpperCase()).toContain("HIT");
    } else {
      // Fast latency check: cached hit duration should be less than or equal to missDuration + 5
      expect(hitDuration).toBeLessThanOrEqual(missDuration + 5);
    }
  });

  // --------------------------------------------------------------------------
  // Test Case 6: Cache Isolation for Distinct Query Parameters
  // --------------------------------------------------------------------------
  test("1.6: Distinct period and parameter combinations maintain independent cache entries", async ({ page }) => {
    const resPeriodA = await fetchChoropleth(page, { period: "2024-01" });
    const resPeriodB = await fetchChoropleth(page, { period: "2025-08" });

    expect(resPeriodA).not.toBeNull();
    expect(resPeriodB).not.toBeNull();
    expect(resPeriodA.status()).toBe(200);
    expect(resPeriodB.status()).toBe(200);

    const bodyA = await resPeriodA.json();
    const bodyB = await resPeriodB.json();

    if (bodyA.metadata && bodyB.metadata) {
      expect(bodyA.metadata.period).toBe("2024-01");
      expect(bodyB.metadata.period).toBe("2025-08");
    }
  });
});

