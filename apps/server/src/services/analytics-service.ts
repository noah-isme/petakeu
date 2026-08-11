import { getPgPool } from '../db/postgres';
import { getCached, invalidateCacheByPrefix } from '../db/redis';
import { AppError } from '../utils/app-error';
import { logger } from '../utils/logger';
import { addMonths } from '../validators/analytics';

import type {
  AnalyticsMonthlyTrendPoint,
  AnalyticsOverview,
  AnalyticsOverviewParams,
  AnalyticsOutlierRegion,
  AnalyticsProvinceComparison,
  AnalyticsRegionMetric,
  AnalyticsYoYComparison,
  AnalyticsYoYRegion,
  RevenueTarget,
  RevenueTargetInput,
  ReportingMatrix,
  ReportingMatrixRegion,
  ReportingMatrixStatus,
  TargetListParams,
} from '../types/analytics';

const OVERVIEW_CACHE_TTL_SECONDS = 120;
const TARGET_LIST_CACHE_TTL_SECONDS = 120;
const TOP_REGION_LIMIT = 10;
const TARGET_LIST_LIMIT = 1000;

interface RegionalAggregateRow {
  region_id: string;
  region_name: string;
  province_id: string | null;
  province_name: string | null;
  current_actual: string | number | null;
  previous_month_actual: string | number | null;
  previous_year_actual: string | number | null;
  current_target: string | number | null;
  current_reported: string | number | null;
}

interface TrendRow {
  period: string;
  actual: string | number | null;
  target: string | number | null;
}

interface MatrixRow {
  region_id: string;
  region_name: string;
  province_id: string | null;
  province_name: string | null;
  period: string;
  actual: string | number | null;
}

interface TargetRow {
  id: string;
  region_id: string;
  region_name: string;
  region_level: number;
  province_id: string | null;
  province_name: string | null;
  period: string;
  target: string | number | null;
  created_by: string;
  updated_by: string;
  created_at: string | Date;
  updated_at: string | Date;
}

