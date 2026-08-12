import { PassThrough, Writable } from 'stream';

import { Queue, Worker, Job } from 'bullmq';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';

import { getPgPool } from '../db/postgres';
import { uploadReportStream, getReportDownloadUrl } from '../services/storage-service';
import { parseReportBranding, MAX_REPORT_LOGO_BYTES } from '../validators/report';
import { logger } from '../utils/logger';
import { workerJobsTotal, workerJobDuration, reportsTotal } from '../utils/metrics';

import type {
  ReportAmountBasis,
  ReportBranding,
  ReportJobData,
  ReportRankingCriterion,
  ReportType,
} from '../types/report';

const QUEUE_NAME = 'report-generation';

let _queue: Queue | undefined;
export function getReportQueue(): Queue {
  if (!_queue) {
    _queue = new Queue(QUEUE_NAME, {
      connection: {
        url: process.env.REDIS_URL ?? 'redis://localhost:6379',
      },
    });
  }
  return _queue;
}
export const reportQueue = {
  add: (...args: Parameters<Queue['add']>) => getReportQueue().add(...args),
};

async function fetchReportData(
  pool: import('pg').Pool,
  period: string,
  regionIds: string[],
  options: {
    periodFrom?: string;
    periodTo?: string;
    provinceIds?: string[];
  } = {},
) {
  const periodFrom = options.periodFrom ?? period;
  const periodTo = options.periodTo ?? period;
  const values: unknown[] = [periodFrom, periodTo, regionIds];
  let provinceFilter = '';
  if (options.provinceIds && options.provinceIds.length > 0) {
    values.push(options.provinceIds);
    provinceFilter = ` AND r.parent_id = ANY($${values.length}::uuid[])`;
  }
  const sql = `
    WITH financials AS (
      SELECT
        p.region_id,
        date_trunc('month', p.period)::date AS period,
        SUM(COALESCE(p.gross_amount, p.amount)) AS gross_amount,
        SUM(COALESCE(p.share_amount, p.amount * 0.15)) AS share_amount,
        SUM(COALESCE(p.net_amount, p.amount - p.amount * 0.15)) AS net_amount
      FROM payments p
      GROUP BY p.region_id, date_trunc('month', p.period)::date
    ), months AS (
      SELECT generate_series(($1 || '-01')::date, ($2 || '-01')::date, INTERVAL '1 month')::date AS period
    )
    SELECT
      r.name AS region_name,
      r.id::text AS region_id,
      to_char(months.period, 'YYYY-MM') AS period,
      COALESCE(f.gross_amount, m.amount) AS amount,
      COALESCE(f.share_amount, m.cut_amount) AS cut_amount,
      COALESCE(f.net_amount, m.net_amount) AS net_amount,
      t.target AS target_amount,
      payment.source,
      payment.upload_id,
      u.filename,
      COALESCE(u.created_by, payment.imported_by) AS imported_by,
      COALESCE(u.created_at, payment.imported_at) AS imported_at,
      COALESCE(payment.validation_findings, '[]'::jsonb) AS validation_findings
    FROM regions r
    CROSS JOIN months
    LEFT JOIN mv_payments_with_cut m
      ON m.region_id = r.id AND m.period = months.period
    LEFT JOIN financials f
      ON f.region_id = r.id AND f.period = months.period
    LEFT JOIN revenue_targets t
      ON t.region_id = r.id AND t.period = months.period
    LEFT JOIN LATERAL (
      SELECT
        p.source,
        p.updated_at AS imported_at,
        COALESCE(p.upload_id::text, p.meta->>'uploadId', p.meta->>'upload_id') AS upload_id,
        COALESCE(p.meta->>'importedBy', p.meta->>'imported_by') AS imported_by,
        COALESCE(p.meta->'validationFindings', p.meta->'validation_findings', p.meta->'validationWarnings', '[]'::jsonb) AS validation_findings
      FROM payments p
      WHERE p.region_id = r.id AND date_trunc('month', p.period)::date = months.period
      ORDER BY p.updated_at DESC
      LIMIT 1
    ) payment ON TRUE
    LEFT JOIN uploads u ON u.id = CASE
      WHEN payment.upload_id ~ '^[0-9a-fA-F-]{36}$' THEN payment.upload_id::uuid
      ELSE NULL
    END
    WHERE r.id = ANY($3::uuid[])${provinceFilter}
    ORDER BY r.name, months.period
  `;
  const { rows } = await pool.query(sql, values);
  return rows;
}

