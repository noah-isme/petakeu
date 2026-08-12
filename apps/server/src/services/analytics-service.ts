import { getPgPool } from '../db/postgres';
import { getCached, invalidateCacheByPrefix } from '../db/redis';
import { AppError } from '../utils/app-error';
import { logger } from '../utils/logger';
import { addMonths } from '../validators/analytics';

import type {
  AnalyticsMonthlyTrendPoint,
  AnalyticsRanking,
  AnalyticsRankingParams,
  AnalyticsRankingsResponse,
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
  ReportingMatrixDetail,
  ReportingMatrixRegion,
  ReportingMatrixStatus,
  ValidationFinding,
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
  range_actual: string | number | null;
  range_target: string | number | null;
  range_reported: string | number | null;
  previous_range_actual: string | number | null;
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
  gross_amount: string | number | null;
  share_amount: string | number | null;
  net_amount: string | number | null;
  target_amount: string | number | null;
  has_validation_warnings: boolean | null;
}

interface MatrixDetailRow {
  region_id: string;
  region_name: string;
  bps_code: string | null;
  province_id: string | null;
  province_name: string | null;
  period: string;
  gross_amount: string | number | null;
  share_amount: string | number | null;
  net_amount: string | number | null;
  target_amount: string | number | null;
  upload_id: string | null;
  filename: string | null;
  imported_by: string | null;
  imported_at: string | Date | null;
  validation_findings: unknown;
}

interface RankingRow {
  region_id: string;
  region_name: string;
  province_id: string | null;
  province_name: string | null;
  actual: string | number | null;
  target: string | number | null;
  average_monthly: string | number | null;
  previous_actual: string | number | null;
  reported_months: string | number | null;
  ranking_value: string | number | null;
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
  const actual = asNumber(row.current_actual);
  const target = asNumber(row.current_target);
  const rangeActual = asNumber(row.range_actual ?? row.current_actual);
  const rangeTarget = asNumber(row.range_target ?? row.current_target);
  const averageMonthly = asNumber(row.range_reported) > 0
    ? Number((rangeActual / asNumber(row.range_reported)).toFixed(2))
    : 0;
  const growthPercentage = percentageChange(rangeActual, asNumber(row.previous_range_actual));
  const variance = rangeActual - rangeTarget;

  return {
    ...metricFromValues(row, actual, target),
    averageMonthly,
    growthPercentage,
    surplus: Math.max(variance, 0),
    deficit: Math.min(variance, 0),
    rankingValue: rangeActual,
    rangeActual,
    rangeTarget,
    rangeAchievementPercentage: percentageOf(rangeActual, rangeTarget),
  };
}

function withRankingCriterion(
  metrics: AnalyticsRegionMetric[],
  criterion: AnalyticsOverviewParams['rankingCriterion'],
): AnalyticsRegionMetric[] {
  return metrics.map((metric) => {
    switch (criterion) {
      case 'average_monthly':
        return { ...metric, rankingValue: metric.averageMonthly ?? 0 };
      case 'target_achievement':
        return { ...metric, rankingValue: metric.rangeAchievementPercentage ?? metric.achievementPercentage };
      case 'growth':
        return { ...metric, rankingValue: metric.growthPercentage ?? 0 };
      case 'surplus':
        return { ...metric, rankingValue: metric.surplus ?? 0 };
      case 'deficit':
        return { ...metric, rankingValue: metric.deficit ?? 0 };
      case 'total':
      default:
        return { ...metric, rankingValue: metric.rangeActual ?? metric.actual };
    }
  });
}

