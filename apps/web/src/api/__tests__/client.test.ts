import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiHttpError, apiClient, createApiHttpError } from "../client";

describe("API error handling", () => {
  afterEach(() => {
    vi.restoreAllMocks();
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