/** Fetch top 10 regions by net_amount for the given period, with YoY comparison */
async function fetchTop10Rankings(
  pool: import('pg').Pool,
  period: string,
  options: {
    periodFrom?: string;
    periodTo?: string;
    provinceIds?: string[];
    amountBasis?: ReportAmountBasis;
    rankingCriterion?: ReportRankingCriterion;
  } = {},
) {
  const periodFrom = options.periodFrom ?? period;
  const periodTo = options.periodTo ?? period;
  const rangeMonths = monthDistance(periodFrom, periodTo);
  const previousFrom = addMonths(periodFrom, -rangeMonths);
  const previousTo = addMonths(periodTo, -rangeMonths);
  const amountExpression = options.amountBasis === 'share'
    ? 'COALESCE(f.share_amount, m.cut_amount)'
    : options.amountBasis === 'net' ? 'COALESCE(f.net_amount, m.net_amount)' : 'COALESCE(f.gross_amount, m.amount)';
  const criterion = options.rankingCriterion ?? 'total';
  const orderExpression = criterion === 'target_achievement' ? 'achievement_percentage'
    : criterion === 'average_monthly' ? 'average_monthly'
      : criterion === 'growth' ? 'growth_percentage'
        : criterion === 'surplus' ? 'surplus'
          : criterion === 'deficit' ? 'deficit' : 'actual';
  const orderDirection = criterion === 'deficit' ? 'ASC' : 'DESC';
  const provinceFilter = options.provinceIds?.length ? ' AND r.parent_id = ANY($5::uuid[])' : '';
  const values: unknown[] = [periodFrom, periodTo, previousFrom, previousTo];
  if (options.provinceIds?.length) values.push(options.provinceIds);

  const sql = `
    WITH financials AS (
      SELECT
        p.region_id,
        date_trunc('month', p.period)::date AS period,
        SUM(COALESCE(p.gross_amount, p.amount)) AS gross_amount,
        SUM(COALESCE(p.share_amount, p.amount * 0.15)) AS share_amount,
        SUM(COALESCE(p.net_amount, p.amount - p.amount * 0.15)) AS net_amount
      FROM payments p
      GROUP BY p.region_id, date_trunc('month', p.period)::date
    ), current AS (
      SELECT r.id::text AS region_id, r.name AS region_name,
             COALESCE(SUM(${amountExpression}) FILTER (WHERE m.period BETWEEN ($1 || '-01')::date AND ($2 || '-01')::date), 0) AS actual,
             COALESCE(SUM(${amountExpression}) FILTER (WHERE m.period BETWEEN ($3 || '-01')::date AND ($4 || '-01')::date), 0) AS previous_actual,
             COUNT(*) FILTER (WHERE m.period BETWEEN ($1 || '-01')::date AND ($2 || '-01')::date) AS reported_months,
             COALESCE((SELECT SUM(t.target) FROM revenue_targets t
                       WHERE t.region_id = r.id
                         AND t.period BETWEEN ($1 || '-01')::date AND ($2 || '-01')::date), 0) AS target
             ,CASE WHEN COUNT(*) FILTER (WHERE m.period BETWEEN ($1 || '-01')::date AND ($2 || '-01')::date) = 0 THEN 0
                ELSE COALESCE(SUM(${amountExpression}) FILTER (WHERE m.period BETWEEN ($1 || '-01')::date AND ($2 || '-01')::date), 0)
                  / COUNT(*) FILTER (WHERE m.period BETWEEN ($1 || '-01')::date AND ($2 || '-01')::date) END AS average_monthly
             ,CASE WHEN COALESCE((SELECT SUM(t.target) FROM revenue_targets t
                       WHERE t.region_id = r.id
                         AND t.period BETWEEN ($1 || '-01')::date AND ($2 || '-01')::date), 0) = 0 THEN 0
                ELSE COALESCE(SUM(${amountExpression}) FILTER (WHERE m.period BETWEEN ($1 || '-01')::date AND ($2 || '-01')::date), 0)
                  / (SELECT SUM(t.target) FROM revenue_targets t
                       WHERE t.region_id = r.id
                         AND t.period BETWEEN ($1 || '-01')::date AND ($2 || '-01')::date) * 100 END AS achievement_percentage
             ,CASE WHEN COALESCE(SUM(${amountExpression}) FILTER (WHERE m.period BETWEEN ($3 || '-01')::date AND ($4 || '-01')::date), 0) = 0 THEN 0
                ELSE (COALESCE(SUM(${amountExpression}) FILTER (WHERE m.period BETWEEN ($1 || '-01')::date AND ($2 || '-01')::date), 0)
                  - COALESCE(SUM(${amountExpression}) FILTER (WHERE m.period BETWEEN ($3 || '-01')::date AND ($4 || '-01')::date), 0))
                  / COALESCE(SUM(${amountExpression}) FILTER (WHERE m.period BETWEEN ($3 || '-01')::date AND ($4 || '-01')::date), 0) * 100 END AS growth_percentage
             ,GREATEST(COALESCE(SUM(${amountExpression}) FILTER (WHERE m.period BETWEEN ($1 || '-01')::date AND ($2 || '-01')::date), 0)
               - COALESCE((SELECT SUM(t.target) FROM revenue_targets t WHERE t.region_id = r.id
                    AND t.period BETWEEN ($1 || '-01')::date AND ($2 || '-01')::date), 0), 0) AS surplus
             ,LEAST(COALESCE(SUM(${amountExpression}) FILTER (WHERE m.period BETWEEN ($1 || '-01')::date AND ($2 || '-01')::date), 0)
               - COALESCE((SELECT SUM(t.target) FROM revenue_targets t WHERE t.region_id = r.id
                    AND t.period BETWEEN ($1 || '-01')::date AND ($2 || '-01')::date), 0), 0) AS deficit
      FROM regions r
      LEFT JOIN mv_payments_with_cut m
        ON m.region_id = r.id
       AND m.period BETWEEN ($3 || '-01')::date AND ($2 || '-01')::date
      LEFT JOIN financials f ON f.region_id = r.id AND f.period = m.period
      WHERE r.level = 2${provinceFilter}
      GROUP BY r.id, r.name
    )
    SELECT
      c.region_id, c.region_name,
      c.actual AS amount,
      c.actual AS net_amount,
      c.previous_actual AS net_amount_prev,
      CASE WHEN c.previous_actual = 0 THEN NULL
        ELSE ROUND(((c.actual - c.previous_actual) / c.previous_actual * 100)::numeric, 2) END AS yoy_pct,
      c.target,
      c.reported_months,
      c.average_monthly,
      c.achievement_percentage,
      c.growth_percentage,
      c.surplus,
      c.deficit,
      c.${orderExpression} AS ranking_value
    FROM current c
    ORDER BY c.${orderExpression} ${orderDirection}, c.region_name ASC
    LIMIT 10
  `;
  const { rows } = await pool.query(sql, values);
  return rows;
}

