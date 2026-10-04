import { beforeEach, describe, expect, it, vi } from "vitest";

import { buildChoropleth } from "./geo-service";

const { query, cacheCalls } = vi.hoisted(() => ({
  query: vi.fn(),
  cacheCalls: [] as Array<{ key: string; options: { keyPrefix?: string; ttl?: number } | undefined }>,
}));

vi.mock("../db/postgres", () => ({
  getPgPool: () => ({ query }),
}));

vi.mock("../db/redis", () => ({
  getCached: vi.fn(
    (key: string, fetchFn: () => Promise<unknown>, options?: { keyPrefix?: string; ttl?: number }) => {
      cacheCalls.push({ key, options });
      return fetchFn();
    }
  ),
  invalidateCacheByPrefix: vi.fn().mockResolvedValue(undefined),
}));

const mockRows = [
  {
    regionId: "3171",
    name: "Jakarta Selatan",
    geometry: { type: "Polygon", coordinates: [] },
    centroid_geom: { type: "Point", coordinates: [106.8, -6.2] },
    amount: "5000000",
    cut_amount: "750000",
    net_amount: "4250000",
    class_index: 0,
  },
  {
    regionId: "3172",
    name: "Jakarta Timur",
    geometry: { type: "Polygon", coordinates: [] },
    centroid_geom: { type: "Point", coordinates: [106.9, -6.2] },
    amount: "10000000",
    cut_amount: "1500000",
    net_amount: "8500000",
    class_index: 1,
  },
];

beforeEach(() => {
  query.mockReset();
  cacheCalls.length = 0;
});

describe("buildChoropleth", () => {
  beforeEach(() => {
    query.mockResolvedValue({ rows: mockRows });
  });

  it("returns quantile legend with ranges and preserves values in private mode", async () => {
    const result = await buildChoropleth("2026-08");

    expect(result.metadata.legend.method).toBe("quantile");
    expect(result.metadata.legend.bins.length).toBeGreaterThan(0);
    expect(result.metadata.legend.bins.length).toBe(result.metadata.legend.ranges.length);
    expect(result.metadata.legend.ranges.length).toBe(result.metadata.legend.labels.length);
    result.metadata.legend.ranges.forEach((range) => {
      expect(range.min).toBeTypeOf("number");
      expect(range.max).toBeTypeOf("number");
      expect(range.label).toBeTypeOf("string");
    });
    result.features.forEach((feature) => {
      expect(feature.properties.value).toBeTypeOf("number");
      expect(feature.properties.classIndex).toBeGreaterThanOrEqual(0);
    });
    expect(result.metadata.public).toBe(false);
    expect(cacheCalls).toHaveLength(1);
    expect(cacheCalls[0].key).toBe("choropleth:2026-08");
    expect(cacheCalls[0].options?.keyPrefix).toBe("petakeu:geo");
  });

  it("omits raw values when public mode is enabled", async () => {
    const result = await buildChoropleth("2026-08", { publicMode: true });

    result.features.forEach((feature) => {
      expect(feature.properties.value).toBeUndefined();
      expect(feature.properties.normalizedValue).toBeUndefined();
      expect(feature.properties.sparkline).toBeUndefined();
    });
    expect(result.metadata.public).toBe(true);
    expect(result.metadata.legend.bins).toEqual([]);
    expect(result.metadata.legend.ranges.length).toBeGreaterThan(0);
    result.metadata.legend.ranges.forEach((range) => {
      expect(range).not.toHaveProperty("min");
      expect(range).not.toHaveProperty("max");
      expect(range.label).toBeTypeOf("string");
    });
    expect(JSON.stringify(result.metadata.legend)).not.toMatch(/\d{4,}/);
    expect(cacheCalls).toHaveLength(1);
    expect(cacheCalls[0].key).toBe("choropleth:2026-08:public");
    expect(cacheCalls[0].options?.keyPrefix).toBe("petakeu:geo");
  });

  it("passes options level and parent to buildChoropleth", async () => {
    const result = await buildChoropleth("2026-08", { level: 2, parent: "3100" });
    expect(result.features).toHaveLength(2);
  });
});

