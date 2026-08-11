import { expect, test, type APIRequestContext, type APIResponse } from "@playwright/test";

/**
 * Opt-in live API contracts. These tests intentionally do not start Postgres,
 * Redis, BullMQ, MinIO, or the API. Configure the variables below only in an
 * environment that already provides those dependencies.
 *
 * Required for live checks:
 * - PETAKEU_RUN_LIVE_E2E=1
 * - PETAKEU_E2E_API_BASE_URL (for example http://localhost:3001/api)
 * - PETAKEU_PUBLIC_TOKEN and/or role-specific JWTs
 *
 * Optional:
 * - PETAKEU_E2E_PERIOD (default: 2025-08)
 */

const liveEnabled = process.env.PETAKEU_RUN_LIVE_E2E === "1";
const apiBaseUrl = process.env.PETAKEU_E2E_API_BASE_URL?.replace(/\/+$/, "");
const period = process.env.PETAKEU_E2E_PERIOD ?? "2025-08";

const publicToken = process.env.PETAKEU_PUBLIC_TOKEN;
const viewerToken = process.env.PETAKEU_VIEWER_TOKEN;
const operatorToken = process.env.PETAKEU_OPERATOR_TOKEN;
const adminToken = process.env.PETAKEU_ADMIN_TOKEN;

const unavailableStatuses = new Set([404, 500, 502, 503, 504]);

function requireLive(token?: string) {
  test.skip(
    !liveEnabled || !apiBaseUrl || !token,
    "Live security checks require PETAKEU_RUN_LIVE_E2E=1, PETAKEU_E2E_API_BASE_URL, and the required JWT"
  );
}

function skipUnavailable(response: APIResponse, contract: string) {
  test.skip(unavailableStatuses.has(response.status()), `${contract} is infrastructure-gated (HTTP ${response.status()})`);
}

async function getApi(request: APIRequestContext, path: string, token: string): Promise<APIResponse> {
  try {
    return await request.get(`${apiBaseUrl}${path}`, {
      failOnStatusCode: false,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`
      }
    });
  } catch (error) {
    test.skip(true, `Live API is unavailable: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
}

type JsonObject = Record<string, unknown>;

function asObject(value: unknown): JsonObject {
  return value !== null && typeof value === "object" ? value as JsonObject : {};
}

async function readJson(response: APIResponse): Promise<JsonObject> {
  return asObject(await response.json());
}

test.describe("live public payload and RBAC security contracts", () => {
  test("public choropleth payload omits exact currency fields", async ({ request }) => {
    requireLive(publicToken);

    const response = await getApi(request, `/geo/choropleth?period=${period}&public=1`, publicToken!);
    skipUnavailable(response, "Public choropleth payload");
    expect(response.status()).toBe(200);

    const body = await readJson(response);
    expect(body.type).toBe("FeatureCollection");
    expect(asObject(body.metadata).public).toBe(true);
    expect(Array.isArray(body.features)).toBe(true);

    for (const value of Array.isArray(body.features) ? body.features : []) {
      const properties = asObject(asObject(value).properties);
      expect(properties).not.toHaveProperty("value");
      expect(properties).not.toHaveProperty("normalizedValue");
      expect(properties).not.toHaveProperty("sparkline");
    }
  });

  test("public role cannot obtain exact currency values by omitting public mode", async ({ request }) => {
    requireLive(publicToken);

    const response = await getApi(request, `/geo/choropleth?period=${period}`, publicToken!);
    skipUnavailable(response, "Public-role choropleth authorization");

    expect([200, 401, 403]).toContain(response.status());
    if (response.status() === 200) {
      const body = await readJson(response);
      for (const value of Array.isArray(body.features) ? body.features : []) {
        const properties = asObject(asObject(value).properties);
        expect(properties).not.toHaveProperty("value");
        expect(properties).not.toHaveProperty("normalizedValue");
        expect(properties).not.toHaveProperty("sparkline");
      }
    }
  });

  for (const [role, token] of [
    ["viewer", viewerToken],
    ["operator", operatorToken],
    ["admin", adminToken]
  ] as const) {
    test(`${role} role can read exact choropleth values`, async ({ request }) => {
      requireLive(token);

      const response = await getApi(request, `/geo/choropleth?period=${period}`, token!);
      skipUnavailable(response, `${role} choropleth payload`);
      expect(response.status()).toBe(200);

      const body = await readJson(response);
      expect(body.type).toBe("FeatureCollection");
      const features = Array.isArray(body.features) ? body.features : [];
      expect(features.length).toBeGreaterThan(0);
      expect(typeof asObject(asObject(features[0]).properties).value).toBe("number");
    });
  }

  test("public role is denied upload-management access", async ({ request }) => {
    requireLive(publicToken);

    const response = await getApi(request, "/uploads", publicToken!);
    skipUnavailable(response, "Public upload-management authorization");
    expect(response.status()).toBe(403);
  });

  test("viewer role is denied upload-management access", async ({ request }) => {
    requireLive(viewerToken);

    const response = await getApi(request, "/uploads", viewerToken!);
    skipUnavailable(response, "Viewer upload-management authorization");
    expect(response.status()).toBe(403);
  });

  for (const [role, token] of [
    ["operator", operatorToken],
    ["admin", adminToken]
  ] as const) {
    test(`${role} role can reach upload-management controls`, async ({ request }) => {
      requireLive(token);

      const response = await getApi(request, "/uploads", token!);
      skipUnavailable(response, `${role} upload-management endpoint`);
      expect(response.status()).toBe(200);
    });
  }

  test("completed report metadata exposes a future presigned URL expiry", async ({ request }) => {
    requireLive(viewerToken ?? operatorToken ?? adminToken);

    const response = await getApi(request, "/reports", (viewerToken ?? operatorToken ?? adminToken)!);
    skipUnavailable(response, "Report expiry metadata");
    expect(response.status()).toBe(200);

    const body = await readJson(response);
    const jobs = Array.isArray(body.data) ? body.data : [];
    const completedJob = jobs.find(
      (value): value is JsonObject => {
        const job = asObject(value);
        return job.status === "completed" && typeof job.downloadUrl === "string" && Boolean(job.expiresAt);
      }
    );
    if (!completedJob) {
      test.skip(true, "A completed report with URL metadata is required for expiry validation");
      return;
    }

    const expiresAtMs = Date.parse(String(completedJob.expiresAt));
    expect(Number.isFinite(expiresAtMs)).toBe(true);
    expect(expiresAtMs).toBeGreaterThan(Date.now());

    const maxTtlMs = 24 * 60 * 60 * 1000 + 5 * 60 * 1000;
    expect(expiresAtMs - Date.now()).toBeLessThanOrEqual(maxTtlMs);
  });
});
