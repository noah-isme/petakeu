import { getPgPool } from '../db/postgres';

export interface RankingItem {
  regionId: string;
  regionName: string;
  target: number;
  realization: number;
  percentage: number;
  yoy: number;
  rank: number;
}

export interface SurplusDeficitItem {
  regionId: string;
  regionName: string;
  surplus: number;
  deficit: number;
  ytd: number;
}

export async function getRanking(
  jenis: string,
  period: string,
  top: number
): Promise<RankingItem[]> {
  const pool = getPgPool();

  // Get current period amounts
  const sql = `
    SELECT
      r.id::text AS region_id,
      r.name AS region_name,
      COALESCE(m.amount, 0) AS amount
    FROM regions r
    LEFT JOIN mv_payments_with_cut m
      ON m.region_id = r.id AND m.period = ($1 || '-01')::date
    WHERE r.level = 2
    ORDER BY COALESCE(m.amount, 0) DESC
    LIMIT $2
  `;
  const { rows } = await pool.query(sql, [period, top]);

  // Get previous year same period for YoY
  const prevPeriod = (() => {
    const [y, m] = period.split('-').map(Number);
    return `${y - 1}-${String(m).padStart(2, '0')}`;
  })();

  const prevSql = `
    SELECT region_id::text, amount
    FROM mv_payments_with_cut
    WHERE period = ($1 || '-01')::date
  `;
  const prevRes = await pool.query(prevSql, [prevPeriod]);
  const prevMap = new Map(prevRes.rows.map((r: any) => [r.region_id, Number(r.amount)]));

  return rows.map((row: any, index: number) => {
    const realization = Number(row.amount);
    const prevAmount = prevMap.get(row.region_id) ?? 0;
    const yoy = prevAmount > 0 ? ((realization - prevAmount) / prevAmount) * 100 : 0;
    // Target: use 110% of previous year as benchmark
    const target = prevAmount > 0 ? prevAmount * 1.1 : realization * 1.1;
    const percentage = target > 0 ? (realization / target) * 100 : 0;

    return {
      regionId: row.region_id,
      regionName: row.region_name,
      target: Math.round(target),
      realization: Math.round(realization),
      percentage: Number(percentage.toFixed(2)),
      yoy: Number(yoy.toFixed(2)),
      rank: index + 1,
    };
  });
}

export async function getSurplusDeficit(period: string): Promise<SurplusDeficitItem[]> {
  const pool = getPgPool();

  // YTD: sum from start of year to given period
  const [year] = period.split('-');
  const yearStart = `${year}-01`;

  const sql = `
    SELECT
      r.id::text AS region_id,
      r.name AS region_name,
      SUM(m.amount) AS ytd,
      SUM(m.net_amount) AS net_ytd
    FROM regions r
    LEFT JOIN mv_payments_with_cut m
      ON m.region_id = r.id
      AND m.period >= ($1 || '-01')::date
      AND m.period <= ($2 || '-01')::date
    WHERE r.level = 2
    GROUP BY r.id, r.name
    ORDER BY SUM(COALESCE(m.net_amount, 0)) DESC
  `;
  const { rows } = await pool.query(sql, [yearStart, period]);

  return rows.map((row: any) => {
    const ytd = Number(row.ytd ?? 0);
    const netYtd = Number(row.net_ytd ?? 0);
    // Simulate surplus/deficit relative to annual target (120% of YTD extrapolated)
    const annualTarget = ytd * 12;
    const surplus = Math.max(0, ytd - annualTarget * 0.5);
    const deficit = Math.max(0, annualTarget * 0.5 - ytd);
    return {
      regionId: row.region_id,
      regionName: row.region_name,
      surplus: Math.round(surplus),
      deficit: Math.round(deficit),
      ytd: Math.round(ytd),
    };
  });
}

export const fiscalService = { getRanking, getSurplusDeficit };
