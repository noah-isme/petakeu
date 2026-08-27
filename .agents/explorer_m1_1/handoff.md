# Implementation Plan Report: Milestone 1 — Streaming Export for Large Datasets

**Author:** Explorer M1  
**Working Directory:** `/home/noah/project/petakeu/.agents/explorer_m1_1`  
**Repository Directory:** `/home/noah/project/petakeu`  
**Date:** 2026-08-12  

---

## 1. Observation

### 1.1 In-Memory Buffering in `apps/server/src/jobs/report-worker.ts`
- **Lines 118–178 (`generateExcel`)**:
  ```typescript
  async function generateExcel(
    period: string,
    rows: ReportRow[],
    rankings: RankingRow[]
  ): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    // ... populates sheets ...
    const buf = await workbook.xlsx.writeBuffer();
    return Buffer.from(buf);
  }
  ```
  *Observation*: Instantiates a standard `ExcelJS.Workbook()` entirely in V8 heap memory and calls `workbook.xlsx.writeBuffer()`. For multi-region reports with large row counts, this causes high peak memory allocation O(File Size + AST).

- **Lines 180–264 (`generatePdf`)**:
  ```typescript
  async function generatePdf(
    period: string,
    rows: ReportRow[],
    rankings: RankingRow[]
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 40 });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      // ... renders PDF content ...
      doc.end();
    });
  }
  ```
  *Observation*: Accumulates binary PDF data chunks into an in-memory array `chunks: Buffer[]` and executes `Buffer.concat(chunks)` upon completion, buffering the entire PDF in Node.js process memory.

- **Lines 282–298 (`generateReport` job handler)**:
  ```typescript
  let fileBuffer: Buffer;
  // ...
  if (format === 'excel') {
    fileBuffer = await generateExcel(period, rows, rankings);
  } else {
    fileBuffer = await generatePdf(period, rows, rankings);
  }
  const key = `${jobId}.${extension}`;
  await uploadReport(key, fileBuffer, contentType);
  ```
  *Observation*: Takes the fully materialized in-memory `Buffer` and uploads it to object storage via `uploadReport`.

- **Lines 301–323 (`summary` JSON metadata and DB updates)**:
  ```typescript
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
  ```
  *Observation*: `summary` metadata is generated directly from `rows` and `rankings` array fetched from PostgreSQL at job start.

### 1.2 Storage Layer in `apps/server/src/services/storage-service.ts` & `apps/server/src/db/minio.ts`
- **`apps/server/src/db/minio.ts` (Lines 36–53)**:
  ```typescript
  export async function uploadToS3(
    bucket: string,
    key: string,
    body: Buffer,
    contentType: string
  ): Promise<string> {
    const client = getS3Client();
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      })
    );
    const endpoint = process.env.STORAGE_ENDPOINT ?? 'http://localhost:9000';
    return `${endpoint}/${bucket}/${key}`;
  }
  ```
  *Observation*: `uploadToS3` currently accepts `body: Buffer`. AWS SDK v3 `@aws-sdk/client-s3` `PutObjectCommand` accepts Node.js `Readable` streams as `Body`.

- **`apps/server/src/services/storage-service.ts` (Lines 22–28, 49–56)**:
  ```typescript
  export async function uploadReport(
    key: string,
    buffer: Buffer,
    contentType: string
  ): Promise<string> {
    return uploadToS3(REPORTS_BUCKET, key, buffer, contentType);
  }
  ```
  *Observation*: `uploadReport` wraps `uploadToS3` for `REPORTS_BUCKET`.

### 1.3 Test Suite & Requirements
- **`apps/web/e2e/report-generation.spec.ts`**:
  - Test 3.1 & 3.2 verify PDF and Excel job enqueueing returning HTTP 201.
  - Test 3.3 verifies job status polling until completion.
  - Test 3.4 verifies summary JSON metadata (`totalsByRegion`, `top10Rankings`).
  - Test 3.5 verifies presigned download URL and `Content-Type` headers (`application/pdf` and `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`).

---

## 2. Logic Chain

1. **V8 Heap Memory Bottleneck Identification**:
   - Creating full in-memory `Workbook` objects via `exceljs` and concatenating PDF buffers in V8 memory causes peak memory consumption to scale linearly with file size (O(File Size)).
   - Under concurrent background job execution, generating large multi-region reports can hit V8 heap allocation limits and crash the process.

