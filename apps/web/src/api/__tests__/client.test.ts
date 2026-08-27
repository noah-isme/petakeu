import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ApiHttpError,
  ApiTimeoutError,
  DEFAULT_API_TIMEOUT_MS,
  apiClient,
  createApiHttpError,
  fetchWithTimeout
} from "../client";

describe("API error handling", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("keeps HTTP status, message, and server details for JSON errors", () => {
    const error = createApiHttpError(409, {
      error: "Staged row has changed; reload before editing",
      details: { rowId: "row-1", revision: 4 }
    });

    expect(error).toBeInstanceOf(ApiHttpError);
    expect(error.status).toBe(409);
    expect(error.message).toContain("Staged row has changed");
    expect(error.details).toEqual({ rowId: "row-1", revision: 4 });
  });

  it("parses API errors through the client instead of throwing a plain Error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "Upload is not ready", details: { status: "processing" } }), {
        status: 409,
        headers: { "Content-Type": "application/json" }
      })
    );

    await expect(apiClient.getUpload("upload-1")).rejects.toMatchObject({
      name: "ApiHttpError",
      status: 409,
      message: "Upload is not ready",
      details: { status: "processing" }
    });
  });

  it("keeps plain-text proxy failures useful", () => {
    const error = createApiHttpError(503, "Service unavailable");
    expect(error.status).toBe(503);
    expect(error.message).toBe("Service unavailable");
    expect(error.details).toBe("Service unavailable");
  });
});

describe("ApiTimeoutError", () => {
  it("initializes with default 408 status and custom timeoutMs", () => {
    const error = new ApiTimeoutError(15000);
    expect(error).toBeInstanceOf(ApiTimeoutError);
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("ApiTimeoutError");
    expect(error.status).toBe(408);
    expect(error.timeoutMs).toBe(15000);
    expect(error.message).toContain("15 detik");
  });

  it("accepts custom error message", () => {
    const error = new ApiTimeoutError(5000, "Custom timeout message");
    expect(error.status).toBe(408);
    expect(error.timeoutMs).toBe(5000);
    expect(error.message).toBe("Custom timeout message");
  });
});

describe("fetchWithTimeout & apiClient timeout/abort resilience", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("executes successful fetch requests and attaches auth token when present", async () => {
    localStorage.setItem("access_token", "jwt-test-token");

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: [{ id: "reg-1", name: "Aceh", code: "11", level: "province" }], meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 } }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    );

    const result = await apiClient.getRegions({ level: "province" });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Aceh");

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [, init] = fetchSpy.mock.calls[0];
    const headers = init?.headers as Headers;
    expect(headers.get("Authorization")).toBe("Bearer jwt-test-token");
  });

  it("throws ApiTimeoutError when request duration exceeds timeout", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((_input, init) => {
      return new Promise((_resolve, reject) => {
        const signal = init?.signal;
        signal?.addEventListener("abort", () => {
          reject(new DOMException("The operation was aborted", "AbortError"));
        });
      });
    });

    const timeoutMs = 50;
    const promise = fetchWithTimeout("http://localhost:3000/api/v1/test", { timeout: timeoutMs });

    await expect(promise).rejects.toBeInstanceOf(ApiTimeoutError);
    await expect(promise).rejects.toMatchObject({
      name: "ApiTimeoutError",
      status: 408,
      timeoutMs: 50
    });
  });

  it("apiClient methods respect custom timeout option", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((_input, init) => {
      return new Promise((_resolve, reject) => {
        const signal = init?.signal;
        signal?.addEventListener("abort", () => {
          reject(new DOMException("The operation was aborted", "AbortError"));
        });
      });
    });

    const promise = apiClient.getChoropleth("2025-01", { timeout: 30 });
    await expect(promise).rejects.toBeInstanceOf(ApiTimeoutError);
  });

  it("throws caller AbortError when caller signal aborts before request", async () => {
    const controller = new AbortController();
    controller.abort(new DOMException("User aborted request", "AbortError"));

    vi.spyOn(globalThis, "fetch").mockImplementation((_input, init) => {
      if (init?.signal?.aborted) {
        return Promise.reject(new DOMException("The operation was aborted", "AbortError"));
      }
      return Promise.resolve(new Response(JSON.stringify({ ok: true })));
    });

    const promise = fetchWithTimeout("http://localhost:3000/api/v1/test", {
      signal: controller.signal
    });

    await expect(promise).rejects.toThrow();
    await expect(promise).rejects.not.toBeInstanceOf(ApiTimeoutError);
  });

  it("throws caller AbortError when caller aborts in-flight request", async () => {
    const controller = new AbortController();

    vi.spyOn(globalThis, "fetch").mockImplementation((_input, init) => {
      return new Promise((_resolve, reject) => {
        const signal = init?.signal;
        signal?.addEventListener("abort", () => {
          reject(new DOMException("The operation was aborted", "AbortError"));
        });
      });
    });

    const promise = fetchWithTimeout("http://localhost:3000/api/v1/test", {
      timeout: 10000,
      signal: controller.signal
    });

    setTimeout(() => {
      controller.abort();
    }, 20);

    await expect(promise).rejects.toMatchObject({
      name: "AbortError"
    });
    await expect(promise).rejects.not.toBeInstanceOf(ApiTimeoutError);
  });

  it("supports downloadUploadTemplate with custom options and returns blob", async () => {
    const sampleContent = "sample template content";
    const sampleBlob = new Blob([sampleContent], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });

    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(sampleContent, {
        status: 200,
        headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }
      })
    );

    const result = await apiClient.downloadUploadTemplate({ timeout: 5000 });
    expect(result).toBeInstanceOf(Blob);
    expect(result.size).toBe(sampleBlob.size);
  });

  it("supports JSON post endpoints like createReport and createRegionAlias with options", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: { aliasId: "alias-1", alias: "Aceh Barat", regionId: "reg-1" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    );

    const result = await apiClient.createRegionAlias(
      { alias: "Aceh Barat", regionId: "reg-1" },
      { timeout: 5000 }
    );
    expect(result.alias).toBe("Aceh Barat");
  });

  it("verifies DEFAULT_API_TIMEOUT_MS constant is 30,000", () => {
    expect(DEFAULT_API_TIMEOUT_MS).toBe(30_000);
  });
});
