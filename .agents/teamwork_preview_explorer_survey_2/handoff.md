# Handoff Report: Technical Survey for Extended Report Generation (Roadmap Item 2)

**Agent:** `teamwork_preview_explorer_survey_2`  
**Working Directory:** `/home/noah/project/petakeu/.agents/teamwork_preview_explorer_survey_2`  
**Handoff Type:** Hard (Survey Complete)

---

## 1. Observation

- **Target File:** `apps/server/src/jobs/report-worker.ts`
  - Lines 27-47 (`fetchReportData`): Executes a single SQL `LEFT JOIN` between `regions` and `mv_payments_with_cut` filtering strictly on `period = ($1 || '-01')::date` and `r.id = ANY($2::uuid[])`.
  - Lines 56-94 (`generateExcel`): Generates a single worksheet `Laporan ${period}` with 4 columns (`Wilayah`, `Total Setoran (IDR)`, `Potongan 15% (IDR)`, `Neto (IDR)`) and a basic TOTAL row.
  - Lines 96-140 (`generatePdf`): Generates a basic PDF using `PDFDocument` with simple column layout and manual page addition (`if (y > 720) { doc.addPage(); y = 40; }`).
  - Lines 142-206 (`generateReport`): Updates `report_jobs` table status (`processing`, `completed`, `failed`), calls `uploadReport` (MinIO `reports` bucket), gets presigned URL (`getReportDownloadUrl`), and populates `summary` JSON with hardcoded `changePercentage: 0`.

- **Associated Files & Services:**
  - Service Layer: `apps/server/src/services/report-service.ts` (`enqueueReport`, `listReports`, `getReport`).
  - Controller & Routes: `apps/server/src/controllers/report-controller.ts`, `apps/server/src/routes/v1/reports.ts`.
  - Types & Validators: `apps/server/src/types/report.ts` (`ReportJob`, `ReportRequest`, `ReportSummary`), `apps/server/src/validators/report.ts` (`reportRequestSchema`).
  - Storage: `apps/server/src/services/storage-service.ts` (`uploadReport`, `getReportDownloadUrl`), `apps/server/src/db/minio.ts` (`S3Client`, `PutObjectCommand`, `GetSignedUrl`).
  - Database Schema: `migrations/001_init.sql` (`regions`, `payments`, `mv_payments_with_cut`), `migrations/002_uploads_reports.sql` (`report_jobs`).
  - ADR: `docs/adr/011-storage-jobs-reports-architecture.md` (BullMQ, PDFKit, ExcelJS, MinIO/AWS SDK).

- **Installed Libraries (`apps/server/package.json`):**
  - PDF: `pdfkit` (^0.19.1), `@types/pdfkit` (^0.17.6).
  - Excel: `exceljs` (^4.4.0), `xlsx` (^0.18.5).
  - BullMQ: `bullmq` (^6.0.6), `ioredis` (^6.0.0).
  - Storage: `@aws-sdk/client-s3` (^3.1101.0), `@aws-sdk/s3-request-presigner` (^3.1101.0).

- **Tests Status:**
  - `apps/server/src/jobs/upload-worker.test.ts` exists.
  - **No test file exists** for `report-worker.ts` or `report-service.ts`.

---

## 2. Logic Chain

1. **Requirement Check:** Item 2 of roadmap requires extended PDF/Excel report generation including top 10 regional rankings, breakdown comparisons, YoY percentage calculations, and multi-region payment summary tables.
2. **Current Code Limitation:** The existing code in `report-worker.ts` only fetches data for the selected month without prior year comparison, ranking, or breakdown queries.
3. **Data Requirements Reasoning:** To compute YoY percentage change $$\text{YoY \%} = \frac{\text{amount}_{\text{curr}} - \text{amount}_{\text{prev}}}{\text{amount}_{\text{prev}}} \times 100$$, data from period `$1` and period `$1 - 1 year` must be joined in SQL. To build top 10 regional rankings, a query filtering on `level = 2` ordering by `amount DESC LIMIT 10` is needed.
4. **Excel Architecture Reasoning:** `exceljs` supports multi-sheet workbooks. Creating two worksheets (`Ringkasan & Ranking` and `Detail Pembayaran`) satisfies both high-level executive view and detailed multi-region breakdown tables.
5. **PDF Architecture Reasoning:** `pdfkit` allows drawing KPI cards, section titles, top 10 rankings table, and multi-region details table with dynamic page header redrawing.
6. **Summary Metadata Reasoning:** `ReportSummary` interface already specifies `totalsByRegion`, `topGainers`, `topDecliners`. Populating real `changePercentage` values inside `generateReport()` completes the API payload contract.

---

## 3. Caveats

- **Read-Only Scope:** This investigation did not modify application code files in `apps/server/src/`.
- **Materialized View Requirement:** YoY percentage calculations rely on `mv_payments_with_cut` having historical data (current period and period minus 1 year). If prior year data is missing in test environments, `COALESCE(prev.amount, 0)` ensures zero division is safely handled (`0.00%`).
- **Redis & MinIO Dependencies:** BullMQ and storage functions require active Redis and MinIO instances during integration test execution. Unit tests must mock these dependencies.

---

## 4. Conclusion

Roadmap Item 2 is fully actionable. The underlying schema and libraries (`pdfkit`, `exceljs`, `bullmq`, AWS SDK v3) are in place. Implementing Item 2 requires:
1. Extending SQL queries in `report-worker.ts` to retrieve YoY data, Top 10 rankings, and summary stats.
2. Refactoring `generateExcel()` to produce a 2-sheet workbook (`Ringkasan & Ranking` + `Detail Pembayaran`).
3. Refactoring `generatePdf()` to produce structured KPI cards, Top 10 rankings table, and multi-region breakdown table with YoY %.
4. Updating `generateReport()` summary metadata calculation.
5. Creating `apps/server/src/jobs/report-worker.test.ts` with unit tests for PDF/Excel generation and database status transitions.

---

## 5. Verification Method

To verify the extended report worker once implemented:
1. Run server unit tests:
   ```bash
   pnpm --filter @petakeu/server test
   ```
2. Verify typescript compilation and linting:
   ```bash
   pnpm --filter @petakeu/server typecheck
   pnpm --filter @petakeu/server lint
   ```
3. Inspect generated PDF & Excel outputs by executing the report worker with mock DB data and verifying file buffer generation and worksheet/table structure.