2. **ExcelJS Streaming Architecture (`WorkbookWriter`)**:
   - `ExcelJS` provides streaming support via `ExcelJS.stream.xlsx.WorkbookWriter({ stream: passThrough, useStyles: true, useSharedStrings: false })`.
   - As rows are added and `row.commit()` is called, serialized XML zip chunks are immediately written to the Node.js `PassThrough` stream.
   - Calling `sheet.commit()` and `await workbook.commit()` finalizes the zip package and closes the stream, maintaining peak heap memory at stream buffer size (~64 KB).

3. **PDFKit Streaming Architecture**:
   - `PDFDocument` in `pdfkit` is a Node.js `Readable` stream.
   - Piping `doc.pipe(passThrough)` streams PDF binary chunks directly to the `PassThrough` stream as elements are rendered, eliminating `chunks: Buffer[]` accumulation and `Buffer.concat()`.

4. **MinIO Streaming Upload (`@aws-sdk/client-s3`)**:
   - AWS SDK v3 `PutObjectCommand` accepts Node `Readable` streams as `Body`.
   - By creating a `PassThrough` stream, passing it to `uploadReportStream`, and streaming PDF/Excel data into it simultaneously via `Promise.all([generationPromise, uploadPromise])`, data is transferred to MinIO as it is generated.

5. **Error Handling & Failure Propagation**:
   - If document generation fails midway (e.g. database error or rendering failure), `passThrough.destroy(err)` must be called.
   - Destroying the `PassThrough` stream with an error causes `PutObjectCommand` to reject immediately, aborting the MinIO upload and preventing partial/corrupted files from persisting.
   - The job handler catches the error, marks `report_jobs.status` as `'failed'`, logs the error, and re-throws.

6. **Preservation of Summary JSON Metadata**:
   - Since `fetchReportData` and `fetchTop10Rankings` execute before stream generation starts, the `summary` JSON metadata structure (`totalsByRegion`, `top10Rankings`) and database update to `report_jobs` remain 100% intact and backward-compatible.

---

## 3. Caveats

- **ExcelJS Streaming `commit()` Requirement**: In `stream.xlsx.WorkbookWriter`, rows cannot be modified after `row.commit()` is invoked. Header row styling must be applied before `headerRow.commit()` is called.
- **PassThrough Stream Lifecycle**: The `PassThrough` stream must be destroyed (`passThrough.destroy(err)`) on any error during generation so `uploadReportStream` does not hang waiting for stream termination.
- **Backwards Compatibility**: Both `uploadToS3` and `uploadReport` signatures should support `Buffer | Readable` to ensure existing non-streaming upload callers remain unaffected.

---

## 4. Conclusion & Concrete Implementation Plan

Refactoring `report-worker.ts`, `storage-service.ts`, and `minio.ts` to stream Excel and PDF exports directly into MinIO eliminates in-memory `Buffer` allocations, fulfilling Milestone 1 requirements.

### Code Changes Required

#### Step 1: Update `apps/server/src/db/minio.ts`
- Import `Readable` from `'stream'`.
- Update `uploadToS3` parameter `body` type to `Buffer | Readable`.
- Export new function `uploadStreamToS3(bucket: string, key: string, stream: Readable, contentType: string): Promise<string>`.

```typescript
// Proposed Code Snippet for apps/server/src/db/minio.ts
import { Readable } from 'stream';
import {
  S3Client,
  PutObjectCommand,
  CreateBucketCommand,
  HeadBucketCommand,
  GetObjectCommand
} from '@aws-sdk/client-s3';

export async function uploadToS3(
  bucket: string,
  key: string,
  body: Buffer | Readable,
  contentType: string
): Promise<string> {
  const client = getS3Client();
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );
  const endpoint = process.env.STORAGE_ENDPOINT ?? 'http://localhost:9000';
  return `${endpoint}/${bucket}/${key}`;
}

export async function uploadStreamToS3(
  bucket: string,
  key: string,
  stream: Readable,
  contentType: string
): Promise<string> {
  return uploadToS3(bucket, key, stream, contentType);
}
```

#### Step 2: Update `apps/server/src/services/storage-service.ts`
- Import `Readable` from `'stream'`.
- Update import from `../db/minio` to include `uploadStreamToS3`.
- Update `uploadReport` to accept `Buffer | Readable`.
- Export `uploadReportStream(key: string, stream: Readable, contentType: string): Promise<string>`.
- Add `uploadReportStream` to `storageService` export object.