function addMonths(period: string, offset: number): string {
  const [year, month] = period.split('-').map(Number);
  const absolute = year * 12 + month - 1 + offset;
  return `${Math.floor(absolute / 12).toString().padStart(4, '0')}-${String((absolute % 12) + 1).padStart(2, '0')}`;
}

function monthDistance(from: string, to: string): number {
  const [fromYear, fromMonth] = from.split('-').map(Number);
  const [toYear, toMonth] = to.split('-').map(Number);
  return (toYear - fromYear) * 12 + toMonth - fromMonth + 1;
}

interface ReportRow {
  region_name: string;
  region_id?: string;
  province_id?: string | null;
  province_name?: string | null;
  period?: string | null;
  amount: string | number | null;
  cut_amount: string | number | null;
  net_amount: string | number | null;
  target_amount?: string | number | null;
  source?: string | null;
  upload_id?: string | null;
  filename?: string | null;
  imported_by?: string | null;
  imported_at?: string | Date | null;
  validation_findings?: unknown;
}

interface RankingRow {
  rank?: number;
  region_id: string;
  region_name: string;
  amount: string | number;
  net_amount: string | number;
  net_amount_prev: string | number;
  yoy_pct: string | number | null;
}

/** Empty branding preserves the original unbranded PDF output. */
export const DEFAULT_REPORT_BRANDING: ReportBranding = Object.freeze({});

function decodeSafeLogo(branding: ReportBranding): Buffer | undefined {
  const dataUri = branding.logo?.dataUri;
  if (!dataUri) {
    return undefined;
  }

  // Defense in depth for jobs added directly to BullMQ or produced before
  // request validation. No URL or filesystem input is ever passed to PDFKit.
  const match = /^data:(image\/(?:png|jpeg));base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUri);
  if (!match || match[2].length % 4 !== 0) {
    return undefined;
  }

  const bytes = Buffer.from(match[2], 'base64');
  if (bytes.length === 0 || bytes.length > MAX_REPORT_LOGO_BYTES) {
    return undefined;
  }

  const magic = match[1] === 'image/png'
    ? Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    : Buffer.from([0xff, 0xd8, 0xff]);

  return bytes.subarray(0, magic.length).equals(magic) ? bytes : undefined;
}

function applyHeaderStyle(row: ExcelJS.Row, argbColor = 'FF2563EB') {
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argbColor } };
  row.alignment = { vertical: 'middle' };
}

