# Survey Report: Requirement R1 (Streaming Export for Large Datasets)

**Author:** Survey Explorer 1  
**Working Directory:** `/home/noah/project/petakeu/.agents/explorer_survey_1`  
**Target Repository:** `/home/noah/project/petakeu`  
**Date:** 2026-08-12  

---

## 1. Observation

### 1.1 Report Generation in `apps/server/src/jobs/report-worker.ts`
- **Line 2: Import Statements**
  `import ExcelJS from 'exceljs';`
  `import PDFDocument from 'pdfkit';`
- **Lines 118–178: `generateExcel()`**
  ```typescript
  async function generateExcel(
    period: string,
    rows: ReportRow[],
    rankings: RankingRow[]
  ): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    // ... populates sheet 1 and sheet 2 ...
    const buf = await workbook.xlsx.writeBuffer();
    return Buffer.from(buf);
  }
  ```
  - Directly creates an in-memory `ExcelJS.Workbook()` instance and calls `workbook.xlsx.writeBuffer()`.
  - Materializes the complete spreadsheet structure and zip archive as a single contiguous `Buffer` array in V8 heap memory before returning.
- **Lines 180–264: `generatePdf()`**
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
  - Accumulates binary PDF data chunks into an in-memory array `chunks: Buffer[]`.
  - Executes `Buffer.concat(chunks)` upon stream completion, holding the entire binary PDF in Node.js process memory.
- **Lines 266–341: `generateReport(job: Job)`**
  ```typescript
  let fileBuffer: Buffer;
  // ...
  if (format === 'excel') {
    fileBuffer = await generateExcel(period, rows, rankings);
    // ...
  } else {
    fileBuffer = await generatePdf(period, rows, rankings);
    // ...
  }
  const key = `${jobId}.${extension}`;
  await uploadReport(key, fileBuffer, contentType);
  ```
  - Receives the fully buffered file (`Buffer`) and calls `uploadReport(key, fileBuffer, contentType)`.

### 1.2 Storage Service Layer in `apps/server/src/services/storage-service.ts` & `apps/server/src/db/minio.ts`
- **`apps/server/src/services/storage-service.ts` (Lines 22–28)**
  ```typescript
  export async function uploadReport(
    key: string,
    buffer: Buffer,
    contentType: string
  ): Promise<string> {
    return uploadToS3(REPORTS_BUCKET, key, buffer, contentType);
  }
  ```
- **`apps/server/src/db/minio.ts` (Lines 36–53)**
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
- **Dependencies in `apps/server/package.json` (Lines 16, 32, 40)**
  - `@aws-sdk/client-s3`: `^3.1101.0`
  - `@aws-sdk/s3-request-presigner`: `^3.1101.0`
  - `exceljs`: `^4.4.0`
  - `pdfkit`: `^0.19.1`
  - Note: `@aws-sdk/lib-storage` is not currently listed in dependencies.

### 1.3 Test Coverage in `apps/web/e2e/report-generation.spec.ts`
- Suite covers:
  - `3.1`: Enqueueing PDF report jobs (`POST /api/v1/reports/export`).
  - `3.2`: Enqueueing Excel report jobs (`POST /api/v1/reports/export`).
  - `3.3`: Polling job status (`GET /api/v1/reports/:id`).
  - `3.4`: Verifying summary JSON metadata structure (`totalsByRegion`, `top10Rankings`).
  - `3.5`: Validating presigned download URL and `Content-Type` headers (`application/pdf` and `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`).
  - `3.6`: Input validation errors (HTTP 400).

---

## 2. Logic Chain

1. **Memory Exhaustion Mechanism**:
   - Creating full in-memory `Workbook` objects via `exceljs` and concatenating PDF buffers in V8 memory causes high peak memory usage (O(File Size + AST Size)).
   - For multi-region reports containing hundreds of regions or thousands of rows, concurrent report jobs can trigger V8 heap allocation limits and out-of-memory crashes.

2. **ExcelJS Streaming Solution**:
   - `exceljs` includes built-in streaming support via `ExcelJS.stream.xlsx.WorkbookWriter`.
   - By creating `WorkbookWriter` attached to a Node.js `stream.PassThrough`, rows are serialized into XML zip chunks and immediately pushed to the stream when `row.commit()` is called.
   - Once all rows and sheets are written, `workbook.commit()` finalizes the zip archive and closes the stream. Peak memory usage drops from entire file size to a few kilobytes (stream buffer size).