```typescript
// Proposed Code Snippet for apps/server/src/services/storage-service.ts
import { Readable } from 'stream';
import { uploadToS3, uploadStreamToS3, ensureBucket, getPresignedDownloadUrl, getS3Client } from '../db/minio';

export async function uploadReport(
  key: string,
  buffer: Buffer | Readable,
  contentType: string
): Promise<string> {
  return uploadToS3(REPORTS_BUCKET, key, buffer, contentType);
}

export async function uploadReportStream(
  key: string,
  stream: Readable,
  contentType: string
): Promise<string> {
  return uploadStreamToS3(REPORTS_BUCKET, key, stream, contentType);
}

export const storageService = {
  initStorage,
  uploadFile,
  uploadReport,
  uploadReportStream,
  getUploadDownloadUrl,
  getReportDownloadUrl,
  checkStorageHealth,
};
```

#### Step 3: Update `apps/server/src/jobs/report-worker.ts`
- Import `PassThrough`, `Writable` from `'stream'`.
- Import `uploadReportStream` from `../services/storage-service`.
- Refactor `generateExcel` to `generateExcelStream(period: string, rows: ReportRow[], rankings: RankingRow[], stream: Writable): Promise<void>`.
- Refactor `generatePdf` to `generatePdfStream(period: string, rows: ReportRow[], rankings: RankingRow[], stream: Writable): Promise<void>`.
- Refactor `generateReport(job: Job)` to instantiate `passThrough = new PassThrough()`, run generation and S3 upload in parallel via `Promise.all`, destroy stream on error, and add V8 memory optimization comment.

```typescript
// Proposed Code Snippet for apps/server/src/jobs/report-worker.ts
import { PassThrough, Writable } from 'stream';
import { uploadReport, uploadReportStream, getReportDownloadUrl } from '../services/storage-service';

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

async function generatePdfStream(
  period: string,
  rows: ReportRow[],
  rankings: RankingRow[],
  stream: Writable
): Promise<void> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40 });

    doc.on('error', reject);
    stream.on('error', reject);
    stream.on('finish', resolve);

    doc.pipe(stream);

    const fmt = (n: number) => new Intl.NumberFormat('id-ID').format(n);

    // ── Cover / title ─────────────────────────────────────────────────────
    doc.fontSize(18).font('Helvetica-Bold').text('Laporan Setoran Dana Bagi Hasil', { align: 'center' });
    doc.fontSize(12).font('Helvetica').text(`Periode: ${period}`, { align: 'center' });
    doc.moveDown();

    // ── Section 1: Per-region payment table ───────────────────────────────
    doc.fontSize(13).font('Helvetica-Bold').text('Realisasi Setoran per Wilayah');
    doc.moveDown(0.4);

    const col1 = 40, col2 = 230, col3 = 340, col4 = 450;
    let y = doc.y + 6;

    doc.font('Helvetica-Bold').fontSize(10);
    doc.text('Wilayah', col1, y);
    doc.text('Total (IDR)', col2, y);
    doc.text('Potongan (IDR)', col3, y);
    doc.text('Neto (IDR)', col4, y);
    y += 18;

    doc.font('Helvetica').fontSize(9);
    for (const row of rows) {
      doc.text(String(row.region_name).slice(0, 30), col1, y);
      doc.text(fmt(Number(row.amount)), col2, y);
      doc.text(fmt(Number(row.cut_amount)), col3, y);
      doc.text(fmt(Number(row.net_amount)), col4, y);
      y += 16;
      if (y > 720) { doc.addPage(); y = 40; }
    }

    // Grand totals
    const totalNet = rows.reduce((acc, r) => acc + Number(r.net_amount), 0);
    y += 6;
    doc.font('Helvetica-Bold').fontSize(9);
    doc.text('TOTAL', col1, y);
    doc.text(fmt(rows.reduce((acc, r) => acc + Number(r.amount), 0)), col2, y);
    doc.text(fmt(rows.reduce((acc, r) => acc + Number(r.cut_amount), 0)), col3, y);
    doc.text(fmt(totalNet), col4, y);

    // ── Section 2: Top 10 Regional Rankings ──────────────────────────────
    doc.addPage();
    doc.fontSize(13).font('Helvetica-Bold').text('10 Besar Kabupaten/Kota — Setoran Neto');
    doc.fontSize(10).font('Helvetica').text(`(Perbandingan YoY terhadap periode ${period.split('-')[0] && String(parseInt(period.split('-')[0], 10) - 1)}-${period.split('-')[1]})`);
    doc.moveDown(0.5);

    const rc1 = 40, rc2 = 60, rc3 = 230, rc4 = 360, rc5 = 470;
    y = doc.y + 6;

    doc.font('Helvetica-Bold').fontSize(10);
    doc.text('#', rc1, y);
    doc.text('Wilayah', rc2, y);
    doc.text('Neto Ini (IDR)', rc3, y);
    doc.text('Neto Lalu (IDR)', rc4, y);
    doc.text('YoY (%)', rc5, y);
    y += 18;

    doc.font('Helvetica').fontSize(9);
    rankings.forEach((r, idx) => {
      const yoy = r.yoy_pct !== null ? `${Number(r.yoy_pct) >= 0 ? '+' : ''}${Number(r.yoy_pct).toFixed(2)}%` : 'N/A';
      doc.text(String(idx + 1), rc1, y);
      doc.text(String(r.region_name).slice(0, 25), rc2, y);
      doc.text(fmt(Number(r.net_amount)), rc3, y);
      doc.text(fmt(Number(r.net_amount_prev ?? 0)), rc4, y);
      doc.text(yoy, rc5, y);
      y += 16;
      if (y > 720) { doc.addPage(); y = 40; }
    });

    doc.end();
  });
}

async function generateReport(job: Job): Promise<void> {
  const startTime = Date.now();
  const { jobId, period, regionIds, format } = job.data;
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

    // V8 HEAP MEMORY OPTIMIZATION:
    // Instead of buffering the entire Excel/PDF file into Node.js heap memory before uploading to S3/MinIO,
    // we instantiate a PassThrough stream and pipe the streaming generator output directly to MinIO S3 storage.
    // This reduces peak V8 memory usage from O(File Size) to O(Stream Buffer Size) (~64KB), preventing heap allocation failures
    // when exporting large multi-region datasets across concurrent jobs.
    const passThrough = new PassThrough();

    const uploadPromise = uploadReportStream(key, passThrough, contentType);

    const generationPromise = (async () => {
      try {
        if (format === 'excel') {
          await generateExcelStream(period, rows, rankings, passThrough);
        } else {
          await generatePdfStream(period, rows, rankings, passThrough);
        }
      } catch (err) {
        passThrough.destroy(err instanceof Error ? err : new Error(String(err)));
        throw err;
      }
    })();

    await Promise.all([generationPromise, uploadPromise]);

    const downloadUrl = await getReportDownloadUrl(key);

    // Build summary with top-10 rankings (remains intact)
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

    reportsTotal.inc({ format, status: 'completed' });
    workerJobsTotal.inc({ worker: 'report', status: 'success' });
    logger.info({ jobId, format, regionCount: regionIds.length }, '[report-worker] Job completed');
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Report generation failed';
    await pool.query(
      `UPDATE report_jobs SET status = 'failed', error = $2, updated_at = NOW() WHERE id = $1`,
      [jobId, errMsg]
    );
    reportsTotal.inc({ format, status: 'failed' });
    workerJobsTotal.inc({ worker: 'report', status: 'failed' });
    logger.error({ jobId, err }, '[report-worker] Job failed');
    throw err;
  } finally {
    workerJobDuration.observe({ worker: 'report', job_type: format }, (Date.now() - startTime) / 1000);
  }
}
```

