import { mockRegions } from "./region-service";

import type {
  ChoroplethFeature,
  ChoroplethResponse,
  LegendDefinition,
  LegendRange,
  QuantileBin,
} from "../types/geo";
import type { Polygon } from "geojson";

const sampleGeometry: Polygon = {
  type: "Polygon",
  coordinates: [
    [
      [110.0, -7.0],
      [111.0, -7.0],
      [111.0, -7.5],
      [110.0, -7.5],
      [110.0, -7.0],
    ],
  ],
};

interface BuildOptions {
  publicMode?: boolean;
}

function buildQuantileBins(sortedTotals: number[]): QuantileBin[] {
  if (!sortedTotals.length) {
    return [];
  }

  const quantile = (q: number) => {
    const position = (sortedTotals.length - 1) * q;
    const base = Math.floor(position);
    const rest = position - base;
    if (sortedTotals[base + 1] !== undefined) {
      return sortedTotals[base] + rest * (sortedTotals[base + 1] - sortedTotals[base]);
    }
    return sortedTotals[base] ?? 0;
  };

  const quantileValues = [0.2, 0.4, 0.6, 0.8].map((q) => quantile(q));
  const maxValue = sortedTotals[sortedTotals.length - 1] ?? 0;

  const boundaries = [...quantileValues, maxValue];

  return boundaries.map((value, index) => {
    const min = index === 0 ? sortedTotals[0] ?? 0 : boundaries[index - 1];
    const max = value;
    return {
      index,
      min,
      max,
      label: `Kelas ${index + 1}`,
    } satisfies QuantileBin;
  });
}

function resolveQuantileIndex(value: number, bins: QuantileBin[]): number {
  if (!bins.length) {
    return 0;
  }
  for (let index = 0; index < bins.length; index += 1) {
    const bin = bins[index];
    if (value <= bin.max) {
      return bin.index;
    }
  }
  return bins[bins.length - 1]?.index ?? 0;
}

export async function buildChoropleth(
  period: string,
  options: BuildOptions = {},
): Promise<ChoroplethResponse> {
  const baseFeatures: ChoroplethFeature[] = mockRegions
    .filter((region) => region.level === "regency")
    .map((region, index) => {
      const totalAmount = 20_000_000 + index * 5_000_000;
      const cut15Amount = Math.round(totalAmount * 0.15);

      return {
        type: "Feature",
        id: region.id,
        geometry: sampleGeometry,
        properties: {
          regionId: region.id,
          name: region.name,
          value: totalAmount,
          normalizedValue: cut15Amount,
          sparkline: Array.from({ length: 6 }, (_, i) => 10_000_000 + i * 1_250_000),
          centroid: [110.5, -7.25],
          classIndex: 0,
          classLabel: "",
        },
      } satisfies ChoroplethFeature;
    });

  const sortedTotals = baseFeatures
    .map((feature) => feature.properties.value)
    .filter((value): value is number => typeof value === "number")
    .sort((a, b) => a - b);

  const bins = buildQuantileBins(sortedTotals);

  const features: ChoroplethFeature[] = baseFeatures.map((feature) => {
    const total = feature.properties.value ?? 0;
    const classIndex = resolveQuantileIndex(total, bins);
    const classLabel = bins[classIndex]?.label ?? `Kelas ${classIndex + 1}`;

    if (options.publicMode) {
      return {
        ...feature,
        properties: {
          regionId: feature.properties.regionId,
          name: feature.properties.name,
          centroid: feature.properties.centroid,
          classIndex,
          classLabel,
        },
      } satisfies ChoroplethFeature;
    }

    return {
      ...feature,
      properties: {
        ...feature.properties,
        classIndex,
        classLabel,
      },
    } satisfies ChoroplethFeature;
  });

  const ranges: LegendRange[] = bins.map((bin) => ({
    min: bin.min,
    max: bin.max,
    label: bin.label,
  } satisfies LegendRange));

  const legend: LegendDefinition = {
    method: "quantile",
    bins: bins.map((bin) => bin.max),
    labels: bins.map((bin) => bin.label),
    ranges,
  };

  return {
    type: "FeatureCollection",
    features,
    metadata: {
      period,
      legend,
      public: Boolean(options.publicMode),
    },
  } satisfies ChoroplethResponse;
}

export const geoService = {
  buildChoropleth,
};
