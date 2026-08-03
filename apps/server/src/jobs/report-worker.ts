import { Queue, Worker, Job } from 'bullmq';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { getPgPool } from '../db/postgres';
import { uploadReport, getReportDownloadUrl } from '../services/storage-service';

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

async function generateExcel(
  period: string,
  rows: any[]
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(`Laporan ${period}`);

  sheet.columns = [
    { header: 'Wilayah', key: 'region_name', width: 30 },
    { header: 'Total Setoran (IDR)', key: 'amount', width: 20 },
    { header: 'Potongan 15% (IDR)', key: 'cut_amount', width: 20 },
    { header: 'Neto (IDR)', key: 'net_amount', width: 20 },
  ];

  // Style header row
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };

  for (const row of rows) {
    sheet.addRow({
      region_name: row.region_name,
      amount: Number(row.amount),
      cut_amount: Number(row.cut_amount),
      net_amount: Number(row.net_amount),
    });
  }

  // Totals row
  const total = rows.reduce((acc, r) => acc + Number(r.amount), 0);
  const totalCut = rows.reduce((acc, r) => acc + Number(r.cut_amount), 0);
  const totalNet = rows.reduce((acc, r) => acc + Number(r.net_amount), 0);
  const totalsRow = sheet.addRow({ region_name: 'TOTAL', amount: total, cut_amount: totalCut, net_amount: totalNet });
  totalsRow.font = { bold: true };

  const buf = await workbook.xlsx.writeBuffer();
  return Buffer.from(buf);
}

async function generatePdf(
  period: string,
  rows: any[]
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40 });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(18).font('Helvetica-Bold').text(`Laporan Setoran Dana Bagi Hasil`, { align: 'center' });
    doc.fontSize(12).font('Helvetica').text(`Periode: ${period}`, { align: 'center' });
    doc.moveDown();

    // Table header
    const tableTop = doc.y + 10;
    const col1 = 40, col2 = 230, col3 = 340, col4 = 450;

    doc.font('Helvetica-Bold').fontSize(10);
    doc.text('Wilayah', col1, tableTop);
    doc.text('Total (IDR)', col2, tableTop);
    doc.text('Potongan (IDR)', col3, tableTop);
    doc.text('Neto (IDR)', col4, tableTop);

    const fmt = (n: number) => new Intl.NumberFormat('id-ID').format(n);

    let y = tableTop + 20;
    doc.font('Helvetica').fontSize(9);
    for (const row of rows) {
      doc.text(String(row.region_name).slice(0, 28), col1, y);
      doc.text(fmt(Number(row.amount)), col2, y);
      doc.text(fmt(Number(row.cut_amount)), col3, y);
      doc.text(fmt(Number(row.net_amount)), col4, y);
      y += 16;
      if (y > 720) {
        doc.addPage();
        y = 40;
      }
    }

    doc.end();
  });
}

async function generateReport(job: Job): Promise<void> {
  const { jobId, period, regionIds, format } = job.data;
  const pool = getPgPool();

  await pool.query(
    `UPDATE report_jobs SET status = 'processing', updated_at = NOW() WHERE id = $1`,
    [jobId]
  );

  try {
    const rows = await fetchReportData(pool, period, regionIds);

    let fileBuffer: Buffer;
    let contentType: string;
    let extension: string;

    if (format === 'excel') {
      fileBuffer = await generateExcel(period, rows);
      contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      extension = 'xlsx';
    } else {
      fileBuffer = await generatePdf(period, rows);
      contentType = 'application/pdf';
      extension = 'pdf';
    }

    const key = `${jobId}.${extension}`;
    await uploadReport(key, fileBuffer, contentType);
    const downloadUrl = await getReportDownloadUrl(key);

    // Build summary
    const summary = {
      totalsByRegion: rows.map((r) => ({
        regionId: r.region_id,
        regionName: r.region_name,
        total: Number(r.amount),
        changePercentage: 0,
      })),
    };

    await pool.query(
      `UPDATE report_jobs
       SET status = 'completed', download_url = $2, summary = $3, updated_at = NOW()
       WHERE id = $1`,
      [jobId, downloadUrl, JSON.stringify(summary)]
    );
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Report generation failed';
    await pool.query(
      `UPDATE report_jobs SET status = 'failed', error = $2, updated_at = NOW() WHERE id = $1`,
      [jobId, errMsg]
    );
    throw err;
  }
}

export function startReportWorker() {
  const worker = new Worker(QUEUE_NAME, generateReport, {
    connection: {
      url: process.env.REDIS_URL ?? 'redis://localhost:6379',
    },
    concurrency: 1,
  });

  worker.on('completed', (job) => {
    console.log(`[report-worker] Job ${job.id} completed`);
  });
  worker.on('failed', (job, err) => {
    console.error(`[report-worker] Job ${job?.id} failed:`, err.message);
  });

  console.log('[report-worker] Started');
  return worker;
}