function asNumber(value: string | number | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function asOptionalString(value: string | null | undefined): string | undefined {
  return value ?? undefined;
}

function percentageChange(current: number, previous: number): number {
  if (previous === 0) return 0;
  return Number((((current - previous) / previous) * 100).toFixed(2));
}

function percentageOf(value: number, denominator: number): number {
  if (denominator === 0) return 0;
  return Number(((value / denominator) * 100).toFixed(2));
}

function metricFromValues(
  region: Pick<RegionalAggregateRow, 'region_id' | 'region_name' | 'province_id' | 'province_name'>,
  actual: number,
  target: number,
): AnalyticsRegionMetric {
  const variance = actual - target;
  return {
    regionId: region.region_id,
    regionName: region.region_name,
    provinceId: asOptionalString(region.province_id),
    provinceName: asOptionalString(region.province_name),
    actual,
    target,
    variance,
    variancePercentage: percentageOf(variance, target),
    achievementPercentage: percentageOf(actual, target),
  };
}

function metricFromRow(row: RegionalAggregateRow): AnalyticsRegionMetric {
  return metricFromValues(row, asNumber(row.current_actual), asNumber(row.current_target));
}

function sortRegionMetrics(metrics: AnalyticsRegionMetric[], descending: boolean): AnalyticsRegionMetric[] {
  return [...metrics]
    .sort((left, right) => {
      const difference = descending ? right.actual - left.actual : left.actual - right.actual;
      return difference || left.regionName.localeCompare(right.regionName);
    })
    .slice(0, TOP_REGION_LIMIT)
    .map((metric, index) => ({ ...metric, rank: index + 1 }));
}

function buildProvinceFilter(values: unknown[], alias: string, provinceIds: string[]): string {
  if (provinceIds.length === 0) return '';
  const parameterIndex = values.length + 1;
  values.push(provinceIds);
  return ` AND ${alias}.parent_id = ANY($${parameterIndex}::uuid[])`;
}

function periodDate(period: string): string {
  return `${period}-01`;
}

function buildOverviewCacheKey(params: AnalyticsOverviewParams): string {
  const provincePart = params.provinceIds.length > 0 ? [...params.provinceIds].sort().join(',') : 'all';
  return `overview:${params.period}:${params.from}:${params.to}:${provincePart}`;
}

function buildTargetListCacheKey(params: TargetListParams): string {
  return [
    'targets',
    params.regionId ?? 'all-regions',
    params.period ?? 'all-periods',
    params.from ?? 'no-from',
    params.to ?? 'no-to',
    params.provinceIds.length > 0 ? [...params.provinceIds].sort().join(',') : 'all-provinces',
  ].join(':');
}

function buildRegionalAggregateQuery(params: AnalyticsOverviewParams): { sql: string; values: unknown[] } {
  const values: unknown[] = [
    periodDate(params.period),
    periodDate(params.from),
    periodDate(params.to),
    periodDate(addMonths(params.period, -1)),
    periodDate(addMonths(params.period, -12)),
  ];
  const provinceFilter = buildProvinceFilter(values, 'r', params.provinceIds);

  return {
    values,
    sql: `
      WITH actuals AS (
        SELECT
          m.region_id,
          SUM(m.amount) FILTER (WHERE m.period = $1::date) AS current_actual,
          SUM(m.amount) FILTER (WHERE m.period = $4::date) AS previous_month_actual,
          SUM(m.amount) FILTER (WHERE m.period = $5::date) AS previous_year_actual,
          COUNT(*) FILTER (WHERE m.period = $1::date) AS current_reported
        FROM mv_payments_with_cut m
        WHERE m.period BETWEEN $2::date AND $3::date
           OR m.period IN ($1::date, $4::date, $5::date)
        GROUP BY m.region_id
      ),
      targets AS (
        SELECT
          t.region_id,
          SUM(t.target) FILTER (WHERE t.period = $1::date) AS current_target
        FROM revenue_targets t
        WHERE t.period BETWEEN $2::date AND $3::date
           OR t.period = $1::date
        GROUP BY t.region_id
      )
      SELECT
        r.id::text AS region_id,
        r.name AS region_name,
        p.id::text AS province_id,
        p.name AS province_name,
        COALESCE(a.current_actual, 0) AS current_actual,
        COALESCE(a.previous_month_actual, 0) AS previous_month_actual,
        COALESCE(a.previous_year_actual, 0) AS previous_year_actual,
        COALESCE(t.current_target, 0) AS current_target,
        COALESCE(a.current_reported, 0) AS current_reported
      FROM regions r
      LEFT JOIN regions p ON p.id = r.parent_id
      LEFT JOIN actuals a ON a.region_id = r.id
      LEFT JOIN targets t ON t.region_id = r.id
      WHERE r.level = 2${provinceFilter}
      ORDER BY r.name ASC
    `,
  };
}

function buildTrendQuery(params: AnalyticsOverviewParams): { sql: string; values: unknown[] } {
  const values: unknown[] = [periodDate(params.from), periodDate(params.to)];
  const provinceFilter = buildProvinceFilter(values, 'r', params.provinceIds);

  return {
    values,
    sql: `
      WITH months AS (
        SELECT generate_series($1::date, $2::date, INTERVAL '1 month')::date AS period
      ),
      actuals AS (
        SELECT m.period, SUM(m.amount) AS actual
        FROM mv_payments_with_cut m
        JOIN regions r ON r.id = m.region_id
        WHERE r.level = 2
          AND m.period BETWEEN $1::date AND $2::date${provinceFilter}
        GROUP BY m.period
      ),
      targets AS (
        SELECT t.period, SUM(t.target) AS target
        FROM revenue_targets t
        JOIN regions r ON r.id = t.region_id
        WHERE r.level = 2
          AND t.period BETWEEN $1::date AND $2::date${provinceFilter}
        GROUP BY t.period
      )
      SELECT
        to_char(months.period, 'YYYY-MM') AS period,
        COALESCE(actuals.actual, 0) AS actual,
        COALESCE(targets.target, 0) AS target
      FROM months
      LEFT JOIN actuals ON actuals.period = months.period
      LEFT JOIN targets ON targets.period = months.period
      ORDER BY months.period ASC
    `,
  };
}

function buildMatrixQuery(params: AnalyticsOverviewParams): { sql: string; values: unknown[] } {
  const values: unknown[] = [periodDate(params.from), periodDate(params.to)];
  const provinceFilter = buildProvinceFilter(values, 'r', params.provinceIds);

  return {
    values,
    sql: `
      WITH months AS (
        SELECT generate_series($1::date, $2::date, INTERVAL '1 month')::date AS period
      )
      SELECT
        r.id::text AS region_id,
        r.name AS region_name,
        p.id::text AS province_id,
        p.name AS province_name,
        to_char(months.period, 'YYYY-MM') AS period,
        m.amount AS actual
      FROM regions r
      LEFT JOIN regions p ON p.id = r.parent_id
      CROSS JOIN months
      LEFT JOIN mv_payments_with_cut m
        ON m.region_id = r.id
       AND m.period = months.period
      WHERE r.level = 2${provinceFilter}
      ORDER BY r.name ASC, months.period ASC
    `,
  };
}

function buildMonthlyTrend(rows: TrendRow[]): AnalyticsMonthlyTrendPoint[] {
  return rows.map((row) => {
    const actual = asNumber(row.actual);
    const target = asNumber(row.target);
    const variance = actual - target;
    return {
      period: row.period,
      actual,
      target,
      variance,
      variancePercentage: percentageOf(variance, target),
    };
  });
}

function buildOutliers(rows: RegionalAggregateRow[]): AnalyticsOutlierRegion[] {
  return rows
    .map((row): AnalyticsOutlierRegion | null => {
      const actual = asNumber(row.current_actual);
      const previousActual = asNumber(row.previous_month_actual);
      if (actual === 0 && previousActual === 0) return null;

      const growthPercentage = percentageChange(actual, previousActual);
      return {
        regionId: row.region_id,
        regionName: row.region_name,
        provinceId: asOptionalString(row.province_id),
        provinceName: asOptionalString(row.province_name),
        actual,
        previousActual,
        growthPercentage,
        direction: actual > previousActual ? 'up' : actual < previousActual ? 'down' : 'flat',
      };
    })
    .filter((row): row is AnalyticsOutlierRegion => row !== null)
    .sort((left, right) => {
      const difference = Math.abs(right.growthPercentage) - Math.abs(left.growthPercentage);
      return difference || left.regionName.localeCompare(right.regionName);
    })
    .slice(0, TOP_REGION_LIMIT);
}

function buildProvinceComparison(rows: RegionalAggregateRow[]): AnalyticsProvinceComparison[] {
  const byProvince = new Map<string, AnalyticsProvinceComparison>();

  for (const row of rows) {
    const key = row.province_id ?? '__unknown__';
    const current = byProvince.get(key) ?? {
      provinceId: asOptionalString(row.province_id),
      provinceName: row.province_name ?? 'Unknown province',
      actual: 0,
      target: 0,
      variance: 0,
      achievementPercentage: 0,
      expectedRegencies: 0,
      reportedRegencies: 0,
      coveragePercentage: 0,
    };

    current.actual += asNumber(row.current_actual);
    current.target += asNumber(row.current_target);
    current.expectedRegencies += 1;
    if (asNumber(row.current_reported) > 0) current.reportedRegencies += 1;
    current.variance = current.actual - current.target;
    current.achievementPercentage = percentageOf(current.actual, current.target);
    current.coveragePercentage = percentageOf(current.reportedRegencies, current.expectedRegencies);
    byProvince.set(key, current);
  }

  return [...byProvince.values()].sort((left, right) => left.provinceName.localeCompare(right.provinceName));
}

function reportingStatus(period: string, hasReport: boolean, now: Date): ReportingMatrixStatus {
  if (hasReport) return 'reported';

  const activePeriod = now.toISOString().slice(0, 7);
  if (period > activePeriod) return 'pending';
  if (period === activePeriod) return now.getUTCDate() > 15 ? 'delayed' : 'pending';
  return 'missing';
}

function buildReportingMatrix(rows: MatrixRow[], from: string, to: string, now: Date = new Date()): ReportingMatrix {
  const periods: string[] = [];
  for (let period = from; period <= to; period = addMonths(period, 1)) {
    periods.push(period);
  }

  const regions = new Map<string, ReportingMatrixRegion>();
  let reported = 0;
  let missing = 0;
  let delayed = 0;
  let pending = 0;

  for (const row of rows) {
    const region = regions.get(row.region_id) ?? {
      regionId: row.region_id,
      regionName: row.region_name,
      provinceId: asOptionalString(row.province_id),
      provinceName: asOptionalString(row.province_name),
      months: [],
    };
    const hasReport = row.actual !== null && row.actual !== undefined;
    const status = reportingStatus(row.period, hasReport, now);
    const actual = asNumber(row.actual);

    region.months.push({ period: row.period, status, actual });
    if (status === 'reported') reported += 1;
    if (status === 'missing') missing += 1;
    if (status === 'delayed') delayed += 1;
    if (status === 'pending') pending += 1;
    regions.set(row.region_id, region);
  }

  const expected = periods.length * regions.size;
  return {
    periods,
    regions: [...regions.values()].sort((left, right) => left.regionName.localeCompare(right.regionName)),
    summary: {
      expected,
      reported,
      missing,
      delayed,
      pending,
      coveragePercentage: percentageOf(reported, expected),
    },
  };
}

function mapTarget(row: TargetRow): RevenueTarget {
  return {
    id: row.id,
    regionId: row.region_id,
    regionName: row.region_name,
    regionLevel: row.region_level,
    provinceId: asOptionalString(row.province_id),
    provinceName: asOptionalString(row.province_name),
    period: row.period,
    target: asNumber(row.target),
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

async function buildOverview(params: AnalyticsOverviewParams): Promise<AnalyticsOverview> {
  const pool = getPgPool();
  const regionalQuery = buildRegionalAggregateQuery(params);
  const trendQuery = buildTrendQuery(params);
  const matrixQuery = buildMatrixQuery(params);

  const [regionalResult, trendResult, matrixResult] = await Promise.all([
    pool.query<RegionalAggregateRow>(regionalQuery.sql, regionalQuery.values),
    pool.query<TrendRow>(trendQuery.sql, trendQuery.values),
    pool.query<MatrixRow>(matrixQuery.sql, matrixQuery.values),
  ]);

  const regionalRows = regionalResult.rows;
  const regionMetrics = regionalRows.map(metricFromRow);
  const totalActual = regionMetrics.reduce((sum, row) => sum + row.actual, 0);
  const totalTarget = regionMetrics.reduce((sum, row) => sum + row.target, 0);
  const previousMonthTotal = regionalRows.reduce((sum, row) => sum + asNumber(row.previous_month_actual), 0);
  const previousYearTotal = regionalRows.reduce((sum, row) => sum + asNumber(row.previous_year_actual), 0);
  const reportedRegencies = regionalRows.reduce(
    (count, row) => count + (asNumber(row.current_reported) > 0 ? 1 : 0),
    0,
  );
  const expectedRegencies = regionalRows.length;
  const targetVsActualVariance = totalActual - totalTarget;
  const yoyGrowth = percentageChange(totalActual, previousYearTotal);
  const comparisonPeriod = addMonths(params.period, -12);

  const yoyRegions: AnalyticsYoYRegion[] = regionalRows
    .map((row) => ({
      regionId: row.region_id,
      regionName: row.region_name,
      provinceId: asOptionalString(row.province_id),
      provinceName: asOptionalString(row.province_name),
      actual: asNumber(row.current_actual),
      previousActual: asNumber(row.previous_year_actual),
      growthPercentage: percentageChange(asNumber(row.current_actual), asNumber(row.previous_year_actual)),
    }))
    .sort((left, right) => right.actual - left.actual || left.regionName.localeCompare(right.regionName));

  const targetVsActualRegions = [...regionMetrics]
    .sort((left, right) => right.actual - left.actual || left.regionName.localeCompare(right.regionName))
    .map((metric, index) => ({ ...metric, rank: index + 1 }));

  const targetVsActual = {
    period: params.period,
    totalActual,
    totalTarget,
    variance: targetVsActualVariance,
    variancePercentage: percentageOf(targetVsActualVariance, totalTarget),
    achievementPercentage: percentageOf(totalActual, totalTarget),
    regions: targetVsActualRegions,
  };

  const provinceComparison: AnalyticsProvinceComparison[] = buildProvinceComparison(regionalRows);
  const reportingMatrix = buildReportingMatrix(matrixResult.rows, params.from, params.to);

  const yoyComparison: AnalyticsYoYComparison = {
    period: params.period,
    comparisonPeriod,
    currentTotal: totalActual,
    previousTotal: previousYearTotal,
    growthPercentage: yoyGrowth,
    regions: yoyRegions,
  };

  const overview: AnalyticsOverview = {
    filters: params,
    kpis: {
      nationalTotal: totalActual,
      momGrowth: percentageChange(totalActual, previousMonthTotal),
      reportingCoverage: percentageOf(reportedRegencies, expectedRegencies),
      outlierRegions: buildOutliers(regionalRows),
    },
    monthlyTrend: buildMonthlyTrend(trendResult.rows),
    topRegions: sortRegionMetrics(regionMetrics, true),
    bottomRegions: sortRegionMetrics(regionMetrics, false),
    targetVsActual,
    crossProvinceComparison: provinceComparison,
    yoyComparison,
    reportingMatrix,
  };

  logger.debug(
    {
      period: params.period,
      from: params.from,
      to: params.to,
      provinceCount: params.provinceIds.length,
      regionCount: regionalRows.length,
    },
    'Analytics overview built from database',
  );

  return overview;
}

export async function getOverview(params: AnalyticsOverviewParams): Promise<AnalyticsOverview> {
  return getCached<AnalyticsOverview>(
    buildOverviewCacheKey(params),
    () => buildOverview(params),
    { ttl: OVERVIEW_CACHE_TTL_SECONDS, keyPrefix: 'petakeu:analytics' },
  );
}

export async function registerTarget(input: RevenueTargetInput, userId: string): Promise<RevenueTarget> {
  const pool = getPgPool();
  const result = await pool.query<TargetRow>(
    `
      WITH upserted AS (
        INSERT INTO revenue_targets (region_id, period, target, created_by, updated_by)
        SELECT $1::uuid, $2::date, $3::numeric, $4::text, $4::text
        FROM regions
        WHERE id = $1::uuid
        ON CONFLICT (region_id, period)
        DO UPDATE SET
          target = EXCLUDED.target,
          updated_by = EXCLUDED.updated_by,
          updated_at = NOW()
        RETURNING *
      )
      SELECT
        t.id::text AS id,
        t.region_id::text AS region_id,
        r.name AS region_name,
        r.level AS region_level,
        p.id::text AS province_id,
        p.name AS province_name,
        to_char(t.period, 'YYYY-MM') AS period,
        t.target,
        t.created_by,
        t.updated_by,
        t.created_at,
        t.updated_at
      FROM upserted t
      JOIN regions r ON r.id = t.region_id
      LEFT JOIN regions p ON p.id = r.parent_id
    `,
    [input.regionId, periodDate(input.period), input.target, userId],
  );

  if (result.rows.length === 0) {
    throw new AppError('Region not found', 404);
  }

  await invalidateAnalyticsCache();
  const target = mapTarget(result.rows[0]);
  logger.info(
    { regionId: target.regionId, period: target.period, userId, target: target.target },
    'Revenue target registered',
  );
  return target;
}

export async function listTargets(params: TargetListParams): Promise<RevenueTarget[]> {
  const cacheKey = buildTargetListCacheKey(params);

  return getCached<RevenueTarget[]>(
    cacheKey,
    async () => {
      const pool = getPgPool();
      const values: unknown[] = [];
      const conditions: string[] = [];

      if (params.regionId) {
        values.push(params.regionId);
        conditions.push(`t.region_id = $${values.length}::uuid`);
      }
      if (params.period) {
        values.push(periodDate(params.period));
        conditions.push(`t.period = $${values.length}::date`);
      }
      if (params.from) {
        values.push(periodDate(params.from));
        conditions.push(`t.period >= $${values.length}::date`);
      }
      if (params.to) {
        values.push(periodDate(params.to));
        conditions.push(`t.period <= $${values.length}::date`);
      }
      if (params.provinceIds.length > 0) {
        values.push(params.provinceIds);
        conditions.push(`r.parent_id = ANY($${values.length}::uuid[])`);
      }

      values.push(TARGET_LIST_LIMIT);
      const limitParameter = values.length;
      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      const result = await pool.query<TargetRow>(
        `
          SELECT
            t.id::text AS id,
            t.region_id::text AS region_id,
            r.name AS region_name,
            r.level AS region_level,
            p.id::text AS province_id,
            p.name AS province_name,
            to_char(t.period, 'YYYY-MM') AS period,
            t.target,
            t.created_by,
            t.updated_by,
            t.created_at,
            t.updated_at
          FROM revenue_targets t
          JOIN regions r ON r.id = t.region_id
          LEFT JOIN regions p ON p.id = r.parent_id
          ${where}
          ORDER BY t.period DESC, p.name NULLS LAST, r.name ASC
          LIMIT $${limitParameter}::int
        `,
        values,
      );

      return result.rows.map(mapTarget);
    },
    { ttl: TARGET_LIST_CACHE_TTL_SECONDS, keyPrefix: 'petakeu:analytics' },
  );
}

export async function invalidateAnalyticsCache(): Promise<void> {
  await invalidateCacheByPrefix('analytics');
  logger.info('Analytics cache invalidated');
}

export const analyticsService = {
  getOverview,
  registerTarget,
  listTargets,
  invalidateAnalyticsCache,
};
