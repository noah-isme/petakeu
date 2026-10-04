import { beforeEach, describe, expect, it, vi } from "vitest";

import { fiscalService } from "../services/fiscal-service";

import { fiscalController } from "./fiscal-controller";

const { ranking, surplus } = vi.hoisted(() => ({
  ranking: [
    { regionId: "7301", regionName: "Kab. Selayar", target: 1100, realization: 1000, percentage: 90.91, yoy: 1.5, rank: 1 },
    { regionId: "9171", regionName: "Kota Sorong", target: 550, realization: 500, percentage: 90.91, yoy: -2, rank: 2 },
  ],
  surplus: [
    { regionId: "7301", regionName: "Kab. Selayar", surplus: 10, deficit: 0, ytd: 100 },
    { regionId: "9171", regionName: "Kota Sorong", surplus: 0, deficit: 20, ytd: 50 },
  ],
}));

// Keep the real redact helpers; only the cached DB fetches are replaced.
vi.mock("../services/fiscal-service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/fiscal-service")>();
  return {
    ...actual,
    fiscalService: {
      ...actual.fiscalService,
      getRanking: vi.fn().mockResolvedValue(ranking),
      getSurplusDeficit: vi.fn().mockResolvedValue(surplus),
    },
  };
});
vi.mock("../db/postgres", () => ({ getPgPool: vi.fn() }));
vi.mock("../db/redis", () => ({ getCached: vi.fn(), invalidateCacheByPrefix: vi.fn() }));

type TestUser = { sub: string; role?: string };
type Handler = (req: never, res: never, next: never) => void;

async function call(handler: Handler, query: Record<string, string>, user?: TestUser) {
  const res = { json: vi.fn() };
  const next = vi.fn();
  handler({ query, user } as never, res as never, next as never);
  await new Promise(setImmediate);
  expect(next).not.toHaveBeenCalled();
  expect(res.json).toHaveBeenCalledTimes(1);
  return res.json.mock.calls[0][0] as { data: Array<Record<string, unknown>> };
}

const rankQuery = { jenis: "pendapatan", period: "2026-08", top: "5" };

describe("fiscalController.getRanking", () => {
  beforeEach(() => {
    vi.mocked(fiscalService.getRanking).mockClear();
  });

  it("parses jenis, period and top", async () => {
    await call(fiscalController.getRanking, rankQuery, { sub: "v", role: "viewer" });
    expect(fiscalService.getRanking).toHaveBeenCalledWith("pendapatan", "2026-08", 5);
  });

  it("redacts rupiah fields for the public role", async () => {
    const body = await call(fiscalController.getRanking, rankQuery, { sub: "p", role: "public" });
    expect(body.data).toHaveLength(2);
    body.data.forEach((item) => {
      expect(item).not.toHaveProperty("target");
      expect(item).not.toHaveProperty("realization");
      expect(item).toHaveProperty("rank");
      expect(item).toHaveProperty("percentage");
      expect(item).toHaveProperty("yoy");
    });
  });

  it("returns full items for a viewer", async () => {
    const body = await call(fiscalController.getRanking, rankQuery, { sub: "v", role: "viewer" });
    expect(body.data).toEqual(ranking);
  });

  it("fails closed when there is no user", async () => {
    const body = await call(fiscalController.getRanking, rankQuery);
    body.data.forEach((item) => expect(item).not.toHaveProperty("target"));
  });
});

describe("fiscalController.getSurplusDeficit", () => {
  beforeEach(() => {
    vi.mocked(fiscalService.getSurplusDeficit).mockClear();
  });

  it("parses periode", async () => {
    await call(fiscalController.getSurplusDeficit, { periode: "2026-08" }, { sub: "v", role: "viewer" });
    expect(fiscalService.getSurplusDeficit).toHaveBeenCalledWith("2026-08");
  });

  it("redacts rupiah fields for the public role", async () => {
    const body = await call(fiscalController.getSurplusDeficit, { periode: "2026-08" }, { sub: "p", role: "public" });
    expect(body.data).toEqual([
      { regionId: "7301", regionName: "Kab. Selayar" },
      { regionId: "9171", regionName: "Kota Sorong" },
    ]);
  });

  it("returns full items for a viewer", async () => {
    const body = await call(fiscalController.getSurplusDeficit, { periode: "2026-08" }, { sub: "v", role: "viewer" });
    expect(body.data).toEqual(surplus);
  });

  it("fails closed when there is no user", async () => {
    const body = await call(fiscalController.getSurplusDeficit, { periode: "2026-08" });
    body.data.forEach((item) => {
      expect(item).not.toHaveProperty("surplus");
      expect(item).not.toHaveProperty("deficit");
      expect(item).not.toHaveProperty("ytd");
    });
  });
});