function sortRegionMetrics(metrics: AnalyticsRegionMetric[], descending: boolean): AnalyticsRegionMetric[] {
  return [...metrics]
    .sort((left, right) => {
      const leftValue = left.rankingValue ?? left.actual;
      const rightValue = right.rankingValue ?? right.actual;
      const difference = descending ? rightValue - leftValue : leftValue - rightValue;
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

function monthDistance(from: string, to: string): number {
  const [fromYear, fromMonth] = from.split('-').map(Number);
  const [toYear, toMonth] = to.split('-').map(Number);
  return (toYear - fromYear) * 12 + toMonth - fromMonth + 1;
}

function amountExpression(alias: string, basis: AnalyticsOverviewParams['amountBasis'], financialAlias = 'f'): string {
  switch (basis) {
    case 'share':
      return `COALESCE(${financialAlias}.share_amount, ${alias}.cut_amount)`;
    case 'net':
      return `COALESCE(${financialAlias}.net_amount, ${alias}.net_amount)`;
    case 'gross':
    default:
      return `COALESCE(${financialAlias}.gross_amount, ${alias}.amount)`;
  }
}

const FINANCIALS_CTE = `
      financials AS (
        SELECT
          p.region_id,
          date_trunc('month', p.period)::date AS period,
          SUM(COALESCE(p.gross_amount, p.amount)) AS gross_amount,
          SUM(COALESCE(p.share_amount, p.amount * 0.15)) AS share_amount,
          SUM(COALESCE(p.net_amount, p.amount - p.amount * 0.15)) AS net_amount
        FROM payments p
        GROUP BY p.region_id, date_trunc('month', p.period)::date
      ),`;

function rankingAmountExpression(alias: string, basis: AnalyticsRankingParams['amountBasis']): string {
  return amountExpression(alias, basis);
}

function buildOverviewCacheKey(params: AnalyticsOverviewParams): string {
  const provincePart = params.provinceIds.length > 0 ? [...params.provinceIds].sort().join(',') : 'all';
  return `overview:${params.period}:${params.from}:${params.to}:${provincePart}:${params.amountBasis}:${params.rankingCriterion}`;
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
  const amount = amountExpression('m', params.amountBasis);
  const rangeMonths = monthDistance(params.from, params.to);
  const previousFrom = addMonths(params.from, -rangeMonths);
  const previousTo = addMonths(params.to, -rangeMonths);
  const values: unknown[] = [
    periodDate(params.period),
    periodDate(params.from),
    periodDate(params.to),
    periodDate(addMonths(params.period, -1)),
    periodDate(addMonths(params.period, -12)),
    periodDate(previousFrom),
    periodDate(previousTo),
  ];
  const provinceFilter = buildProvinceFilter(values, 'r', params.provinceIds);

  return {
    values,
    sql: `
      WITH${FINANCIALS_CTE} actuals AS (
        SELECT
          m.region_id,
          SUM(${amount}) FILTER (WHERE m.period = $1::date) AS current_actual,
          SUM(${amount}) FILTER (WHERE m.period = $4::date) AS previous_month_actual,
          SUM(${amount}) FILTER (WHERE m.period = $5::date) AS previous_year_actual,
          SUM(${amount}) FILTER (WHERE m.period BETWEEN $2::date AND $3::date) AS range_actual,
          COUNT(*) FILTER (WHERE m.period BETWEEN $2::date AND $3::date) AS range_reported,
          SUM(${amount}) FILTER (WHERE m.period BETWEEN $6::date AND $7::date) AS previous_range_actual,
          COUNT(*) FILTER (WHERE m.period = $1::date) AS current_reported
        FROM mv_payments_with_cut m
        LEFT JOIN financials f ON f.region_id = m.region_id AND f.period = m.period
        WHERE m.period BETWEEN $2::date AND $3::date
           OR m.period BETWEEN $6::date AND $7::date
           OR m.period IN ($1::date, $4::date, $5::date)
        GROUP BY m.region_id
      ),
      targets AS (
        SELECT
          t.region_id,
          SUM(t.target) FILTER (WHERE t.period = $1::date) AS current_target,
          SUM(t.target) FILTER (WHERE t.period BETWEEN $2::date AND $3::date) AS range_target
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
        COALESCE(a.current_reported, 0) AS current_reported,
        COALESCE(a.range_actual, 0) AS range_actual,
        COALESCE(t.range_target, 0) AS range_target,
        COALESCE(a.range_reported, 0) AS range_reported,
        COALESCE(a.previous_range_actual, 0) AS previous_range_actual
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
  const amount = amountExpression('m', params.amountBasis);
  const values: unknown[] = [periodDate(params.from), periodDate(params.to)];
  const provinceFilter = buildProvinceFilter(values, 'r', params.provinceIds);

  return {
    values,
    sql: `
      WITH${FINANCIALS_CTE}
      months AS (
        SELECT generate_series($1::date, $2::date, INTERVAL '1 month')::date AS period
      ),
      actuals AS (
        SELECT m.period, SUM(${amount}) AS actual
        FROM mv_payments_with_cut m
        JOIN regions r ON r.id = m.region_id
        LEFT JOIN financials f ON f.region_id = m.region_id AND f.period = m.period
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
  const amount = amountExpression('m', params.amountBasis);
  const values: unknown[] = [periodDate(params.from), periodDate(params.to)];
  const provinceFilter = buildProvinceFilter(values, 'r', params.provinceIds);

  return {
    values,
    sql: `
      WITH${FINANCIALS_CTE}
      months AS (
        SELECT generate_series($1::date, $2::date, INTERVAL '1 month')::date AS period
      )
      SELECT
        r.id::text AS region_id,
        r.name AS region_name,
        p.id::text AS province_id,
        p.name AS province_name,
        to_char(months.period, 'YYYY-MM') AS period,
        ${amount} AS actual,
        COALESCE(f.gross_amount, m.amount) AS gross_amount,
        COALESCE(f.share_amount, m.cut_amount) AS share_amount,
        COALESCE(f.net_amount, m.net_amount) AS net_amount,
        t.target AS target_amount,
        CASE
          WHEN jsonb_typeof(COALESCE(payment.meta->'validationFindings', payment.meta->'validation_findings', payment.meta->'validationWarnings', '[]'::jsonb)) = 'array'
            THEN jsonb_array_length(COALESCE(payment.meta->'validationFindings', payment.meta->'validation_findings', payment.meta->'validationWarnings', '[]'::jsonb)) > 0
          ELSE FALSE
        END AS has_validation_warnings
      FROM regions r
      LEFT JOIN regions p ON p.id = r.parent_id
      CROSS JOIN months
      LEFT JOIN mv_payments_with_cut m
        ON m.region_id = r.id
       AND m.period = months.period
      LEFT JOIN financials f
        ON f.region_id = r.id AND f.period = months.period
      LEFT JOIN revenue_targets t
        ON t.region_id = r.id
       AND t.period = months.period
      LEFT JOIN LATERAL (
        SELECT p.meta
        FROM payments p
        WHERE p.region_id = r.id
          AND date_trunc('month', p.period)::date = months.period
        ORDER BY p.updated_at DESC
        LIMIT 1
      ) payment ON TRUE
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
    const actual = hasReport ? asNumber(row.actual) : null;

    region.months.push({
      period: row.period,
      status,
      actual,
      target: row.target_amount === null || row.target_amount === undefined ? null : asNumber(row.target_amount),
      grossAmount: row.gross_amount === null || row.gross_amount === undefined ? null : asNumber(row.gross_amount),
      shareAmount: row.share_amount === null || row.share_amount === undefined ? null : asNumber(row.share_amount),
      netAmount: row.net_amount === null || row.net_amount === undefined ? null : asNumber(row.net_amount),
      hasValidationWarnings: Boolean(row.has_validation_warnings),
    });
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
  const regionMetrics = withRankingCriterion(
    regionalRows.map(metricFromRow),
    params.rankingCriterion,
  );
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

function rankingOrder(criterion: AnalyticsRankingParams['rankingCriterion']): {
  expression: string;
  direction: 'ASC' | 'DESC';
  filter?: string;
} {
  switch (criterion) {
    case 'average_monthly':
      return { expression: 'average_monthly', direction: 'DESC' };
    case 'target_achievement':
      return { expression: 'achievement_percentage', direction: 'DESC' };
    case 'growth':
      return { expression: 'growth_percentage', direction: 'DESC' };
    case 'surplus':
      return { expression: 'surplus', direction: 'DESC', filter: 'surplus > 0' };
    case 'deficit':
      return { expression: 'deficit', direction: 'ASC', filter: 'deficit < 0' };
    case 'total':
    default:
      return { expression: 'actual', direction: 'DESC' };
  }
}

function buildRankingQuery(params: AnalyticsRankingParams): { sql: string; values: unknown[] } {
  const amount = rankingAmountExpression('m', params.amountBasis);
  const rangeMonths = monthDistance(params.from, params.to);
  const previousFrom = addMonths(params.from, -rangeMonths);
  const previousTo = addMonths(params.to, -rangeMonths);
  const values: unknown[] = [
    periodDate(params.from),
    periodDate(params.to),
    periodDate(previousFrom),
    periodDate(previousTo),
  ];
  const provinceFilter = buildProvinceFilter(values, 'r', params.provinceIds);
  const order = rankingOrder(params.rankingCriterion);
  values.push(params.limit);
  const limitParameter = values.length;
  const criterionFilter = order.filter ? `WHERE ${order.filter}` : '';

  return {
    values,
    sql: `
      WITH${FINANCIALS_CTE} actuals AS (
        SELECT
          r.id::text AS region_id,
          r.name AS region_name,
          p.id::text AS province_id,
          p.name AS province_name,
          COALESCE(SUM(${amount}) FILTER (WHERE m.period BETWEEN $1::date AND $2::date), 0) AS actual,
          COUNT(*) FILTER (WHERE m.period BETWEEN $1::date AND $2::date) AS reported_months,
          SUM(${amount}) FILTER (WHERE m.period BETWEEN $3::date AND $4::date) AS previous_actual
        FROM regions r
        LEFT JOIN regions p ON p.id = r.parent_id
        LEFT JOIN mv_payments_with_cut m
          ON m.region_id = r.id
         AND (m.period BETWEEN $1::date AND $2::date OR m.period BETWEEN $3::date AND $4::date)
        LEFT JOIN financials f ON f.region_id = m.region_id AND f.period = m.period
        WHERE r.level = 2${provinceFilter}
        GROUP BY r.id, r.name, p.id, p.name
      ),
      targets AS (
        SELECT t.region_id, COALESCE(SUM(t.target), 0) AS target
        FROM revenue_targets t
        WHERE t.period BETWEEN $1::date AND $2::date
        GROUP BY t.region_id
      ),
      metrics AS (
        SELECT
          a.region_id,
          a.region_name,
          a.province_id,
          a.province_name,
          a.actual,
          COALESCE(t.target, 0) AS target,
          COALESCE(a.actual / NULLIF(a.reported_months, 0), 0) AS average_monthly,
          COALESCE(a.previous_actual, 0) AS previous_actual,
          a.reported_months,
          CASE WHEN COALESCE(t.target, 0) = 0 THEN 0
            ELSE a.actual / t.target * 100 END AS achievement_percentage,
          CASE WHEN COALESCE(a.previous_actual, 0) = 0 THEN 0
            ELSE (a.actual - a.previous_actual) / a.previous_actual * 100 END AS growth_percentage,
          GREATEST(a.actual - COALESCE(t.target, 0), 0) AS surplus,
          LEAST(a.actual - COALESCE(t.target, 0), 0) AS deficit
        FROM actuals a
        LEFT JOIN targets t ON t.region_id::text = a.region_id
      )
      SELECT
        region_id,
        region_name,
        province_id,
        province_name,
        actual,
        target,
        average_monthly,
        previous_actual,
        reported_months,
        ${order.expression} AS ranking_value
      FROM metrics
      ${criterionFilter}
      ORDER BY ${order.expression} ${order.direction}, region_name ASC
      LIMIT $${limitParameter}::int
    `,
  };
}

function mapRanking(row: RankingRow, criterion: AnalyticsRankingParams['rankingCriterion']): AnalyticsRanking {
  const actual = asNumber(row.actual);
  const target = asNumber(row.target);
  const variance = actual - target;
  const averageMonthly = asNumber(row.average_monthly);
  const previousActual = asNumber(row.previous_actual);
  const achievementPercentage = percentageOf(actual, target);
  const growthPercentage = percentageChange(actual, previousActual);
  const surplus = Math.max(variance, 0);
  const deficit = Math.min(variance, 0);
  let rankingValue = actual;
  switch (criterion) {
    case 'average_monthly': rankingValue = averageMonthly; break;
    case 'target_achievement': rankingValue = achievementPercentage; break;
    case 'growth': rankingValue = growthPercentage; break;
    case 'surplus': rankingValue = surplus; break;
    case 'deficit': rankingValue = deficit; break;
    default: break;
  }

  return {
    regionId: row.region_id,
    regionName: row.region_name,
    provinceId: asOptionalString(row.province_id),
    provinceName: asOptionalString(row.province_name),
    actual,
    target,
    variance,
    achievementPercentage,
    averageMonthly,
    growthPercentage,
    surplus,
    deficit,
    rankingValue,
    reportedMonths: asNumber(row.reported_months),
    expectedMonths: 0,
    rank: 0,
  };
}

export async function getRankings(params: AnalyticsRankingParams): Promise<AnalyticsRankingsResponse> {
  const query = buildRankingQuery(params);
  const result = await getPgPool().query<RankingRow>(query.sql, query.values);
  const expectedMonths = monthDistance(params.from, params.to);
  const rankings = result.rows.map((row, index) => ({
    ...mapRanking(row, params.rankingCriterion),
    expectedMonths,
    rank: index + 1,
  }));
  return { filters: params, rankings };
}

function parseValidationFindings(value: unknown): ValidationFinding[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((finding): ValidationFinding[] => {
    if (typeof finding === 'string') return [{ message: finding }];
    if (!finding || typeof finding !== 'object') return [];
    const record = finding as Record<string, unknown>;
    if (typeof record.message !== 'string') return [];
    return [{
      code: typeof record.code === 'string' ? record.code : undefined,
      severity: typeof record.severity === 'string' ? record.severity : undefined,
      message: record.message,
      column: typeof record.column === 'string' ? record.column : undefined,
      row: typeof record.row === 'number' ? record.row : undefined,
    }];
  });
}

function mapMatrixDetail(row: MatrixDetailRow, now: Date = new Date()): ReportingMatrixDetail {
  const hasReport = row.gross_amount !== null && row.gross_amount !== undefined;
  const findings = parseValidationFindings(row.validation_findings);
  return {
    regionId: row.region_id,
    regionName: row.region_name,
    bpsCode: asOptionalString(row.bps_code),
    provinceId: asOptionalString(row.province_id),
    provinceName: asOptionalString(row.province_name),
    period: row.period,
    status: reportingStatus(row.period, hasReport, now),
    grossAmount: hasReport ? asNumber(row.gross_amount) : null,
    shareAmount: row.share_amount === null ? null : asNumber(row.share_amount),
    netAmount: row.net_amount === null ? null : asNumber(row.net_amount),
    targetAmount: row.target_amount === null ? null : asNumber(row.target_amount),
    importMetadata: row.upload_id || row.filename || row.imported_by || row.imported_at
      ? {
          uploadId: asOptionalString(row.upload_id),
          filename: asOptionalString(row.filename),
          importedBy: asOptionalString(row.imported_by),
          importedAt: row.imported_at ? new Date(row.imported_at).toISOString() : undefined,
        }
      : null,
    validationFindings: findings,
  };
}

export async function getReportingMatrix(params: AnalyticsOverviewParams): Promise<ReportingMatrix> {
  const cacheKey = `reporting-matrix:${params.from}:${params.to}:${params.amountBasis}:${params.provinceIds.slice().sort().join(',') || 'all'}`;
  return getCached<ReportingMatrix>(
    cacheKey,
    async () => {
      const query = buildMatrixQuery(params);
      const result = await getPgPool().query<MatrixRow>(query.sql, query.values);
      return buildReportingMatrix(result.rows, params.from, params.to);
    },
    { ttl: OVERVIEW_CACHE_TTL_SECONDS, keyPrefix: 'petakeu:analytics' },
  );
}

export async function getReportingMatrixDetail(regionId: string, period: string): Promise<ReportingMatrixDetail> {
  const result = await getPgPool().query<MatrixDetailRow>(
    `
      SELECT
        r.id::text AS region_id,
        r.name AS region_name,
        r.code_bps AS bps_code,
        p.id::text AS province_id,
        p.name AS province_name,
        $2::text AS period,
        COALESCE(payment.gross_amount, m.amount) AS gross_amount,
        COALESCE(payment.share_amount, m.cut_amount) AS share_amount,
        COALESCE(payment.net_amount, m.net_amount) AS net_amount,
        t.target AS target_amount,
        CASE
          WHEN payment.upload_id IS NOT NULL THEN payment.upload_id
          WHEN NULLIF(payment.meta->>'uploadId', '') ~ '^[0-9a-fA-F-]{36}$' THEN payment.meta->>'uploadId'
          WHEN NULLIF(payment.meta->>'upload_id', '') ~ '^[0-9a-fA-F-]{36}$' THEN payment.meta->>'upload_id'
          ELSE NULL
        END AS upload_id,
        u.filename,
        COALESCE(u.created_by, payment.meta->>'importedBy', payment.meta->>'imported_by') AS imported_by,
        COALESCE(u.created_at, payment.updated_at) AS imported_at,
        COALESCE(findings.findings, payment.meta->'validationFindings', payment.meta->'validation_findings', payment.meta->'validationWarnings', '[]'::jsonb) AS validation_findings
      FROM regions r
      LEFT JOIN regions p ON p.id = r.parent_id
      LEFT JOIN mv_payments_with_cut m
        ON m.region_id = r.id AND m.period = ($2 || '-01')::date
      LEFT JOIN revenue_targets t
        ON t.region_id = r.id AND t.period = ($2 || '-01')::date
      LEFT JOIN LATERAL (
        SELECT
          SUM(COALESCE(pmt.gross_amount, pmt.amount)) AS gross_amount,
          SUM(COALESCE(pmt.share_amount, pmt.amount * 0.15)) AS share_amount,
          SUM(COALESCE(pmt.net_amount, pmt.amount - pmt.amount * 0.15)) AS net_amount,
          (array_agg(pmt.upload_id::text ORDER BY pmt.updated_at DESC))[1] AS upload_id,
          (array_agg(pmt.meta ORDER BY pmt.updated_at DESC))[1] AS meta,
          MAX(pmt.updated_at) AS updated_at
        FROM payments pmt
        WHERE pmt.region_id = r.id
          AND date_trunc('month', pmt.period)::date = ($2 || '-01')::date
      ) payment ON TRUE
      LEFT JOIN uploads u
        ON u.id = CASE
          WHEN payment.upload_id ~ '^[0-9a-fA-F-]{36}$' THEN payment.upload_id::uuid
          WHEN NULLIF(payment.meta->>'uploadId', '') ~ '^[0-9a-fA-F-]{36}$' THEN (payment.meta->>'uploadId')::uuid
          WHEN NULLIF(payment.meta->>'upload_id', '') ~ '^[0-9a-fA-F-]{36}$' THEN (payment.meta->>'upload_id')::uuid
          ELSE NULL
        END
      LEFT JOIN LATERAL (
        SELECT jsonb_agg(jsonb_build_object(
          'severity', f.severity,
          'code', f.code,
          'column', f.column_name,
          'message', f.message,
          'details', f.details
        ) ORDER BY f.created_at) AS findings
        FROM upload_validation_findings f
        WHERE payment.upload_id IS NOT NULL
          AND f.upload_id = payment.upload_id::uuid
      ) findings ON TRUE
      WHERE r.id = $1::uuid
    `,
    [regionId, period],
  );

  if (result.rows.length === 0) {
    throw new AppError('Region not found', 404);
  }
  return mapMatrixDetail(result.rows[0]);
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
  getRankings,
  getReportingMatrix,
  getReportingMatrixDetail,
  registerTarget,
  listTargets,
  invalidateAnalyticsCache,
};
