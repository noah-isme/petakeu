import { getPgPool } from '../db/postgres';
import { getCached, invalidateCacheByPrefix } from '../db/redis';
import { AppError } from '../utils/app-error';

export interface WatchlistItem {
  regionId: string;
  regionName: string;
  irf: number;
  category: 'red' | 'orange' | 'green';
  topReason: string;
}

export interface RegionDetail {
  regionId: string;
  regionName: string;
  irf: number;
  category: 'red' | 'orange' | 'green';
  reasons: string[];
  projection: {
    target: number[];
    realization: number[];
    kas: number[];
  };
}

function computeIrf(
  currentAmount: number,
  avgAmount: number,
  monthCount: number
): { irf: number; reasons: string[] } {
  const reasons: string[] = [];
  let irfScore = 0;

  if (currentAmount === 0) {
    irfScore += 60;
    reasons.push('Tidak ada setoran pada periode ini');
  } else if (avgAmount > 0 && currentAmount < avgAmount * 0.5) {
    irfScore += 40;
    reasons.push('Setoran turun >50% dibanding rata-rata');
  } else if (avgAmount > 0 && currentAmount < avgAmount * 0.8) {
    irfScore += 20;
    reasons.push('Setoran turun >20% dibanding rata-rata');
  }

  if (monthCount < 2) {
    irfScore += 20;
    reasons.push('Riwayat setoran tidak konsisten');
  }

  return { irf: Math.min(100, irfScore), reasons };
}

function getCategory(irf: number): 'red' | 'orange' | 'green' {
  if (irf >= 50) return 'red';
  if (irf >= 25) return 'orange';
  return 'green';
}

export async function getWatchlist(period: string): Promise<WatchlistItem[]> {
  const cacheKey = `defisitwatch:watchlist:${period}`;
  return getCached<WatchlistItem[]>(cacheKey, async () => {
    const pool = getPgPool();

    // Current period amounts
    const currentSql = `
      SELECT r.id::text AS region_id, r.name AS region_name,
             COALESCE(m.amount, 0) AS amount
      FROM regions r
      LEFT JOIN mv_payments_with_cut m
        ON m.region_id = r.id AND m.period = ($1 || '-01')::date
      WHERE r.level = 2
    `;
    const { rows: currentRows } = await pool.query(currentSql, [period]);

    // Historical average (last 6 months)
    const [year, month] = period.split('-').map(Number);
    const sixMonthsAgo = new Date(Date.UTC(year, month - 7, 1));
    const fromPeriod = `${sixMonthsAgo.getUTCFullYear()}-${String(sixMonthsAgo.getUTCMonth() + 1).padStart(2, '0')}`;

    const avgSql = `
      SELECT region_id::text, AVG(amount) AS avg_amount, COUNT(*) AS month_count
      FROM mv_payments_with_cut
      WHERE period >= ($1 || '-01')::date AND period < ($2 || '-01')::date
      GROUP BY region_id
    `;
    const { rows: avgRows } = await pool.query(avgSql, [fromPeriod, period]);
    const avgMap = new Map<string, { avg: number; count: number }>(
      avgRows.map((r: Record<string, unknown>) => [r.region_id as string, { avg: Number(r.avg_amount), count: Number(r.month_count) }])
    );

    const results: WatchlistItem[] = currentRows.map((row: Record<string, unknown>) => {
      const { avg = 0, count = 0 } = avgMap.get(row.region_id as string) ?? {};
      const { irf, reasons } = computeIrf(Number(row.amount), avg, count);
      const category = getCategory(irf);
      return {
        regionId: row.region_id as string,
        regionName: row.region_name as string,
        irf,
        category,
        topReason: reasons[0] ?? 'Normal',
      };
    });

    // Sort by IRF descending (most at-risk first)
    return results.sort((a, b) => b.irf - a.irf);
  });
}

export async function getRegionDetail(regionId: string, period: string): Promise<RegionDetail> {
  const cacheKey = `defisitwatch:detail:${regionId}:${period}`;
  return getCached<RegionDetail>(cacheKey, async () => {
    const pool = getPgPool();

    const regionRes = await pool.query(
      'SELECT id::text, name FROM regions WHERE id = $1',
      [regionId]
    );
    if (regionRes.rows.length === 0) {
      throw new AppError('Region not found', 404);
    }
    const { name: regionName } = regionRes.rows[0];

    // Last 6 months data
    const [year, month] = period.split('-').map(Number);
    const sixMonthsAgo = new Date(Date.UTC(year, month - 7, 1));
    const fromPeriod = `${sixMonthsAgo.getUTCFullYear()}-${String(sixMonthsAgo.getUTCMonth() + 1).padStart(2, '0')}`;

    const historySql = `
      SELECT to_char(period, 'YYYY-MM') AS period, amount
      FROM mv_payments_with_cut
      WHERE region_id = $1
        AND period >= ($2 || '-01')::date
        AND period <= ($3 || '-01')::date
      ORDER BY period ASC
    `;
    const { rows: histRows } = await pool.query(historySql, [regionId, fromPeriod, period]);

    const amounts = histRows.map((r: Record<string, unknown>) => Number(r.amount));
    const avgAmount = amounts.length ? amounts.reduce((a, b) => a + b, 0) / amounts.length : 0;
    const currentAmount = amounts[amounts.length - 1] ?? 0;

    const { irf, reasons } = computeIrf(currentAmount, avgAmount, amounts.length);
    const category = getCategory(irf);

    // Projection: target = avg * 1.1, realization = actuals, kas = cumulative
    const target = amounts.map(() => Math.round(avgAmount * 1.1));
    const realization = amounts;
    const kas = amounts.reduce((acc: number[], val) => {
      acc.push((acc[acc.length - 1] ?? 0) + val);
      return acc;
    }, []);

    return {
      regionId,
      regionName,
      irf,
      category,
      reasons,
      projection: { target, realization, kas },
    };
  });
}

export async function invalidateDefisitwatchCache(): Promise<void> {
  await invalidateCacheByPrefix('defisitwatch');
}

export const defisitwatchService = { getWatchlist, getRegionDetail, invalidateDefisitwatchCache };
