import { describe, expect, it, vi } from "vitest";

import {
  redactRankingForPublic,
  redactSurplusDeficitForPublic,
  type RankingItem,
  type SurplusDeficitItem,
} from "./fiscal-service";

// The helpers are pure; stub the DB modules so importing the service never connects.
vi.mock("../db/postgres", () => ({ getPgPool: vi.fn() }));
vi.mock("../db/redis", () => ({ getCached: vi.fn(), invalidateCacheByPrefix: vi.fn() }));

const ranking: RankingItem[] = [
  { regionId: "7301", regionName: "Kab. Selayar", target: 1100, realization: 1000, percentage: 90.91, yoy: 1.5, rank: 1 },
  { regionId: "9171", regionName: "Kota Sorong", target: 550, realization: 500, percentage: 90.91, yoy: -2, rank: 2 },
];

const surplus: SurplusDeficitItem[] = [
  { regionId: "7301", regionName: "Kab. Selayar", surplus: 10, deficit: 0, ytd: 100 },
  { regionId: "9171", regionName: "Kota Sorong", surplus: 0, deficit: 20, ytd: 50 },
];

describe("redactRankingForPublic", () => {
  it("strips exactly target and realization and keeps order", () => {
    const result = redactRankingForPublic(ranking);
    expect(result).toEqual([
      { regionId: "7301", regionName: "Kab. Selayar", percentage: 90.91, yoy: 1.5, rank: 1 },
      { regionId: "9171", regionName: "Kota Sorong", percentage: 90.91, yoy: -2, rank: 2 },
    ]);
    result.forEach((item) => {
      expect(item).not.toHaveProperty("target");
      expect(item).not.toHaveProperty("realization");
    });
  });

  it("does not mutate the input", () => {
    redactRankingForPublic(ranking);
    expect(ranking[0]).toHaveProperty("target", 1100);
  });

  it("maps an empty list to an empty list", () => {
    expect(redactRankingForPublic([])).toEqual([]);
  });
});

describe("redactSurplusDeficitForPublic", () => {
  it("strips exactly surplus, deficit and ytd and keeps order", () => {
    expect(redactSurplusDeficitForPublic(surplus)).toEqual([
      { regionId: "7301", regionName: "Kab. Selayar" },
      { regionId: "9171", regionName: "Kota Sorong" },
    ]);
  });

  it("maps an empty list to an empty list", () => {
    expect(redactSurplusDeficitForPublic([])).toEqual([]);
  });
});