async function generateExcelStream(
  period: string,
  rows: ReportRow[],
  rankings: RankingRow[],
  stream: Writable,
  options: {
    periodFrom?: string;
    periodTo?: string;
    amountBasis?: ReportAmountBasis;
    rankingCriterion?: ReportRankingCriterion;
    reportType?: ReportType;
  } = {},
): Promise<void> {
  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
    stream,
    useStyles: true,
    useSharedStrings: false,
  });

  // ── Sheet 1: Per-region payment summary ───────────────────────────────────
  const sheet = workbook.addWorksheet(`Setoran ${period}`);
  sheet.columns = [
    { header: 'Wilayah', key: 'region_name', width: 32 },
    { header: 'Total Setoran (IDR)', key: 'amount', width: 22 },
    { header: 'Potongan 15% (IDR)', key: 'cut_amount', width: 22 },
    { header: 'Neto (IDR)', key: 'net_amount', width: 22 },
  ];
  const headerRow1 = sheet.getRow(1);
  applyHeaderStyle(headerRow1);
  headerRow1.commit();

  for (const row of rows) {
    const r = sheet.addRow({
      region_name: row.region_name,
      amount: Number(row.amount),
      cut_amount: Number(row.cut_amount),
      net_amount: Number(row.net_amount),
    });
    r.commit();
  }

  const total = rows.reduce((acc, r) => acc + Number(r.amount), 0);
  const totalCut = rows.reduce((acc, r) => acc + Number(r.cut_amount), 0);
  const totalNet = rows.reduce((acc, r) => acc + Number(r.net_amount), 0);
  const totalsRow = sheet.addRow({
    region_name: 'TOTAL',
    amount: total,
    cut_amount: totalCut,
    net_amount: totalNet,
  });
  totalsRow.font = { bold: true };
  totalsRow.commit();
  sheet.commit();

  // ── Sheet 2: Top 10 Rankings with YoY comparison ──────────────────────────
  const rankSheet = workbook.addWorksheet('Top 10 Peringkat');
  rankSheet.columns = [
    { header: 'Peringkat', key: 'rank', width: 12 },
    { header: 'Wilayah', key: 'region_name', width: 32 },
    { header: 'Neto Bulan Ini (IDR)', key: 'net_amount', width: 24 },
    { header: 'Neto Tahun Lalu (IDR)', key: 'net_amount_prev', width: 24 },
    { header: 'YoY (%)', key: 'yoy_pct', width: 14 },
  ];
  const headerRow2 = rankSheet.getRow(1);
  applyHeaderStyle(headerRow2, 'FF059669');
  headerRow2.commit();

  rankings.forEach((r, idx) => {
    const dataRow = rankSheet.addRow({
      rank: idx + 1,
      region_name: r.region_name,
      net_amount: Number(r.net_amount),
      net_amount_prev: Number(r.net_amount_prev ?? 0),
      yoy_pct: r.yoy_pct !== null ? Number(r.yoy_pct) : 'N/A',
    });
    const yoyCell = dataRow.getCell('yoy_pct');
    if (typeof yoyCell.value === 'number') {
      yoyCell.font = { color: { argb: yoyCell.value >= 0 ? 'FF059669' : 'FFDC2626' } };
    }
    dataRow.commit();
  });
  rankSheet.commit();

  // ── Sheet 3: Executive summary ────────────────────────────────────────────
  const summarySheet = workbook.addWorksheet('Executive Summary');
  summarySheet.columns = [
    { header: 'Indikator', key: 'label', width: 32 },
    { header: 'Nilai', key: 'value', width: 28 },
  ];
  applyHeaderStyle(summarySheet.getRow(1), 'FF7C3AED');
  summarySheet.getRow(1).commit();
  const sumGross = rows.reduce((total, row) => total + Number(row.amount ?? 0), 0);
  const sumShare = rows.reduce((total, row) => total + Number(row.cut_amount ?? 0), 0);
  const sumNet = rows.reduce((total, row) => total + Number(row.net_amount ?? 0), 0);
  const missingCount = rows.filter((row) => row.amount === null || row.amount === undefined).length;
  [
    ['Periode dari', options.periodFrom ?? period],
    ['Periode sampai', options.periodTo ?? period],
    ['Basis nominal', options.amountBasis ?? 'gross'],
    ['Kriteria ranking', options.rankingCriterion ?? 'total'],
    ['Jenis laporan', options.reportType ?? 'full'],
    ['Total gross (IDR)', sumGross],
    ['Total share (IDR)', sumShare],
    ['Total net (IDR)', sumNet],
    ['Data belum dilaporkan', missingCount],
  ].forEach(([label, value]) => summarySheet.addRow({ label, value }).commit());
  summarySheet.commit();

  // ── Sheet 4: Canonical rankings ───────────────────────────────────────────
  const rankingsSheet = workbook.addWorksheet('Rankings');
  rankingsSheet.columns = [
    { header: 'Peringkat', key: 'rank', width: 12 },
    { header: 'Region ID', key: 'region_id', width: 38 },
    { header: 'Wilayah', key: 'region_name', width: 32 },
    { header: 'Nilai Ranking', key: 'ranking_value', width: 20 },
    { header: 'Realisasi (IDR)', key: 'amount', width: 20 },
    { header: 'Target (IDR)', key: 'target', width: 20 },
    { header: 'Capaian (%)', key: 'achievement', width: 16 },
    { header: 'YoY (%)', key: 'yoy', width: 14 },
  ];
  applyHeaderStyle(rankingsSheet.getRow(1), 'FF059669');
  rankingsSheet.getRow(1).commit();
  rankings.forEach((row, index) => rankingsSheet.addRow({
    rank: index + 1,
    region_id: row.region_id,
    region_name: row.region_name,
    ranking_value: Number((row as RankingRow & { ranking_value?: string | number }).ranking_value ?? row.net_amount ?? 0),
    amount: Number(row.amount ?? 0),
    target: Number((row as RankingRow & { target?: string | number }).target ?? 0),
    achievement: Number((row as RankingRow & { achievement_percentage?: string | number }).achievement_percentage ?? 0),
    yoy: row.yoy_pct === null ? 'N/A' : Number(row.yoy_pct),
  }).commit());
  rankingsSheet.commit();

  // ── Sheet 5: Monthly breakdown ────────────────────────────────────────────
  const monthlySheet = workbook.addWorksheet('Monthly Breakdown');
  monthlySheet.columns = [
    { header: 'Periode', key: 'period', width: 14 },
    { header: 'Gross (IDR)', key: 'gross', width: 22 },
    { header: 'Share (IDR)', key: 'share', width: 22 },
    { header: 'Net (IDR)', key: 'net', width: 22 },
    { header: 'Target (IDR)', key: 'target', width: 22 },
    { header: 'Data Dilaporkan', key: 'reported', width: 18 },
  ];
  applyHeaderStyle(monthlySheet.getRow(1), 'FF0EA5E9');
  monthlySheet.getRow(1).commit();
  const monthly = new Map<string, { gross: number; share: number; net: number; target: number; reported: number }>();
  rows.forEach((row) => {
    const key = row.period ?? period;
    const current = monthly.get(key) ?? { gross: 0, share: 0, net: 0, target: 0, reported: 0 };
    current.gross += Number(row.amount ?? 0);
    current.share += Number(row.cut_amount ?? 0);
    current.net += Number(row.net_amount ?? 0);
    current.target += Number(row.target_amount ?? 0);
    if (row.amount !== null && row.amount !== undefined) current.reported += 1;
    monthly.set(key, current);
  });
  [...monthly.entries()].sort(([left], [right]) => left.localeCompare(right)).forEach(([month, values]) => {
    monthlySheet.addRow({ period: month, ...values }).commit();
  });
  monthlySheet.commit();

  // ── Sheet 6: Target achievement ───────────────────────────────────────────
  const targetSheet = workbook.addWorksheet('Target Achievement');
  targetSheet.columns = [
    { header: 'Region ID', key: 'region_id', width: 38 },
    { header: 'Wilayah', key: 'region_name', width: 32 },
    { header: 'Realisasi (IDR)', key: 'actual', width: 22 },
    { header: 'Target (IDR)', key: 'target', width: 22 },
    { header: 'Capaian (%)', key: 'achievement', width: 16 },
    { header: 'Selisih (IDR)', key: 'variance', width: 22 },
  ];
  applyHeaderStyle(targetSheet.getRow(1), 'FFF59E0B');
  targetSheet.getRow(1).commit();
  const targets = new Map<string, { region_name: string; actual: number; target: number }>();
  rows.forEach((row) => {
    const key = row.region_id ?? row.region_name;
    const current = targets.get(key) ?? { region_name: row.region_name, actual: 0, target: 0 };
    current.actual += Number(row.amount ?? 0);
    current.target += Number(row.target_amount ?? 0);
    targets.set(key, current);
  });
  [...targets.entries()].forEach(([region_id, value]) => targetSheet.addRow({
    region_id,
    region_name: value.region_name,
    actual: value.actual,
    target: value.target,
    achievement: value.target === 0 ? 0 : Number(((value.actual / value.target) * 100).toFixed(2)),
    variance: value.actual - value.target,
  }).commit());
  targetSheet.commit();

  // ── Sheet 7: Missing-data audit ───────────────────────────────────────────
  const missingSheet = workbook.addWorksheet('Missing Data Audit');
  missingSheet.columns = [
    { header: 'Periode', key: 'period', width: 14 },
    { header: 'Region ID', key: 'region_id', width: 38 },
    { header: 'Wilayah', key: 'region_name', width: 32 },
    { header: 'Status', key: 'status', width: 16 },
    { header: 'Temuan Validasi', key: 'findings', width: 52 },
  ];
  applyHeaderStyle(missingSheet.getRow(1), 'FFDC2626');
  missingSheet.getRow(1).commit();
  rows.filter((row) => row.amount === null || row.amount === undefined).forEach((row) => missingSheet.addRow({
    period: row.period ?? period,
    region_id: row.region_id ?? '',
    region_name: row.region_name,
    status: 'missing',
    findings: JSON.stringify(row.validation_findings ?? []),
  }).commit());
  missingSheet.commit();

  // ── Sheet 8: Canonical re-import contract ──────────────────────────────────
  const canonicalSheet = workbook.addWorksheet('Canonical Data');
  canonicalSheet.columns = [
    { header: 'period', key: 'period', width: 14 },
    { header: 'region_id', key: 'region_id', width: 38 },
    { header: 'region_name', key: 'region_name', width: 32 },
    { header: 'province_id', key: 'province_id', width: 38 },
    { header: 'province_name', key: 'province_name', width: 28 },
    { header: 'gross_amount', key: 'gross_amount', width: 20 },
    { header: 'share_amount', key: 'share_amount', width: 20 },
    { header: 'net_amount', key: 'net_amount', width: 20 },
    { header: 'target_amount', key: 'target_amount', width: 20 },
    { header: 'source', key: 'source', width: 18 },
    { header: 'upload_id', key: 'upload_id', width: 38 },
    { header: 'filename', key: 'filename', width: 32 },
    { header: 'imported_by', key: 'imported_by', width: 24 },
    { header: 'imported_at', key: 'imported_at', width: 26 },
    { header: 'validation_findings', key: 'validation_findings', width: 52 },
  ];
  applyHeaderStyle(canonicalSheet.getRow(1), 'FF374151');
  canonicalSheet.getRow(1).commit();
  rows.forEach((row) => canonicalSheet.addRow({
    period: row.period ?? period,
    region_id: row.region_id ?? '',
    region_name: row.region_name,
    province_id: row.province_id ?? '',
    province_name: row.province_name ?? '',
    gross_amount: row.amount === null ? null : Number(row.amount),
    share_amount: row.cut_amount === null ? null : Number(row.cut_amount),
    net_amount: row.net_amount === null ? null : Number(row.net_amount),
    target_amount: row.target_amount === null || row.target_amount === undefined ? null : Number(row.target_amount),
    source: row.source ?? '',
    upload_id: row.upload_id ?? '',
    filename: row.filename ?? '',
    imported_by: row.imported_by ?? '',
    imported_at: row.imported_at ? new Date(row.imported_at).toISOString() : '',
    validation_findings: JSON.stringify(row.validation_findings ?? []),
  }).commit());
  canonicalSheet.commit();

  await workbook.commit();
}