---

## 5. Verification Method

### 5.1 Verification Commands
Execute the following verification steps in sequence:

1. **TypeScript Typecheck**:
   ```bash
   pnpm typecheck
   ```
   *Expected Result*: Zero TypeScript compilation errors across all workspace packages (`@petakeu/server` and `@petakeu/web`).

2. **ESLint Code Quality**:
   ```bash
   pnpm lint
   ```
   *Expected Result*: Zero lint warnings/errors in `apps/server/src/db/minio.ts`, `apps/server/src/services/storage-service.ts`, and `apps/server/src/jobs/report-worker.ts`.

3. **Unit Tests**:
   ```bash
   pnpm test
   ```
   *Expected Result*: All existing Vitest test suites in `apps/server` pass without regressions.

4. **Playwright E2E Integration Suite**:
   ```bash
   pnpm --filter @petakeu/web test:e2e --grep "report-generation"
   ```
   *(or `npx playwright test apps/web/e2e/report-generation.spec.ts`)*
   *Expected Result*: All 6 E2E test cases pass:
   - PDF report job enqueueing (3.1)
   - Excel report job enqueueing (3.2)
   - Status polling until completion (3.3)
   - Verification of `summary` JSON metadata structure (3.4)
   - Download URL access and Content-Type headers verification (3.5)
   - Input validation error handling (3.6)

### 5.2 Files to Inspect
- `apps/server/src/db/minio.ts`
- `apps/server/src/services/storage-service.ts`
- `apps/server/src/jobs/report-worker.ts`

### 5.3 Invalidation Conditions
- Any TypeScript error on `PutObjectCommand` body parameter when passing Node `Readable` stream.
- Failure of Playwright E2E tests to download completed reports or parse `summary` metadata.
- Stream hanging when error occurs during document generation.
