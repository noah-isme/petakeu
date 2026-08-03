import { getPgPool } from '../db/postgres';

import type {
  ChoroplethFeature,
  ChoroplethResponse,
  LegendDefinition,
  LegendRange,
  QuantileBin,
} from '../types/geo';

function buildQuantileBins(sortedTotals: number[]): QuantileBin[] {
  if (!sortedTotals.length) return [];

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

  return boundaries.map((value, index) => ({
    index,
    min: index === 0 ? sortedTotals[0] ?? 0 : boundaries[index - 1],
    max: value,
    label: `Kelas ${index + 1}`,
  }));
}

function resolveQuantileIndex(value: number, bins: QuantileBin[]): number {
  if (!bins.length) return 0;
  for (let i = 0; i < bins.length; i++) {
    if (value <= bins[i].max) return bins[i].index;
  }
  return bins[bins.length - 1]?.index ?? 0;
}

export async function buildChoropleth(
  period: string,
  options: { publicMode?: boolean } = {}
): Promise<ChoroplethResponse> {
  const pool = getPgPool();

  // Fetch regions with payment data joined from materialized view
  const sql = `
    SELECT
      r.id::text AS "regionId",
      r.name,
      ST_AsGeoJSON(r.geom)::json AS geometry,
      ST_AsGeoJSON(ST_Centroid(r.geom))::json AS centroid_geom,
      COALESCE(m.amount, 0) AS amount,
      COALESCE(m.cut_amount, 0) AS cut_amount,
      COALESCE(m.net_amount, 0) AS net_amount,
      COALESCE(m.class_index, 0) AS class_index
    FROM regions r
    LEFT JOIN mv_payments_with_cut m
      ON m.region_id = r.id
      AND m.period = ($1 || '-01')::date
    WHERE r.level = 2
    ORDER BY r.name
  `;

  const { rows } = await pool.query(sql, [period]);

  const sortedTotals = [...rows]
    .map((r) => Number(r.amount))
    .filter((v) => v > 0)
    .sort((a, b) => a - b);

  const bins = buildQuantileBins(sortedTotals);

  const features: ChoroplethFeature[] = rows.map((row) => {
    const totalAmount = Number(row.amount);
    const classIndex = resolveQuantileIndex(totalAmount, bins);
    const classLabel = bins[classIndex]?.label ?? `Kelas ${classIndex + 1}`;

    // Extract centroid coordinates
    const centroidGeom = row.centroid_geom as { coordinates?: [number, number] } | null;
    const centroid: [number, number] = centroidGeom?.coordinates ?? [0, 0];

    if (options.publicMode) {
      return {
        type: 'Feature',
        id: row.regionId,
        geometry: row.geometry,
        properties: {
          regionId: row.regionId,
          name: row.name,
          centroid,
          classIndex,
          classLabel,
        },
      } as ChoroplethFeature;
    }

    return {
      type: 'Feature',
      id: row.regionId,
      geometry: row.geometry,
      properties: {
        regionId: row.regionId,
        name: row.name,
        value: totalAmount,
        normalizedValue: Number(row.cut_amount),
        sparkline: [],
        centroid,
        classIndex,
        classLabel,
      },
    } as ChoroplethFeature;
  });

  const ranges: LegendRange[] = bins.map((bin) => ({
    min: bin.min,
    max: bin.max,
    label: bin.label,
  }));

  const legend: LegendDefinition = {
    method: 'quantile',
    bins: bins.map((b) => b.max),
    labels: bins.map((b) => b.label),
    ranges,
  };

  return {
    type: 'FeatureCollection',
    features,
    metadata: {
      period,
      legend,
      public: Boolean(options.publicMode),
    },
  } as ChoroplethResponse;
}

export const geoService = { buildChoropleth };
