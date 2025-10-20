import type { Polygon } from "geojson";

import { ChoroplethFeature, ChoroplethResponse } from "../types/geo";
import { mockRegions } from "./region-service";

const sampleGeometry: Polygon = {
  type: "Polygon",
  coordinates: [
    [
      [110.0, -7.0],
      [111.0, -7.0],
      [111.0, -7.5],
      [110.0, -7.5],
      [110.0, -7.0]
    ]
  ]
};

export async function buildChoropleth(period: string): Promise<ChoroplethResponse> {
  const baseFeatures: ChoroplethFeature[] = mockRegions
    .filter((region) => region.level === "regency")
    .map((region, index) => {
      const totalAmount = 20_000_000 + index * 5_000_000;
      const cut15Amount = totalAmount * 0.15;

      return {
        type: "Feature",
        geometry: sampleGeometry,
        properties: {
          regionId: region.id,
          name: region.name,
          totalAmount,
          cut15Amount,
          trendSparkline: Array.from({ length: 6 }, (_, i) => 10_000_000 + i * 1_250_000),
          centroid: [110.5, -7.25],
          quantileIndex: 0
        }
      };
    });

  const sortedTotals = baseFeatures
    .map((feature) => feature.properties.totalAmount)
    .sort((a, b) => a - b);

  const quantile = (q: number) => {
    const position = (sortedTotals.length - 1) * q;
    const base = Math.floor(position);
    const rest = position - base;
    if (sortedTotals[base + 1] !== undefined) {
      return sortedTotals[base] + rest * (sortedTotals[base + 1] - sortedTotals[base]);
    }
    return sortedTotals[base] ?? 0;
  };

  const legendBreakpoints = [0.2, 0.4, 0.6, 0.8].map((q) => Math.round(quantile(q)));
  legendBreakpoints.push(Math.round(sortedTotals[sortedTotals.length - 1] ?? 0));

  const features: ChoroplethFeature[] = baseFeatures.map((feature) => {
    const total = feature.properties.totalAmount;
    let quantileIndex = 0;
    if (total <= legendBreakpoints[0]) quantileIndex = 0;
    else if (total <= legendBreakpoints[1]) quantileIndex = 1;
    else if (total <= legendBreakpoints[2]) quantileIndex = 2;
    else if (total <= legendBreakpoints[3]) quantileIndex = 3;
    else quantileIndex = 4;

    return {
      ...feature,
      properties: {
        ...feature.properties,
        quantileIndex
      }
    };
  });

  return {
    type: "FeatureCollection",
    features,
    metadata: {
      period,
      legend: legendBreakpoints,
      classification: "quantile"
    }
  };
}

export const geoService = {
  buildChoropleth
};