export async function generatePdfStream(
  period: string,
  rows: ReportRow[],
  rankings: RankingRow[],
  stream: Writable,
  branding: ReportBranding = DEFAULT_REPORT_BRANDING,
  options: {
    periodFrom?: string;
    periodTo?: string;
    amountBasis?: ReportAmountBasis;
    rankingCriterion?: ReportRankingCriterion;
    reportType?: ReportType;
  } = {},
): Promise<void> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40 });
    const logo = decodeSafeLogo(branding);
    const pageLeft = 40;
    const pageRight = () => doc.page.width - 40;
    const contentBottom = () => doc.page.height - 72;

    doc.on('error', reject);
    stream.on('error', reject);
    stream.on('finish', resolve);

    doc.pipe(stream);

    const fmt = (n: number) => new Intl.NumberFormat('id-ID').format(n);

    const drawFooter = () => {
      if (!branding.footer) {
        return;
      }

      doc.save();
      doc.font('Helvetica').fontSize(8).fillColor('#4B5563');
      doc.text(branding.footer, pageLeft, doc.page.height - 42, {
        width: doc.page.width - 80,
        align: 'center',
        lineBreak: false,
      });
      doc.restore();
    };

    const drawHeader = () => {
      if (!branding.organizationName && !branding.header && !logo) {
        return;
      }

      const textX = logo ? 112 : pageLeft;
      const textWidth = pageRight() - textX;

      if (logo) {
        doc.image(logo, pageLeft, 36, { fit: [56, 56] });
      }
      if (branding.organizationName) {
        doc.font('Helvetica-Bold').fontSize(12).fillColor('#111827');
        doc.text(branding.organizationName, textX, 42, {
          width: textWidth,
          align: logo ? 'left' : 'center',
          lineBreak: false,
        });
      }
      if (branding.header) {
        doc.font('Helvetica').fontSize(9).fillColor('#374151');
        doc.text(branding.header, textX, branding.organizationName ? 61 : 46, {
          width: textWidth,
          align: logo ? 'left' : 'center',
          lineBreak: false,
        });
      }

      doc.save();
      doc.moveTo(pageLeft, 104).lineTo(pageRight(), 104).strokeColor('#D1D5DB').stroke();
      doc.restore();
      doc.y = 116;
    };

    const startNewPage = () => {
      drawFooter();
      doc.addPage();
      drawHeader();
    };

    const drawRegionTableHeader = (headerY: number) => {
      const col1 = 40, col2 = 230, col3 = 340, col4 = 450;
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#000000');
      doc.text('Wilayah', col1, headerY);
      doc.text('Total (IDR)', col2, headerY);
      doc.text('Potongan (IDR)', col3, headerY);
      doc.text('Neto (IDR)', col4, headerY);
    };

    const drawRankingTableHeader = (headerY: number) => {
      const rc1 = 40, rc2 = 60, rc3 = 230, rc4 = 360, rc5 = 470;
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#000000');
      doc.text('#', rc1, headerY);
      doc.text('Wilayah', rc2, headerY);
      doc.text('Neto Ini (IDR)', rc3, headerY);
      doc.text('Neto Lalu (IDR)', rc4, headerY);
      doc.text('YoY (%)', rc5, headerY);
    };

    drawHeader();

    // ── Cover / title ─────────────────────────────────────────────────────
    doc.fontSize(18).font('Helvetica-Bold').text('Laporan Setoran Dana Bagi Hasil', { align: 'center' });
    doc.fontSize(12).font('Helvetica').text(
      `Periode: ${options.periodFrom ?? period}${options.periodTo && options.periodTo !== (options.periodFrom ?? period) ? ` s.d. ${options.periodTo}` : ''}`,
      { align: 'center' },
    );
    doc.fontSize(9).font('Helvetica').text(
      `Basis: ${options.amountBasis ?? 'gross'} · Kriteria: ${options.rankingCriterion ?? 'total'}`,
      { align: 'center' },
    );
    doc.moveDown();

    // Executive scorecard. The detailed tables below retain the original
    // report layout while these bounded lines make range exports useful to
    // decision makers and remain readable in text-only PDF consumers.
    const grossTotal = rows.reduce((total, row) => total + Number(row.amount ?? 0), 0);
    const netTotal = rows.reduce((total, row) => total + Number(row.net_amount ?? 0), 0);
    const missingTotal = rows.filter((row) => row.amount === null || row.amount === undefined).length;
    doc.fontSize(12).font('Helvetica-Bold').text('Ringkasan Eksekutif');
    doc.fontSize(9).font('Helvetica')
      .text(`Gross: ${fmt(grossTotal)} IDR    Neto: ${fmt(netTotal)} IDR    Belum dilaporkan: ${missingTotal}`);
    doc.moveDown(0.4);

    // ── Section 1: Per-region payment table ───────────────────────────────
    doc.fontSize(13).font('Helvetica-Bold').text('Realisasi Setoran per Wilayah');
    doc.moveDown(0.4);

    const col1 = 40, col2 = 230, col3 = 340, col4 = 450;
    let y = doc.y + 6;
    drawRegionTableHeader(y);
    y += 18;

    doc.font('Helvetica').fontSize(9);
    for (const row of rows) {
      if (y + 16 > contentBottom()) {
        startNewPage();
        y = doc.y + 6;
        drawRegionTableHeader(y);
        y += 18;
        doc.font('Helvetica').fontSize(9);
      }

      doc.text(String(row.region_name).slice(0, 30), col1, y);
      doc.text(fmt(Number(row.amount)), col2, y);
      doc.text(fmt(Number(row.cut_amount)), col3, y);
      doc.text(fmt(Number(row.net_amount)), col4, y);
      y += 16;
    }

    // Grand totals
    const totalNet = rows.reduce((acc, r) => acc + Number(r.net_amount), 0);
    y += 6;
    if (y + 18 > contentBottom()) {
      startNewPage();
      y = doc.y + 6;
      drawRegionTableHeader(y);
      y += 18;
    }

    doc.font('Helvetica-Bold').fontSize(9);
    doc.text('TOTAL', col1, y);
    doc.text(fmt(rows.reduce((acc, r) => acc + Number(r.amount), 0)), col2, y);
    doc.text(fmt(rows.reduce((acc, r) => acc + Number(r.cut_amount), 0)), col3, y);
    doc.text(fmt(totalNet), col4, y);

    // ── Section 2: Top 10 Regional Rankings ──────────────────────────────
    startNewPage();
    doc.fontSize(13).font('Helvetica-Bold').text('10 Besar Kabupaten/Kota — Setoran Neto');
    doc.fontSize(10).font('Helvetica').text(`(Perbandingan YoY terhadap periode ${period.split('-')[0] && String(parseInt(period.split('-')[0], 10) - 1)}-${period.split('-')[1]})`);
    doc.moveDown(0.5);

    const rc1 = 40, rc2 = 60, rc3 = 230, rc4 = 360, rc5 = 470;
    y = doc.y + 6;
    drawRankingTableHeader(y);
    y += 18;

    doc.font('Helvetica').fontSize(9);
    rankings.forEach((r, idx) => {
      if (y + 16 > contentBottom()) {
        startNewPage();
        y = doc.y + 6;
        drawRankingTableHeader(y);
        y += 18;
        doc.font('Helvetica').fontSize(9);
      }

      const yoy = r.yoy_pct !== null ? `${Number(r.yoy_pct) >= 0 ? '+' : ''}${Number(r.yoy_pct).toFixed(2)}%` : 'N/A';
      doc.text(String(idx + 1), rc1, y);
      doc.text(String(r.region_name).slice(0, 25), rc2, y);
      doc.text(fmt(Number(r.net_amount)), rc3, y);
      doc.text(fmt(Number(r.net_amount_prev ?? 0)), rc4, y);
      doc.text(yoy, rc5, y);
      y += 16;
    });

    // Range/missing-data summary sections are intentionally compact; the
    // workbook carries the row-level canonical data and audit detail.
    startNewPage();
    doc.fontSize(13).font('Helvetica-Bold').text('Ringkasan Bulanan dan Audit Data');
    doc.moveDown(0.4);
    const monthly = new Map<string, { gross: number; net: number; target: number; reported: number }>();
    rows.forEach((row) => {
      const month = row.period ?? period;
      const current = monthly.get(month) ?? { gross: 0, net: 0, target: 0, reported: 0 };
      current.gross += Number(row.amount ?? 0);
      current.net += Number(row.net_amount ?? 0);
      current.target += Number(row.target_amount ?? 0);
      if (row.amount !== null && row.amount !== undefined) current.reported += 1;
      monthly.set(month, current);
    });
    doc.font('Helvetica-Bold').fontSize(10).text('Periode       Gross (IDR)       Neto (IDR)       Target (IDR)       Dilaporkan');
    doc.font('Helvetica').fontSize(9);
    [...monthly.entries()].sort(([left], [right]) => left.localeCompare(right)).forEach(([month, value]) => {
      if (y + 16 > contentBottom()) {
        startNewPage();
        y = doc.y + 6;
      }
      doc.text(`${month}    ${fmt(value.gross)}    ${fmt(value.net)}    ${fmt(value.target)}    ${value.reported}`);
      y = doc.y + 4;
    });

    if (branding.signatureText) {
      if (y + 78 > contentBottom()) {
        startNewPage();
        y = doc.y + 12;
      } else {
        y += 28;
      }

      const signatureX = 330;
      doc.font('Helvetica-Bold').fontSize(9).text('Penandatangan Resmi', signatureX, y, {
        width: 220,
        align: 'center',
      });
      doc.moveTo(signatureX + 30, y + 42).lineTo(signatureX + 190, y + 42).strokeColor('#6B7280').stroke();
      doc.font('Helvetica').fontSize(9).text(branding.signatureText, signatureX, y + 50, {
        width: 220,
        align: 'center',
      });
    }

    drawFooter();
    doc.end();
  });
}

