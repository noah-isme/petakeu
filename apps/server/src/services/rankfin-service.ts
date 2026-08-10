import { getPgPool } from '../db/postgres';
import { getCached, invalidateCacheByPrefix } from '../db/redis';

export interface LeagueItem {
  regionId: string;
  regionName: string;
  score: number;
  tier: 'gold' | 'silver' | 'bronze';
  rank: number;
  badges: string[];
}

export async function getLeague(period: string): Promise<LeagueItem[]> {
  const cacheKey = `rankfin:league:${period}`;
  return getCached<LeagueItem[]>(cacheKey, async () => {
    const pool = getPgPool();

    // Last 3 months for scoring
    const [year, month] = period.split('-').map(Number);
    const threeMonthsAgo = new Date(Date.UTC(year, month - 4, 1));
    const fromPeriod = `${threeMonthsAgo.getUTCFullYear()}-${String(threeMonthsAgo.getUTCMonth() + 1).padStart(2, '0')}`;

    const sql = `
      SELECT
        r.id::text AS region_id,
        r.name AS region_name,
        SUM(m.amount) AS total_3m,
        COUNT(m.period) AS month_count
      FROM regions r
      LEFT JOIN mv_payments_with_cut m
        ON m.region_id = r.id
        AND m.period >= ($1 || '-01')::date
        AND m.period <= ($2 || '-01')::date
      WHERE r.level = 2
      GROUP BY r.id, r.name
      ORDER BY SUM(COALESCE(m.amount, 0)) DESC
    `;
    const { rows } = await pool.query(sql, [fromPeriod, period]);

    if (rows.length === 0) return [];

    const maxScore = Number(rows[0].total_3m ?? 0);

    return rows.map((row: Record<string, unknown>, index: number) => {
      const total = Number(row.total_3m ?? 0);
      const score = maxScore > 0 ? Math.round((total / maxScore) * 1000) : 0;
      const monthCount = Number(row.month_count ?? 0);

      let tier: 'gold' | 'silver' | 'bronze';
      if (index < rows.length * 0.1) tier = 'gold';
      else if (index < rows.length * 0.3) tier = 'silver';
      else tier = 'bronze';

      const badges: string[] = [];
      if (monthCount >= 3) badges.push('Konsisten');
      if (index === 0) badges.push('Terbaik Nasional');
      if (score >= 900) badges.push('Top Performer');

      return {
        regionId: row.region_id as string,
        regionName: row.region_name as string,
        score,
        tier,
        rank: index + 1,
        badges,
      };
    });
  });
}

export async function invalidateRankfinCache(): Promise<void> {
  await invalidateCacheByPrefix('rankfin');
}

export const rankfinService = { getLeague, invalidateRankfinCache };
