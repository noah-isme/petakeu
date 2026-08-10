import { describe, expect, it, vi } from "vitest";

import { buildChoropleth } from "./geo-service";

vi.mock('../db/postgres', () => {
  const mockRows = [
    {
      regionId: '3171',
      name: 'Jakarta Selatan',
      geometry: { type: 'Polygon', coordinates: [] },
      centroid_geom: { type: 'Point', coordinates: [106.8, -6.2] },
      amount: '5000000',
      cut_amount: '750000',
      net_amount: '4250000',
      class_index: 0,
    },
    {
      regionId: '3172',
      name: 'Jakarta Timur',
      geometry: { type: 'Polygon', coordinates: [] },
      centroid_geom: { type: 'Point', coordinates: [106.9, -6.2] },
      amount: '10000000',
      cut_amount: '1500000',
      net_amount: '8500000',
      class_index: 1,
    },
  ];
  return {
    getPgPool: () => ({
      query: vi.fn().mockResolvedValue({ rows: mockRows }),
    }),
  };
});

vi.mock('../db/redis', () => ({
  getCached: vi.fn().mockImplementation((key, fetchFn) => fetchFn()),
  invalidateCacheByPrefix: vi.fn().mockResolvedValue(undefined),
}));

describe("buildChoropleth", () => {
  it("returns quantile legend with ranges and preserves values in private mode", async () => {
    const result = await buildChoropleth("2025-08");

    expect(result.metadata.legend.method).toBe("quantile");
    expect(result.metadata.legend.bins.length).toBeGreaterThan(0);
    expect(result.metadata.legend.ranges.length).toBe(result.metadata.legend.labels.length);
    result.features.forEach((feature) => {
      expect(feature.properties.value).toBeTypeOf("number");
      expect(feature.properties.classIndex).toBeGreaterThanOrEqual(0);
    });
  });

  it("omits raw values when public mode is enabled", async () => {
    const result = await buildChoropleth("2025-08", { publicMode: true });

    result.features.forEach((feature) => {
      expect(feature.properties.value).toBeUndefined();
      expect(feature.properties.normalizedValue).toBeUndefined();
      expect(feature.properties.sparkline).toBeUndefined();
    });
    expect(result.metadata.public).toBe(true);
  });

  it("passes options level and parent to buildChoropleth", async () => {
    const result = await buildChoropleth("2025-08", { level: 2, parent: "3100" });
    expect(result.features).toHaveLength(2);
  });
});
