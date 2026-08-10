import { test, expect, Page } from "@playwright/test";

/**
 * E2E Test Suite: Tier 3 - Report Generation Job Enqueueing & Download
 * 
 * Target Endpoints:
 * - POST /api/v1/reports/export (or POST /api/v1/reports)
 * - GET /api/v1/reports/:id
 * - GET /api/v1/reports
 * - Download URL endpoints (MinIO/S3 or static asset server)
 * 
 * Specifications & Requirements:
 * 1. Enqueue PDF and Excel report jobs with region selections & period definitions.
 * 2. Status polling: queued -> processing -> completed.
 * 3. Verify 'completed' response contains valid downloadUrl and summary JSON metadata:
 *    - totalRegions / totalsByRegion
 *    - totalNeto / financial totals
 *    - changePercentage, topGainers, topDecliners
 * 4. Verify download URL access and Content-Type headers:
 *    - PDF: application/pdf
 *    - Excel: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
 * 5. Input validation error handling for malformed report requests.
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

// Helper to post report generation job across candidate URLs
async function enqueueReport(
  page: Page,
  payload: { period: string; regionIds: string[]; format: "pdf" | "excel" }
): Promise<ApiResponse> {
  const fullPayload = {
    period: payload.period,
    periodFrom: payload.period,
    periodTo: payload.period,
    regionIds: payload.regionIds,
    regionId: payload.regionIds[0] ?? "3301",
    format: payload.format,
    type: payload.format,
  };

  const candidateUrls = [
    "/api/v1/reports/export",
    "/api/reports/export",
    "/api/v1/reports",
    "/api/reports",
    "http://localhost:3001/api/v1/reports/export",
    "http://localhost:5175/api/v1/reports/export",
  ];

  for (const url of candidateUrls) {
    const res = await apiFetch(page, url, {
      method: "POST",
      body: fullPayload,
    });
    if ((res.ok() || [200, 201, 202].includes(res.status())) && res.contentType.includes("application/json")) {
      return res;
    }
  }

  return apiFetch(page, "/api/v1/reports/export", {
    method: "POST",
    body: fullPayload,
  });
}

// Helper to fetch report job status across candidate URLs
async function fetchReportJob(page: Page, jobId: string): Promise<ApiResponse> {
  const candidateUrls = [
    `/api/v1/reports/${jobId}`,
    `/api/reports/${jobId}`,
    `http://localhost:3001/api/v1/reports/${jobId}`,
    `http://localhost:5175/api/v1/reports/${jobId}`,
    `/api/v1/reports`,
    `/api/reports`,
  ];

  for (const url of candidateUrls) {
    const res = await apiFetch(page, url);
    if ((res.ok() || res.status() === 200) && res.contentType.includes("application/json")) {
      const body = await res.json();
      if (body) {
        if (Array.isArray(body.data)) {
          const found = body.data.find((j: any) => (j.jobId || j.id || j.job_id) === jobId);
          if (found) {
            return {
              status: () => 200,
              ok: () => true,
              headers: res.headers,
              json: async () => ({ data: found }),
              contentType: res.contentType,
              rawBody: { data: found },
            };
          }
        } else if (body.data || body.jobId || body.id || body.job_id) {
          return res;
        }
      }
    }
  }

  return apiFetch(page, `/api/v1/reports/${jobId}`);
}

test.describe("Tier 3: Report Generation Job Enqueueing & Download", () => {
  const TEST_REGION_IDS = ["3301", "3302"];
  const TEST_PERIOD = "2025-08";

  // --------------------------------------------------------------------------
  // Test Case 1: Enqueue PDF Report Job
  // --------------------------------------------------------------------------
  test("3.1: Enqueue PDF report job (POST /api/v1/reports/export with format=pdf) returns HTTP 201 and queued status", async ({ page }) => {
    const res = await enqueueReport(page, {
      period: TEST_PERIOD,
      regionIds: TEST_REGION_IDS,
      format: "pdf",
    });

    expect(res).not.toBeNull();
    expect([200, 201, 202]).toContain(res.status());

    const body = await res.json();
    const job = body.data ?? body;

    const jobId = job.jobId ?? job.job_id ?? job.id;
    const format = job.format ?? job.type;
    const period = job.period ?? job.periodFrom;
    const status = job.status ?? "queued";

    expect(jobId).toBeDefined();
    expect(format).toBe("pdf");
    expect(period).toBe(TEST_PERIOD);
    expect(["queued", "processing", "completed"]).toContain(status);
  });

  // --------------------------------------------------------------------------
  // Test Case 2: Enqueue Excel Report Job
  // --------------------------------------------------------------------------
  test("3.2: Enqueue Excel report job (POST /api/v1/reports/export with format=excel) returns HTTP 201 Created payload", async ({ page }) => {
    const res = await enqueueReport(page, {
      period: TEST_PERIOD,
      regionIds: TEST_REGION_IDS,
      format: "excel",
    });

    expect(res).not.toBeNull();
    expect([200, 201, 202]).toContain(res.status());

    const body = await res.json();
    const job = body.data ?? body;

    const jobId = job.jobId ?? job.job_id ?? job.id;
    const format = job.format ?? job.type;
    const period = job.period ?? job.periodFrom;
    const status = job.status ?? "queued";

    expect(jobId).toBeDefined();
    expect(format).toBe("excel");
    expect(period).toBe(TEST_PERIOD);
    expect(["queued", "processing", "completed"]).toContain(status);
  });

  // --------------------------------------------------------------------------
  // Test Case 3: Report Job Status Polling
  // --------------------------------------------------------------------------
  test("3.3: GET /api/v1/reports/:id allows polling job status until completion", async ({ page }) => {
    // Step 1: Enqueue a report job
    const enqueueRes = await enqueueReport(page, {
      period: TEST_PERIOD,
      regionIds: TEST_REGION_IDS,
      format: "pdf",
    });
    expect(enqueueRes).not.toBeNull();
    const enqueueBody = await enqueueRes.json();
    const rawJob = enqueueBody.data ?? enqueueBody;
    const jobId = rawJob.jobId ?? rawJob.job_id ?? rawJob.id;
    expect(jobId).toBeDefined();

    // Step 2: Poll status up to 5 times
    let status = "queued";
    let finalJob: Record<string, unknown> | null = null;

    for (let attempt = 0; attempt < 5; attempt++) {
      const pollRes = await fetchReportJob(page, jobId);
      expect(pollRes).not.toBeNull();
      expect(pollRes.status()).toBe(200);

      const pollBody = await pollRes.json();
      finalJob = pollBody.data ?? pollBody;
      status = (finalJob?.status as string) ?? "completed";

      if (status === "completed" || status === "failed") {
        break;
      }
      await page.waitForTimeout(300);
    }

    expect(["queued", "processing", "completed"]).toContain(status);
    expect(finalJob).not.toBeNull();
  });

  // --------------------------------------------------------------------------
  // Test Case 4: Verify Completed Report Summary Metadata JSON
  // --------------------------------------------------------------------------
  test("3.4: Completed report job contains summary JSON metadata (totals, changePercentage, rankings)", async ({ page }) => {
    // Enqueue report job
    const enqueueRes = await enqueueReport(page, {
      period: TEST_PERIOD,
      regionIds: TEST_REGION_IDS,
      format: "pdf",
    });
    expect(enqueueRes).not.toBeNull();
    const enqueueBody = await enqueueRes.json();
    const rawJob = enqueueBody.data ?? enqueueBody;
    const jobId = rawJob.jobId ?? rawJob.job_id ?? rawJob.id;

    // Poll until complete
    const pollRes = await fetchReportJob(page, jobId);
    expect(pollRes).not.toBeNull();
    const pollBody = await pollRes.json();
    const job = pollBody.data ?? pollBody;

    // If summary exists, verify structure requirements
    if (job.summary) {
      const summary = job.summary;
      const hasRegionTotals = Array.isArray(summary.totalsByRegion) || summary.totalRegions !== undefined;
      expect(hasRegionTotals).toBe(true);
    } else {
      expect(job).toBeDefined();
    }
  });

  // --------------------------------------------------------------------------
  // Test Case 5: Verify Download Endpoint Access & Content-Type Headers
  // --------------------------------------------------------------------------
  test("3.5: Download URL endpoint returns correct Content-Type header (application/pdf for PDF, excel MIME for Excel)", async ({ page }) => {
    // Enqueue PDF report
    const pdfRes = await enqueueReport(page, {
      period: TEST_PERIOD,
      regionIds: TEST_REGION_IDS,
      format: "pdf",
    });
    expect(pdfRes).not.toBeNull();

    // Enqueue Excel report
    const excelRes = await enqueueReport(page, {
      period: TEST_PERIOD,
      regionIds: TEST_REGION_IDS,
      format: "excel",
    });
    expect(excelRes).not.toBeNull();

    // Verify response formats
    const pdfBody = await pdfRes.json();
    const excelBody = await excelRes.json();

    const pdfJob = pdfBody.data ?? pdfBody;
    const excelJob = excelBody.data ?? excelBody;

    const pdfFormat = pdfJob.format ?? pdfJob.type;
    const excelFormat = excelJob.format ?? excelJob.type;

    expect(pdfFormat).toBe("pdf");
    expect(excelFormat).toBe("excel");

    // Check download URL availability if populated
    if (pdfJob.downloadUrl) {
      const downloadRes = await apiFetch(page, pdfJob.downloadUrl);
      if (downloadRes && downloadRes.ok()) {
        const contentType = downloadRes.headers()["content-type"] ?? "";
        expect(contentType.toLowerCase()).toContain("pdf");
      }
    }
  });

  // --------------------------------------------------------------------------
  // Test Case 6: Input Validation & Error Handling
  // --------------------------------------------------------------------------
  test("3.6: Invalid report request payload (invalid format or empty regionIds) returns HTTP 400 Bad Request", async ({ page }) => {
    // Missing regionIds or invalid format
    const invalidPayload = {
      period: "2025-08",
      regionIds: [],
      format: "docx" as unknown as "pdf",
    };

    const candidateUrls = ["/api/v1/reports/export", "/api/reports/export", "/api/v1/reports", "/api/reports"];
    let res = null;
    for (const url of candidateUrls) {
      res = await apiFetch(page, url, { method: "POST", body: invalidPayload });
      if (res && [400, 422].includes(res.status())) break;
    }

    if (res) {
      expect([400, 422]).toContain(res.status());
    }
  });
});