export async function generateReport(job: Job<ReportJobData>): Promise<void> {
  const startTime = Date.now();
  const {
    jobId,
    period,
    regionIds,
    format,
    branding: requestedBranding,
    periodFrom,
    periodTo,
    provinceIds,
    rankingCriterion,
    amountBasis,
    reportType,
  } = job.data;
  const branding = format === 'pdf' ? parseReportBranding(requestedBranding) : undefined;
  const metricFormat: 'pdf' | 'excel' | 'other' = format === 'pdf' || format === 'excel' ? format : 'other';
  const pool = getPgPool();

  await pool.query(
    `UPDATE report_jobs SET status = 'processing', updated_at = NOW() WHERE id = $1`,
    [jobId]
  );

  try {
    const [rows, rankings] = await Promise.all([
      fetchReportData(pool, period, regionIds, { periodFrom, periodTo, provinceIds }),
      fetchTop10Rankings(pool, period, {
        periodFrom,
        periodTo,
        provinceIds,
        amountBasis,
        rankingCriterion,
      }),
    ]);

    let contentType: string;
    let extension: string;

    if (format === 'excel') {
      contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      extension = 'xlsx';
    } else {
      contentType = 'application/pdf';
      extension = 'pdf';
    }

    const key = `${jobId}.${extension}`;

    // V8 HEAP MEMORY OPTIMIZATION RATIONALE:
    // Instead of buffering the entire Excel or PDF document in Node.js V8 heap memory before uploading to S3/MinIO,
    // we create a PassThrough stream and stream chunks directly to storage in parallel with generation.
    // This keeps peak memory consumption down to O(Stream Buffer Size) (~64 KB) instead of O(File Size + AST),
    // preventing V8 heap memory exhaustion during large multi-region dataset exports.
    const passThrough = new PassThrough();

    const uploadPromise = uploadReportStream(key, passThrough, contentType);

    const generationPromise = (async () => {
      try {
        if (format === 'excel') {
          await generateExcelStream(period, rows, rankings, passThrough, {
            periodFrom,
            periodTo,
            amountBasis,
            rankingCriterion,
            reportType,
          });
        } else {
          await generatePdfStream(period, rows, rankings, passThrough, branding, {
            periodFrom,
            periodTo,
            amountBasis,
            rankingCriterion,
            reportType,
          });
        }
      } catch (err) {
        passThrough.destroy(err instanceof Error ? err : new Error(String(err)));
        throw err;
      }
    })();

    await Promise.all([generationPromise, uploadPromise]);

    const downloadUrl = await getReportDownloadUrl(key);

    // Build summary with top-10 rankings
    const summary = {
      totalsByRegion: rows.map((r) => ({
        regionId: r.region_id,
        regionName: r.region_name,
        total: Number(r.amount),
        net: Number(r.net_amount),
      })),
      top10Rankings: rankings.map((r, idx) => ({
        rank: idx + 1,
        regionId: r.region_id,
        regionName: r.region_name,
        netAmount: Number(r.net_amount),
        netAmountPrev: Number(r.net_amount_prev ?? 0),
        yoyPct: r.yoy_pct !== null ? Number(r.yoy_pct) : null,
      })),
      filters: {
        periodFrom: periodFrom ?? period,
        periodTo: periodTo ?? period,
        provinceIds: provinceIds ?? [],
        rankingCriterion: rankingCriterion ?? 'total',
        amountBasis: amountBasis ?? 'gross',
        reportType: reportType ?? 'full',
      },
      missingData: {
        expected: rows.length,
        reported: rows.filter((row: ReportRow) => row.amount !== null && row.amount !== undefined).length,
        missing: rows.filter((row: ReportRow) => row.amount === null || row.amount === undefined).length,
      },
    };

    await pool.query(
      `UPDATE report_jobs
       SET status = 'completed', download_url = $2, summary = $3, updated_at = NOW()
       WHERE id = $1`,
      [jobId, downloadUrl, JSON.stringify(summary)]
    );

    reportsTotal.inc({ format: metricFormat, status: 'completed' });
    workerJobsTotal.inc({ worker: 'report', status: 'success' });
    logger.info(
      { jobId, format: metricFormat, period, regionCount: regionIds.length, status: 'success', duration_ms: Date.now() - startTime },
      '[report-worker] Job completed'
    );
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Report generation failed';
    await pool.query(
      `UPDATE report_jobs SET status = 'failed', error = $2, updated_at = NOW() WHERE id = $1`,
      [jobId, errMsg]
    );
    reportsTotal.inc({ format: metricFormat, status: 'failed' });
    workerJobsTotal.inc({ worker: 'report', status: 'failed' });
    logger.error(
      { jobId, err, format: metricFormat, period, status: 'failed', duration_ms: Date.now() - startTime },
      '[report-worker] Job failed'
    );
    throw err;
  } finally {
    workerJobDuration.observe({ worker: 'report', job_type: metricFormat }, (Date.now() - startTime) / 1000);
  }
}

export function startReportWorker() {
  const worker = new Worker<ReportJobData>(QUEUE_NAME, generateReport, {
    connection: {
      url: process.env.REDIS_URL ?? 'redis://localhost:6379',
    },
    concurrency: 1,
  });

  worker.on('completed', (job) => {
    logger.info({ jobId: job.id }, '[report-worker] Job completed');
  });
  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err }, '[report-worker] Job failed');
  });

  logger.info('[report-worker] Started');
  return worker;
}
