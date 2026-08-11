import { PassThrough, Writable } from 'stream';

import { Queue, Worker, Job } from 'bullmq';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';

import { getPgPool } from '../db/postgres';
import { uploadReportStream, getReportDownloadUrl } from '../services/storage-service';
import { parseReportBranding, MAX_REPORT_LOGO_BYTES } from '../validators/report';
import { logger } from '../utils/logger';
import { workerJobsTotal, workerJobDuration, reportsTotal } from '../utils/metrics';

import type { ReportBranding, ReportJobData } from '../types/report';

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
  regionIds: string[]
) {
  const sql = `
    SELECT
      r.name AS region_name,
      r.id::text AS region_id,
      COALESCE(m.amount, 0) AS amount,
      COALESCE(m.cut_amount, 0) AS cut_amount,
      COALESCE(m.net_amount, 0) AS net_amount
    FROM regions r
    LEFT JOIN mv_payments_with_cut m
      ON m.region_id = r.id AND m.period = ($1 || '-01')::date
    WHERE r.id = ANY($2::uuid[])
    ORDER BY r.name
  `;
  const { rows } = await pool.query(sql, [period, regionIds]);
  return rows;
}

/** Fetch top 10 regions by net_amount for the given period, with YoY comparison */
async function fetchTop10Rankings(
  pool: import('pg').Pool,
  period: string
) {
  // Compute previous year same month
  const [year, month] = period.split('-');
  const prevPeriod = `${parseInt(year, 10) - 1}-${month}`;

  const sql = `
    WITH current AS (
      SELECT r.id::text AS region_id, r.name AS region_name,
             COALESCE(m.amount, 0) AS amount,
             COALESCE(m.net_amount, 0) AS net_amount
      FROM regions r
      LEFT JOIN mv_payments_with_cut m
        ON m.region_id = r.id AND m.period = ($1 || '-01')::date
      WHERE r.level = 2
    ),
    previous AS (
      SELECT r.id::text AS region_id, COALESCE(m.net_amount, 0) AS net_amount_prev
      FROM regions r
      LEFT JOIN mv_payments_with_cut m
        ON m.region_id = r.id AND m.period = ($2 || '-01')::date
      WHERE r.level = 2
    )
    SELECT
      c.region_id,
      c.region_name,
      c.amount,
      c.net_amount,
      p.net_amount_prev,
      CASE
        WHEN COALESCE(p.net_amount_prev, 0) = 0 THEN NULL
        ELSE ROUND(((c.net_amount - p.net_amount_prev) / p.net_amount_prev * 100)::numeric, 2)
      END AS yoy_pct
    FROM current c
    LEFT JOIN previous p ON p.region_id = c.region_id
    ORDER BY c.net_amount DESC
    LIMIT 10
  `;
  const { rows } = await pool.query(sql, [period, prevPeriod]);
  return rows;
}

interface ReportRow {
  region_name: string;
  region_id?: string;
  amount: string | number;
  cut_amount: string | number;
  net_amount: string | number;
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
  stream: Writable
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

  await workbook.commit();
}

export async function generatePdfStream(
  period: string,
  rows: ReportRow[],
  rankings: RankingRow[],
  stream: Writable,
  branding: ReportBranding = DEFAULT_REPORT_BRANDING
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
    doc.fontSize(12).font('Helvetica').text(`Periode: ${period}`, { align: 'center' });
    doc.moveDown();

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
  const { jobId, period, regionIds, format, branding: requestedBranding } = job.data;
  const branding = format === 'pdf' ? parseReportBranding(requestedBranding) : undefined;
  const metricFormat: 'pdf' | 'excel' | 'other' = format === 'pdf' || format === 'excel' ? format : 'other';
  const pool = getPgPool();

  await pool.query(
    `UPDATE report_jobs SET status = 'processing', updated_at = NOW() WHERE id = $1`,
    [jobId]
  );

  try {
    const [rows, rankings] = await Promise.all([
      fetchReportData(pool, period, regionIds),
      fetchTop10Rankings(pool, period),
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
          await generateExcelStream(period, rows, rankings, passThrough);
        } else {
          await generatePdfStream(period, rows, rankings, passThrough, branding);
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
