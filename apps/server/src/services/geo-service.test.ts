import { describe, expect, it } from "vitest";

import { buildChoropleth } from "./geo-service";

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
});
