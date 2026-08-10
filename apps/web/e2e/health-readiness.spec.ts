import { test, expect } from "@playwright/test";

/**
 * E2E Test Suite for Requirement R2: Comprehensive Readiness Health Checks (GET /healthz)
 * 
 * Architecture & Methodology:
 * - Opaque-box testing of the GET /healthz endpoint.
 * - Test Tiers 1-4: Feature Coverage, Boundary & Failure Modes, Cross-Feature Combinations, Real-World Application Scenarios.
 */

// Helper to query /healthz endpoint from available base URLs (web proxy or server direct)
async function fetchHealthz(request: Parameters<Parameters<typeof test>[1]>[0]['request']) {
  let res = await request.get("/healthz").catch(() => null);
  if (!res || res.status() === 404) {
    res = await request.get("http://localhost:3001/healthz").catch(() => null);
  }
  if (!res || res.status() === 404) {
    res = await request.get("/api/healthz").catch(() => null);
  }
  return res;
}

test.describe("Requirement R2: GET /healthz Readiness Health Checks", () => {
  
  // ==========================================
  // TIER 1: FEATURE COVERAGE
  // ==========================================

  test("Tier 1.1: GET /healthz basic liveness returns HTTP 200 or 503 status", async ({ request }) => {
    const res = await fetchHealthz(request);
    expect(res).not.toBeNull();
    const status = res!.status();
    expect([200, 503]).toContain(status);
  });

  test("Tier 1.2: GET /healthz JSON payload contains top-level properties: status, timestamp, uptime, checks", async ({ request }) => {
    const res = await fetchHealthz(request);
    expect(res).not.toBeNull();
    
    const body = await res!.json();
    expect(body).toHaveProperty("status");
    expect(["healthy", "degraded", "unhealthy"]).toContain(body.status);
    
    expect(body).toHaveProperty("timestamp");
    expect(typeof body.timestamp).toBe("string");
    expect(Number.isNaN(Date.parse(body.timestamp))).toBe(false);

    expect(body).toHaveProperty("uptime");
    expect(typeof body.uptime).toBe("number");
    expect(body.uptime).toBeGreaterThanOrEqual(0);

    expect(body).toHaveProperty("checks");
    expect(typeof body.checks).toBe("object");
    expect(body.checks).not.toBeNull();
  });

  test("Tier 1.3: GET /healthz checks object contains database, redis, storage, and queue sub-objects", async ({ request }) => {
    const res = await fetchHealthz(request);
    expect(res).not.toBeNull();

    const body = await res!.json();
    const checks = body.checks;
    expect(checks).toHaveProperty("database");
    expect(checks).toHaveProperty("redis");
    expect(checks).toHaveProperty("storage");
    expect(checks).toHaveProperty("queue");

    for (const component of ["database", "redis", "storage", "queue"]) {
      expect(checks[component]).toHaveProperty("status");
      expect(["healthy", "degraded", "unhealthy"]).toContain(checks[component].status);
    }
  });

  test("Tier 1.4: Database check includes status, latencyMs, and details (postgisVersion / query)", async ({ request }) => {
    const res = await fetchHealthz(request);
    expect(res).not.toBeNull();

    const body = await res!.json();
    const dbCheck = body.checks.database;
    expect(dbCheck).toBeDefined();
    expect(dbCheck.status).toBeDefined();
    expect(typeof dbCheck.latencyMs).toBe("number");
    expect(dbCheck.latencyMs).toBeGreaterThanOrEqual(0);

    if (dbCheck.status === "healthy") {
      expect(dbCheck.details).toBeDefined();
      expect(typeof dbCheck.details).toBe("object");
      const hasVersionOrQuery = Boolean(
        dbCheck.details.postgisVersion !== undefined ||
        dbCheck.details.postgis_version !== undefined ||
        dbCheck.details.query !== undefined
      );
      expect(hasVersionOrQuery).toBe(true);
    }
  });

  test("Tier 1.5: Redis check includes status, latencyMs, and details.command", async ({ request }) => {
    const res = await fetchHealthz(request);
    expect(res).not.toBeNull();

    const body = await res!.json();
    const redisCheck = body.checks.redis;
    expect(redisCheck).toBeDefined();
    expect(redisCheck.status).toBeDefined();
    expect(typeof redisCheck.latencyMs).toBe("number");
    expect(redisCheck.latencyMs).toBeGreaterThanOrEqual(0);

    if (redisCheck.status === "healthy") {
      expect(redisCheck.details).toBeDefined();
      expect(typeof redisCheck.details).toBe("object");
      expect(redisCheck.details.command).toBeDefined();
    }
  });

  test("Tier 1.6: Storage check includes status, latencyMs, and details (provider / buckets)", async ({ request }) => {
    const res = await fetchHealthz(request);
    expect(res).not.toBeNull();

    const body = await res!.json();
    const storageCheck = body.checks.storage;
    expect(storageCheck).toBeDefined();
    expect(["healthy", "degraded", "unhealthy"]).toContain(storageCheck.status);
    expect(typeof storageCheck.latencyMs).toBe("number");
    expect(storageCheck.latencyMs).toBeGreaterThanOrEqual(0);

    if (storageCheck.status !== "unhealthy") {
      expect(storageCheck.details).toBeDefined();
      expect(typeof storageCheck.details).toBe("object");
      const hasProviderOrBuckets = Boolean(
        storageCheck.details.provider !== undefined ||
        storageCheck.details.buckets !== undefined
      );
      expect(hasProviderOrBuckets).toBe(true);
    }
  });

  test("Tier 1.7: Queue check includes uploadQueue & reportQueue job counters (active, waiting, completed, failed)", async ({ request }) => {
    const res = await fetchHealthz(request);
    expect(res).not.toBeNull();

    const body = await res!.json();
    const queueCheck = body.checks.queue;
    expect(queueCheck).toBeDefined();
    expect(["healthy", "degraded", "unhealthy"]).toContain(queueCheck.status);
    expect(typeof queueCheck.latencyMs).toBe("number");
    expect(queueCheck.latencyMs).toBeGreaterThanOrEqual(0);

    if (queueCheck.status !== "unhealthy" && queueCheck.details) {
      const details = queueCheck.details;
      expect(details).toHaveProperty("uploadQueue");
      expect(details).toHaveProperty("reportQueue");

      for (const qKey of ["uploadQueue", "reportQueue"]) {
        const qStats = details[qKey] as Record<string, unknown>;
        expect(qStats).toBeDefined();
        expect(typeof qStats.active).toBe("number");
        expect(typeof qStats.waiting).toBe("number");
        expect(typeof qStats.completed).toBe("number");
        expect(typeof qStats.failed).toBe("number");
      }
    }
  });

  // ==========================================
  // TIER 2: BOUNDARY & FAILURE MODES
  // ==========================================

  test("Tier 2.1: HTTP 503 status when critical dependency (DB/Redis) is unhealthy", async ({ request }) => {
    const res = await fetchHealthz(request);
    expect(res).not.toBeNull();

    const status = res!.status();
    const body = await res!.json();

    const dbUnhealthy = body.checks?.database?.status === "unhealthy";
    const redisUnhealthy = body.checks?.redis?.status === "unhealthy";

    if (dbUnhealthy || redisUnhealthy) {
      expect(status).toBe(503);
      expect(body.status).toBe("unhealthy");
    } else {
      // If dependencies are healthy, status should be 200
      expect(status).toBe(200);
      expect(["healthy", "degraded"]).toContain(body.status);
    }
  });

  test("Tier 2.2: HTTP 200 status and status 'degraded' when secondary dependency (storage/queue) is degraded", async ({ request }) => {
    const res = await fetchHealthz(request);
    expect(res).not.toBeNull();

    const body = await res!.json();
    const dbHealthy = body.checks?.database?.status === "healthy";
    const redisHealthy = body.checks?.redis?.status === "healthy";
    const storageDegraded = body.checks?.storage?.status === "degraded";
    const queueDegraded = body.checks?.queue?.status === "degraded";

    if (dbHealthy && redisHealthy && (storageDegraded || queueDegraded)) {
      expect(res!.status()).toBe(200);
      expect(body.status).toBe("degraded");
    }
  });

  test("Tier 2.3: Latency metrics validity and error field formatting", async ({ request }) => {
    const res = await fetchHealthz(request);
    expect(res).not.toBeNull();

    const body = await res!.json();
    for (const [compName, compCheck] of Object.entries(body.checks as Record<string, any>)) {
      expect(typeof compCheck.latencyMs).toBe("number");
      expect(compCheck.latencyMs).toBeGreaterThanOrEqual(0);

      if (compCheck.status === "unhealthy" || compCheck.status === "degraded") {
        if (compCheck.error !== undefined) {
          expect(typeof compCheck.error).toBe("string");
          expect(compCheck.error.length).toBeGreaterThan(0);
        }
      }
    }
  });

  test("Tier 2.4: Non-existent health paths return 404 cleanly without crashing service", async ({ request }) => {
    const paths = ["/healthz/non-existent", "/healthz-invalid-route-123", "/health/unknown"];
    for (const path of paths) {
      const res = await request.get(path).catch(() => null);
      if (res) {
        expect(res.status()).toBe(404);
      }
    }
  });

  // ==========================================
  // TIER 3: CROSS-FEATURE COMBINATIONS
  // ==========================================

  test("Tier 3.1: Health check probing concurrently with active processing activity", async ({ request }) => {
    // Send 10 parallel GET requests to healthz
    const probes = Array.from({ length: 10 }).map(() => fetchHealthz(request));
    const results = await Promise.all(probes);

    for (const res of results) {
      expect(res).not.toBeNull();
      expect([200, 503]).toContain(res!.status());
      const body = await res!.json();
      expect(body).toHaveProperty("status");
      expect(body).toHaveProperty("checks");
    }
  });

  // ==========================================
  // TIER 4: REAL-WORLD APPLICATION SCENARIOS
  // ==========================================

  test("Tier 4.1: Continuous readiness monitoring scenario iterating over multiple probes", async ({ request }) => {
    const iterations = 5;
    let lastUptime = -1;

    for (let i = 0; i < iterations; i++) {
      const res = await fetchHealthz(request);
      expect(res).not.toBeNull();
      expect([200, 503]).toContain(res!.status());

      const body = await res!.json();
      expect(body).toHaveProperty("status");
      expect(body).toHaveProperty("timestamp");
      expect(body).toHaveProperty("uptime");

      expect(body.uptime).toBeGreaterThanOrEqual(lastUptime);
      lastUptime = body.uptime;

      // Small delay between probes
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  });
});
