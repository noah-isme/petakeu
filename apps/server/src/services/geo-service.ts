import { loadEnv } from '../config/env';
import { getPgPool } from '../db/postgres';
import { getCached, invalidateCacheByPrefix } from '../db/redis';
import { logger } from '../utils/logger';
import { dbQueryDuration, cacheHits, cacheMisses } from '../utils/metrics';

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

function buildCacheKey(period: string, options: { publicMode?: boolean; level?: number; parent?: string } = {}): string {
  const parts = ['choropleth', period];
  if (options.level !== undefined) parts.push(String(options.level));
  if (options.parent !== undefined) parts.push(String(options.parent));
  if (options.publicMode) parts.push('public');
  return parts.join(':');
}

export async function buildChoropleth(
  period: string,
  options: { publicMode?: boolean; level?: number; parent?: string } = {}
): Promise<ChoroplethResponse> {
  const cacheKey = buildCacheKey(period, options);
  const startTime = Date.now();

  return getCached<ChoroplethResponse>(
    cacheKey,
    async () => {
      const pool = getPgPool();
      const queryStart = Date.now();

      // Build dynamic WHERE clause based on level and parent
      let whereClause = 'WHERE r.level = 2';
      const params: (string | number)[] = [period];
      let paramIndex = 2;

      if (options.level) {
        whereClause = `WHERE r.level = $${paramIndex++}`;
        params.push(options.level);
      }
      if (options.parent) {
        whereClause += ` AND r.parent_id = $${paramIndex++}`;
        params.push(options.parent);
      }

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
        ${whereClause}
        ORDER BY r.name
      `;

      const { rows } = await pool.query(sql, params);
      dbQueryDuration.observe({ query_type: 'select', table: 'regions+mv_payments' }, (Date.now() - queryStart) / 1000);

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

      const response = {
        type: 'FeatureCollection',
        features,
        metadata: {
          period,
          legend,
          public: Boolean(options.publicMode),
        },
      } as ChoroplethResponse;

      logger.debug({ cacheKey, durationMs: Date.now() - startTime }, 'Choropleth built from database');
      return response;
    },
    { ttl: loadEnv().choroplethCacheTtl, keyPrefix: 'petakeu:geo' }
  ).then((result) => {
    // Track cache hit/miss - we can't easily know from getCached, so we'll check in getCached
    return result;
  });
}

export async function invalidateChoroplethCache(): Promise<void> {
  await invalidateCacheByPrefix('geo:choropleth');
  logger.info('Choropleth cache invalidated');
}

export const geoService = { buildChoropleth, invalidateChoroplethCache };