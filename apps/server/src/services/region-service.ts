import { getPgPool } from '../db/postgres';
import { AppError } from '../utils/app-error';
import type { Region, RegionListParams, RegionSummary, TrendPoint } from '../types/region';

// Level integer mapping (matches DB schema)
const LEVEL_MAP: Record<string, number> = {
  province: 1,
  regency: 2,
  district: 3,
  village: 4,
};

const LEVEL_REVERSE: Record<number, string> = {
  1: 'province',
  2: 'regency',
  3: 'district',
  4: 'village',
};

export async function listRegions(params: RegionListParams): Promise<Region[]> {
  const pool = getPgPool();
  const conditions: string[] = [];
  const values: (string | number)[] = [];
  let idx = 1;

  if (params.level) {
    const levelNum = LEVEL_MAP[params.level];
    if (levelNum) {
      conditions.push(`level = $${idx++}`);
      values.push(levelNum);
    }
  }

  if (params.parent) {
    conditions.push(`parent_id = $${idx++}`);
    values.push(params.parent);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const sql = `
    SELECT id::text, code_bps AS code, name, level, parent_id::text AS "parentId"
    FROM regions
    ${where}
    ORDER BY name
    LIMIT 500
  `;

  const { rows } = await pool.query(sql, values);
  return rows.map((row: any) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    level: LEVEL_REVERSE[row.level] ?? 'province',
    parentId: row.parentId ?? undefined,
  })) as Region[];
}

export async function getRegionSummary(
  regionId: string,
  range?: { from?: string; to?: string }
): Promise<RegionSummary> {
  const pool = getPgPool();

  // Get region metadata
  const regionRes = await pool.query(
    'SELECT id::text, code_bps AS code, name, level, parent_id::text AS "parentId" FROM regions WHERE id = $1',
    [regionId]
  );
  if (regionRes.rows.length === 0) {
    throw new AppError('Region not found', 404);
  }
  const regionRow = regionRes.rows[0];
  const region: Region = {
    id: regionRow.id,
    code: regionRow.code,
    name: regionRow.name,
    level: (LEVEL_REVERSE[regionRow.level] ?? 'province') as import('../types/region').RegionLevel,
    parentId: regionRow.parentId ?? undefined,
  };

  // Build period filter for mv_payments_with_cut
  const periodConditions: string[] = ['region_id = $1'];
  const periodValues: string[] = [regionId];
  let idx = 2;

  if (range?.from) {
    periodConditions.push(`period >= $${idx++}::date`);
    periodValues.push(`${range.from}-01`);
  } else {
    // Default: last 6 months
    periodConditions.push(`period >= (CURRENT_DATE - INTERVAL '6 months')::date`);
  }
  if (range?.to) {
    periodConditions.push(`period <= $${idx++}::date`);
    periodValues.push(`${range.to}-01`);
  }

  const mvSql = `
    SELECT
      to_char(period, 'YYYY-MM') AS period,
      amount,
      cut_amount AS "cut15Amount",
      net_amount AS "netAmount"
    FROM mv_payments_with_cut
    WHERE ${periodConditions.join(' AND ')}
    ORDER BY period ASC
  `;

  const { rows: trendRows } = await pool.query(mvSql, periodValues);

  const trend: TrendPoint[] = trendRows.map((r: any) => ({
    period: r.period,
    amount: Number(r.amount),
  }));

  const monthlyBreakdown = trendRows.map((r: any) => ({
    period: r.period,
    amount: Number(r.amount),
    cut15Amount: Number(r.cut15Amount),
    netAmount: Number(r.netAmount),
  }));

  const totalAmount = monthlyBreakdown.reduce((acc: number, e: any) => acc + e.amount, 0);
  const cut15Amount = totalAmount * 0.15;
  const netAmount = totalAmount - cut15Amount;

  return {
    region,
    totalAmount,
    cut15Amount,
    netAmount,
    trend,
    monthlyBreakdown,
    lastUpdated: new Date().toISOString(),
    reportUrl: undefined,
  };
}

export const regionService = {
  listRegions,
  getRegionSummary,
};
