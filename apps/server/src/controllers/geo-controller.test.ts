import { beforeEach, describe, expect, it, vi } from "vitest";

import { geoService } from "../services/geo-service";

import { geoController } from "./geo-controller";

vi.mock("../services/geo-service", () => ({
  geoService: {
    buildChoropleth: vi.fn().mockResolvedValue({ type: "FeatureCollection", features: [], metadata: {} }),
  },
}));

type TestUser = { sub: string; role?: string };

async function callChoropleth(query: Record<string, string>, user?: TestUser) {
  const req = { query, user } as never;
  const res = { json: vi.fn() };
  const next = vi.fn();
  geoController.getChoropleth(req, res as never, next);
  await new Promise(setImmediate);
  expect(next).not.toHaveBeenCalled();
  return res;
}

function lastPublicMode(): boolean | undefined {
  const calls = vi.mocked(geoService.buildChoropleth).mock.calls;
  return calls[calls.length - 1]?.[1]?.publicMode;
}

describe("geoController.getChoropleth redaction", () => {
  beforeEach(() => {
    vi.mocked(geoService.buildChoropleth).mockClear();
  });

  it("forces public mode for the public role without a query flag", async () => {
    await callChoropleth({ period: "2026-08" }, { sub: "p", role: "public" });
    expect(geoService.buildChoropleth).toHaveBeenCalledWith("2026-08", expect.objectContaining({ publicMode: true }));
  });

  it("keeps private mode for a viewer without a query flag", async () => {
    await callChoropleth({ period: "2026-08" }, { sub: "v", role: "viewer" });
    expect(lastPublicMode()).toBe(false);
  });

  it("honours ?public=1 for a viewer", async () => {
    await callChoropleth({ period: "2026-08", public: "1" }, { sub: "v", role: "viewer" });
    expect(lastPublicMode()).toBe(true);
  });

  it("fails closed when there is no user", async () => {
    await callChoropleth({ period: "2026-08" });
    expect(lastPublicMode()).toBe(true);
  });

  it("fails closed for an unknown role", async () => {
    await callChoropleth({ period: "2026-08" }, { sub: "x", role: "owner" });
    expect(lastPublicMode()).toBe(true);
  });
});