3. **PDFKit Streaming Solution**:
   - `PDFDocument` in `pdfkit` is a `Readable` stream.
   - Instead of storing chunks in an array `chunks.push(chunk)` and performing `Buffer.concat()`, `PDFDocument` can be piped directly to a Node.js `stream.PassThrough`.
   - Chunks flow asynchronously into object storage as the PDF document is being rendered.

4. **MinIO / S3 SDK Integration**:
   - AWS SDK v3 `S3Client` / `PutObjectCommand` accepts Node.js `Readable` / `PassThrough` streams for `Body`.
   - Alternatively, using `@aws-sdk/lib-storage` `Upload` class (or passing `PassThrough` to `PutObjectCommand`) handles multipart/chunked streaming upload to MinIO without requiring a pre-calculated `Content-Length`.
   - Pipelining execution: create `PassThrough` stream -> start storage upload promise -> generate document into `PassThrough` -> await storage upload promise.

5. **API & Specification Backward Compatibility**:
   - The job enqueue endpoint (`POST /api/v1/reports/export`), status polling endpoint (`GET /api/v1/reports/:id`), presigned download URLs, HTTP status codes, and summary JSON structure remain completely untouched.
   - All acceptance criteria in `ORIGINAL_REQUEST.md` and E2E tests in `apps/web/e2e/report-generation.spec.ts` continue to pass.

---

## 3. Caveats

- **Row Commit Constraint in ExcelJS Streaming**: In `stream.xlsx.WorkbookWriter`, rows cannot be modified after `row.commit()` is called. Column widths and header styles must be set upfront or during row insertion.
- **Error Handling Pipelining**: If document generation fails midway (e.g. database query error during row streaming), the `PassThrough` stream must be destroyed (`stream.destroy(err)`) to abort the S3 upload cleanly and prevent partial/corrupted files from being persisted.
- **S3 SDK Multipart Options**: While `PutObjectCommand` with Node `Readable` stream works directly with MinIO, if large multi-part uploads (> 5MB) are streamed over network latency, `@aws-sdk/lib-storage` (`Upload`) provides chunk retry and part-size buffering. If package additions are avoided, standard `PutObjectCommand` with `PassThrough` stream works seamlessly.

---

## 4. Conclusion

Refactoring `report-worker.ts` to stream Excel and PDF generation directly into MinIO eliminates in-memory `Buffer` buffering, satisfying Requirement R1.

### Recommended Implementation Steps:

1. **Update Storage Service Layer (`apps/server/src/db/minio.ts` & `apps/server/src/services/storage-service.ts`)**:
   - Add `uploadStreamToS3(bucket: string, key: string, stream: Readable, contentType: string): Promise<string>` using `@aws-sdk/client-s3` `PutObjectCommand` (or `@aws-sdk/lib-storage` `Upload`).
   - Add `uploadReportStream(key: string, stream: Readable, contentType: string)` in `storage-service.ts`.

2. **Refactor `generateExcel()` to `generateExcelStream()` in `apps/server/src/jobs/report-worker.ts`**:
   - Instantiates `new ExcelJS.stream.xlsx.WorkbookWriter({ stream: passThrough, useStyles: true, useSharedStrings: false })`.
   - Calls `sheet.addRow(...).commit()` for each data row.
   - Calls `sheet.commit()` and `await workbook.commit()`.

3. **Refactor `generatePdf()` to `generatePdfStream()` in `apps/server/src/jobs/report-worker.ts`**:
   - Instantiates `const doc = new PDFDocument({ margin: 40 })`.
   - Pipes `doc.pipe(passThrough)`.
   - Draws cover, region table, and top 10 rankings, then calls `doc.end()`.

4. **Update `generateReport()` Job Handler**:
   - Creates a `PassThrough` stream.
   - Launches `uploadReportStream(...)` in parallel with streaming document generation.
   - Preserves summary JSON metadata generation in PostgreSQL `report_jobs.summary`.
   - Include code comments documenting the memory optimization rationale.

---

## 5. Verification Method

### Automated Commands
1. **Type Checking**:
   `pnpm typecheck`
   *(Must pass with zero TypeScript errors)*
2. **Linting**:
   `pnpm lint`
   *(Must pass with zero ESLint errors)*
3. **E2E Integration Testing**:
   `pnpm exec playwright test apps/web/e2e/report-generation.spec.ts`
   *(Must pass all 6 test cases for PDF/Excel job enqueueing, polling, download header verification, and error handling)*

### Files to Inspect
- `apps/server/src/jobs/report-worker.ts`
- `apps/server/src/services/storage-service.ts`
- `apps/server/src/db/minio.ts`
