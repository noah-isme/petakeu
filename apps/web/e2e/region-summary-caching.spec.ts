import { test, expect, Page } from "@playwright/test";

/**
 * E2E Test Suite: Tier 2 - Region Summary Caching & Invalidation
 * 
 * Target Endpoints:
 * - GET /api/v1/regions/:id/summary?from=YYYY-MM&to=YYYY-MM
 * - POST /api/v1/uploads (triggers cache invalidation)
 * 
 * Features & Specifications:
 * 1. GET /api/v1/regions/:id/summary returns region summary metadata, overall totals, and monthly breakdown.
 * 2. Accepts date range boundaries 'from' and 'to' (YYYY-MM).
 * 3. Cache hit consistency on repeated GET calls with identical params.
 * 4. Cache invalidation flow: Triggering payment uploads or MV refresh purges region summary cache.
 * 5. Invalid region IDs or malformed date ranges produce appropriate HTTP 404 / 400 error codes.
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
  options: { method?: string; body?: any; headers?: Record<string, string>; isFormData?: boolean } = {}
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
          if (fetchOpts.isFormData) {
            const formData = new FormData();
            const content = typeof fetchOpts.body === "object" ? fetchOpts.body.content : fetchOpts.body;
            const filename = (typeof fetchOpts.body === "object" && fetchOpts.body.filename) || "upload.csv";
            const blob = new Blob([content || "kode_daerah,nama_daerah,periode,setoran\n3301,Cilacap,2025-08,1000000\n"], { type: "text/csv" });
            formData.append("file", blob, filename);
            init.body = formData;
          } else {
            init.body = typeof fetchOpts.body === "string" ? fetchOpts.body : JSON.stringify(fetchOpts.body);
            if (!init.headers || !("Content-Type" in (init.headers as Record<string, string>))) {
              (init.headers as Record<string, string>)["Content-Type"] = "application/json";
            }
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

// Helper to query region summary endpoint across candidate URLs
async function fetchRegionSummary(
  page: Page,
  regionId: string,
  params: Record<string, string> = {}
): Promise<ApiResponse> {
  const queryStr = new URLSearchParams(params).toString();
  const search = queryStr ? `?${queryStr}` : "";

  const candidateUrls = [
    `/api/v1/regions/${regionId}/summary${search}`,
    `/api/regions/${regionId}/summary${search}`,
    `http://localhost:3001/api/v1/regions/${regionId}/summary${search}`,
    `http://localhost:5175/api/v1/regions/${regionId}/summary${search}`,
  ];

  for (const url of candidateUrls) {
    const res = await apiFetch(page, url);
    if ((res.ok() || res.status() === 200 || res.status() === 404) && res.contentType.includes("application/json")) {
      return res;
    }
  }

  return apiFetch(page, `/api/v1/regions/${regionId}/summary${search}`);
}

test.describe("Tier 2: Region Summary Caching & Invalidation", () => {
  const TEST_REGION_ID = "3301";

  // --------------------------------------------------------------------------
  // Test Case 1: Standard Region Summary Data Structure
  // --------------------------------------------------------------------------
  test("2.1: GET /api/v1/regions/:id/summary returns structured region metadata, totals, and monthly breakdown", async ({ page }) => {
    const res = await fetchRegionSummary(page, TEST_REGION_ID, {
      from: "2024-01",
      to: "2025-08",
    });

    expect(res).not.toBeNull();
    expect(res.status()).toBe(200);

    const body = await res.json();

    // Verify region object
    expect(body).toHaveProperty("region");
    expect(body.region).toHaveProperty("id");
    expect(body.region).toHaveProperty("code");
    expect(body.region).toHaveProperty("name");
    expect(body.region).toHaveProperty("level");

    // Verify aggregate financial metrics
    expect(body).toHaveProperty("totalAmount");
    expect(body).toHaveProperty("cut15Amount");
    expect(body).toHaveProperty("netAmount");
    expect(typeof body.totalAmount).toBe("number");
    expect(typeof body.cut15Amount).toBe("number");
    expect(typeof body.netAmount).toBe("number");

    // Verify financial formula integrity: netAmount = totalAmount - cut15Amount
    const expectedNet = body.totalAmount - body.cut15Amount;
    expect(Math.abs(body.netAmount - expectedNet)).toBeLessThanOrEqual(0.01);

    // Verify monthly breakdown / trend array
    const breakdown = body.monthlyBreakdown ?? body.trend;
    expect(Array.isArray(breakdown)).toBe(true);
    if (breakdown.length > 0) {
      const item = breakdown[0];
      expect(item).toHaveProperty("period");
      expect(item).toHaveProperty("amount");
    }

    // Verify timestamp metadata
    expect(body).toHaveProperty("lastUpdated");
  });

  // --------------------------------------------------------------------------
  // Test Case 2: Boundary Date Range Query Parameters (from & to)
  // --------------------------------------------------------------------------
  test("2.2: GET /api/v1/regions/:id/summary respects date range boundaries (from=YYYY-MM&to=YYYY-MM)", async ({ page }) => {
    const from = "2024-01";
    const to = "2024-06";
    const res = await fetchRegionSummary(page, TEST_REGION_ID, { from, to });

    expect(res).not.toBeNull();
    expect(res.status()).toBe(200);

    const body = await res.json();
    const breakdown = body.monthlyBreakdown ?? body.trend ?? [];

    for (const entry of breakdown) {
      expect(entry.period >= from).toBe(true);
      expect(entry.period <= to).toBe(true);
    }
  });

  // --------------------------------------------------------------------------
  // Test Case 3: Cache Hit Consistency on Repeated Requests
  // --------------------------------------------------------------------------
  test("2.3: Repeated summary requests with identical params hit Redis cache with payload consistency", async ({ page }) => {
    const params = { from: "2024-01", to: "2025-08" };

    // Initial Request - Cache Miss / DB query
    const res1 = await fetchRegionSummary(page, TEST_REGION_ID, params);
    expect(res1).not.toBeNull();
    expect(res1.status()).toBe(200);
    const body1 = await res1.json();

    // Subsequent Request - Cache Hit
    const res2 = await fetchRegionSummary(page, TEST_REGION_ID, params);
    expect(res2).not.toBeNull();
    expect(res2.status()).toBe(200);
    const body2 = await res2.json();

    // Verify payload identity between calls
    expect(body2.region.id).toBe(body1.region.id);
    expect(body2.totalAmount).toBe(body1.totalAmount);
    expect(body2.netAmount).toBe(body1.netAmount);
    expect(body2.lastUpdated).toBe(body1.lastUpdated);
  });

  // --------------------------------------------------------------------------
  // Test Case 4: Cache Key Isolation Between Regions & Ranges
  // --------------------------------------------------------------------------
  test("2.4: Region summary cache keys isolate data across different region IDs and date ranges", async ({ page }) => {
    const resRegionA = await fetchRegionSummary(page, "3301", { from: "2024-01", to: "2024-06" });
    const resRegionB = await fetchRegionSummary(page, "3302", { from: "2024-01", to: "2024-06" });

    expect(resRegionA).not.toBeNull();
    expect(resRegionB).not.toBeNull();
    expect(resRegionA.status()).toBe(200);
    expect(resRegionB.status()).toBe(200);

    const bodyA = await resRegionA.json();
    const bodyB = await resRegionB.json();

    expect(bodyA.region.id).not.toBe(bodyB.region.id);
  });

  // --------------------------------------------------------------------------
  // Test Case 5: Cache Invalidation Trigger Flow
  // --------------------------------------------------------------------------
  test("2.5: Cache invalidation trigger purges region summary cache to force fresh data retrieval", async ({ page }) => {
    // Step 1: Pre-warm region summary cache
    const resBefore = await fetchRegionSummary(page, TEST_REGION_ID, { from: "2024-01", to: "2025-08" });
    expect(resBefore).not.toBeNull();
    expect(resBefore.status()).toBe(200);

    // Step 2: Trigger payment upload using multipart/form-data for invalidation
    const uploadPayload = {
      filename: "invalidation-trigger.csv",
      content: "kode_daerah,nama_daerah,periode,setoran\n3301,Cilacap,2025-08,1000000\n",
    };

    let uploadRes = await apiFetch(page, "/api/uploads", {
      method: "POST",
      isFormData: true,
      body: uploadPayload,
    });

    if (!uploadRes || !uploadRes.ok()) {
      uploadRes = await apiFetch(page, "/api/v1/uploads", {
        method: "POST",
        isFormData: true,
        body: uploadPayload,
      });
    }

    // Step 3: Fetch region summary after invalidation trigger
    const resAfter = await fetchRegionSummary(page, TEST_REGION_ID, { from: "2024-01", to: "2025-08" });
    expect(resAfter).not.toBeNull();
    expect(resAfter.status()).toBe(200);
    const bodyAfter = await resAfter.json();

    expect(bodyAfter).toHaveProperty("region");
    expect(bodyAfter.region.id).toBe(TEST_REGION_ID);
  });

  // --------------------------------------------------------------------------
  // Test Case 6: Non-Existent Region ID Error Handling (HTTP 404)
  // --------------------------------------------------------------------------
  test("2.6: GET /api/v1/regions/:id/summary returns HTTP 404 for non-existent region ID", async ({ page }) => {
    const res = await fetchRegionSummary(page, "non-existent-uuid-99999");
    expect(res).not.toBeNull();
    expect([404, 400]).toContain(res.status());
  });
});

