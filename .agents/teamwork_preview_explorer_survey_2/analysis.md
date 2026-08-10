# Technical Survey & Architectural Analysis: Extended PDF & Excel Report Generation

**Target Module:** `apps/server/src/jobs/report-worker.ts`  
**Roadmap Item:** 2. Extended PDF and Excel Report Generation (Top 10 regional rankings, breakdown comparisons, YoY percentage calculations, multi-region payment summary tables).

---

## 1. Executive Summary

This survey evaluates the existing implementation of background report generation in Petakeu, identifies current architectural gaps, and proposes exact SQL queries, data structures, PDF/Excel generation templates, and testing strategies required to complete Roadmap Item 2.

Currently, report generation in `apps/server/src/jobs/report-worker.ts` implements basic 4-column tables for requested regions in a single month. It lacks:
1. Top 10 regional rankings (national or level-2 regencies).
2. YoY (Year-over-Year) percentage calculations against the prior year's period (`(YYYY-1)-MM`).
3. Multi-region payment breakdown comparisons.
4. Comprehensive multi-worksheet Excel workbooks and multi-section PDF reports.
5. Enriched summary metadata in `report_jobs.summary` (currently sets `changePercentage: 0`).
6. Unit/integration tests for `report-worker.ts`.

---

## 2. Current Implementation & Asset Inventory

### 2.1 File Map

| Asset / File | Role | Key Functionalities |
| --- | --- | --- |
| `apps/server/src/jobs/report-worker.ts` | BullMQ Worker | Enqueues (`reportQueue`), processes jobs (`generateReport`), queries DB (`fetchReportData`), renders PDF/Excel (`generatePdf`/`generateExcel`), uploads to storage, updates `report_jobs`. |
| `apps/server/src/services/report-service.ts` | Service Layer | `enqueueReport`, `listReports`, `getReport`. Inserts jobs to DB, enqueues to BullMQ. |
| `apps/server/src/controllers/report-controller.ts` | Express Controller | Express handlers for `POST /api/v1/reports/export`, `GET /api/v1/reports`, `GET /api/v1/reports/:id`. Logs audit events. |
| `apps/server/src/routes/v1/reports.ts` | API Routes | OpenAPI documented Express router with `requireAuth`. |
| `apps/server/src/types/report.ts` | TypeScript Definitions | Interfaces `ReportJob`, `ReportRequest`, `ReportSummary`, `ReportSummaryRegion`, `ReportTrendItem`, `ReportMonthlySummaryItem`. |
| `apps/server/src/validators/report.ts` | Zod Validation | `reportRequestSchema` (`period`: `^\d{4}-\d{2}$`, `regionIds`: `string[]`, `format`: `'pdf' \| 'excel'`). |
| `apps/server/src/services/storage-service.ts` | File Storage | `uploadReport` (saves buffer to MinIO `reports` bucket), `getReportDownloadUrl` (generates presigned URL with 24h expiration). |
| `apps/server/src/db/minio.ts` | MinIO S3 Client | AWS SDK v3 `S3Client` wrapper with `forcePathStyle: true`. |
| `apps/server/migrations/001_init.sql` | DB Schema | Table `regions`, `payments`, materialized view `mv_payments_with_cut`. |
| `apps/server/migrations/002_uploads_reports.sql` | DB Schema | Table `report_jobs` (columns: `id`, `period`, `region_ids`, `format`, `status`, `download_url`, `error`, `summary`, `requested_at`, `updated_at`, `expires_at`). |
| `docs/adr/011-storage-jobs-reports-architecture.md` | ADR Document | Decisions: BullMQ for job queue, PDFKit for PDF, ExcelJS for Excel, AWS SDK v3 / MinIO for object storage. |

### 2.2 Libraries & Dependencies

- **PDF Generation:** `pdfkit` (^0.19.1) & `@types/pdfkit` (^0.17.6). Native stream-based vector PDF generator.
- **Excel Generation:** `exceljs` (^4.4.0). Full support for multi-worksheet workbooks, cell styling, fonts, fills, borders, and number formatting.
- **Job Queue:** `bullmq` (^6.0.6) with `redis` (^4.6.13) / `ioredis` (^6.0.0). Queue name: `report-generation`.
- **Object Storage:** `@aws-sdk/client-s3` (^3.1101.0) & `@aws-sdk/s3-request-presigner` (^3.1101.0). Target bucket: `reports` (environment variable `STORAGE_REPORTS_BUCKET`).

---

## 3. Gaps & Weaknesses in Existing Implementation

### 3.1 Data Fetching (`fetchReportData`)
```ts
// Existing implementation in report-worker.ts (Lines 27-47)
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
```
**Deficiencies:**
- Only queries data for the specified month (`$1`). No comparison with the prior year (`$1 - 1 year`).
- Only queries regions provided in `$2`. Does not fetch Top 10 national rankings across all regencies/provinces.
- Cannot calculate YoY percentage change.

### 3.2 PDF Generation (`generatePdf`)
- Only prints a simple header and a 4-column text list (`Wilayah`, `Total`, `Potongan`, `Neto`).
- Does not include executive summary KPIs, top 10 rankings table, YoY % calculations, or multi-region comparison tables.
- Does not re-render headers when adding new pages (`if (y > 720) { doc.addPage(); y = 40; }`).

### 3.3 Excel Generation (`generateExcel`)
- Only generates a single sheet `Laporan ${period}`.
- Single 4-column table (`Wilayah`, `Total Setoran`, `Potongan 15%`, `Neto`) with a single totals row.
- Missing top 10 rankings sheet/table, YoY % column, and breakdown comparison sheet/table.

### 3.4 Report Summary Metadata
- Sets `summary.totalsByRegion` with hardcoded `changePercentage: 0`.
- Ignores optional `topGainers`, `topDecliners`, and `lastTwelveMonths` fields defined in `ReportSummary` interface (`apps/server/src/types/report.ts`).

### 3.5 Automated Testing
- No unit tests exist for `report-worker.ts` or `report-service.ts` under `apps/server/src/jobs/` or `apps/server/src/services/`.

---

## 4. Proposed Technical Solution & SQL Specifications

### 4.1 SQL Queries Required

#### Query A: Top 10 Regional Rankings for the Period (Level 2 Regencies)
```sql
SELECT
  r.id::text AS region_id,
  r.name AS region_name,
  COALESCE(curr.amount, 0) AS amount,
  COALESCE(curr.cut_amount, 0) AS cut_amount,
  COALESCE(curr.net_amount, 0) AS net_amount,
  COALESCE(prev.amount, 0) AS prior_amount,
  CASE
    WHEN COALESCE(prev.amount, 0) > 0 THEN
      ROUND(((COALESCE(curr.amount, 0) - prev.amount) / prev.amount * 100)::numeric, 2)
    ELSE 0.00
  END AS yoy_change_pct
FROM regions r
JOIN mv_payments_with_cut curr
  ON curr.region_id = r.id AND curr.period = ($1 || '-01')::date
LEFT JOIN mv_payments_with_cut prev
  ON prev.region_id = r.id AND prev.period = (($1 || '-01')::date - INTERVAL '1 year')
WHERE r.level = 2
ORDER BY curr.amount DESC
LIMIT 10;
```

#### Query B: Payment Details & YoY Calculations for Selected Regions
```sql
SELECT
  r.id::text AS region_id,
  r.name AS region_name,
  COALESCE(curr.amount, 0) AS amount,
  COALESCE(curr.cut_amount, 0) AS cut_amount,
  COALESCE(curr.net_amount, 0) AS net_amount,
  COALESCE(prev.amount, 0) AS prior_amount,
  CASE
    WHEN COALESCE(prev.amount, 0) > 0 THEN
      ROUND(((COALESCE(curr.amount, 0) - prev.amount) / prev.amount * 100)::numeric, 2)
    ELSE 0.00
  END AS yoy_change_pct
FROM regions r
LEFT JOIN mv_payments_with_cut curr
  ON curr.region_id = r.id AND curr.period = ($1 || '-01')::date
LEFT JOIN mv_payments_with_cut prev
  ON prev.region_id = r.id AND prev.period = (($1 || '-01')::date - INTERVAL '1 year')
WHERE r.id = ANY($2::uuid[])
ORDER BY r.name;
```

#### Query C: Aggregate Summary Statistics
```sql
SELECT
  COUNT(DISTINCT r.id) AS total_regions,
  SUM(COALESCE(curr.amount, 0)) AS total_amount,
  SUM(COALESCE(curr.cut_amount, 0)) AS total_cut,
  SUM(COALESCE(curr.net_amount, 0)) AS total_net,
  SUM(COALESCE(prev.amount, 0)) AS total_prior_amount,
  CASE
    WHEN SUM(COALESCE(prev.amount, 0)) > 0 THEN
      ROUND(((SUM(COALESCE(curr.amount, 0)) - SUM(COALESCE(prev.amount, 0))) / SUM(COALESCE(prev.amount, 0)) * 100)::numeric, 2)
    ELSE 0.00
  END AS overall_yoy_pct
FROM regions r
LEFT JOIN mv_payments_with_cut curr
  ON curr.region_id = r.id AND curr.period = ($1 || '-01')::date
LEFT JOIN mv_payments_with_cut prev
  ON prev.region_id = r.id AND prev.period = (($1 || '-01')::date - INTERVAL '1 year')
WHERE r.id = ANY($2::uuid[]);
```

---

## 5. Extended PDF and Excel Generation Specs

### 5.1 Excel Workbook Design (`exceljs`)

The generated Excel workbook will contain **two structured worksheets**:

1. **Worksheet 1: `Ringkasan & Ranking`**
   - **Header Block:** Title ("Laporan Eksekutif Pendapatan Daerah"), Period, Total Revenue, Total Cut (15%), Total Net (85%), Overall YoY Growth (%).
   - **Section 1: Top 10 Regional Rankings Table**
     - Columns: `Peringkat`, `Nama Wilayah`, `Setoran Periode (IDR)`, `Potongan 15% (IDR)`, `Neto (IDR)`, `Setoran Thn Lalu (IDR)`, `Pertumbuhan YoY (%)`.
   - **Section 2: Summary Metrics Table**
     - Metrics: Total Selected Regions, Total Revenue, Total Cut, Total Net Revenue, Overall YoY %.
   - **Styling:** Header row with blue background (`FF2563EB`), bold white text, cell gridlines enabled, custom number formats (`#,##0` for IDR, `0.00%` for percentages).

2. **Worksheet 2: `Detail Pembayaran`**
   - **Multi-Region Payment Summary & Comparison Table**
     - Columns: `Kode / ID Wilayah`, `Nama Wilayah`, `Setoran Periode (IDR)`, `Potongan 15% (IDR)`, `Setoran Bersih (IDR)`, `Setoran Periode Lalu (IDR)`, `Pertumbuhan YoY (%)`.
     - **Totals Row:** Grand total at the bottom with bold font and top/bottom double borders.

### 5.2 PDF Document Layout (`pdfkit`)

The generated PDF report will be structured into clear executive sections:

1. **Document Header & Executive KPI Summary Cards**:
   - Title: `LAPORAN PENDAPATAN DAERAH & BAGI HASIL`
   - Subtitle: `Periode: ${period} | Dicetak: ${currentDate}`
   - **KPI Cards Box**: 4 side-by-side metric boxes showing Total Revenue, Total Potongan 15%, Net Revenue, and Overall YoY Growth.

2. **Section 1: Top 10 Regional Rankings**:
   - Section Header: `1. Peringkat 10 Daerah Teratas (Top 10 Rankings)`
   - Formatted Table with headers: `Rank`, `Wilayah`, `Realisasi (IDR)`, `Potongan (IDR)`, `Neto (IDR)`, `YoY (%)`.
   - Alternating row background shading for readability.

3. **Section 2: Rincian & Perbandingan Pembayaran Multi-Wilayah**:
   - Section Header: `2. Rincian & Perbandingan Pembayaran Multi-Wilayah`
   - Formatted Table with headers: `Wilayah`, `Periode ini (IDR)`, `Thn Lalu (IDR)`, `Potongan (IDR)`, `Neto (IDR)`, `YoY (%)`.
   - Automatic table header redrawing when page breaks occur.
   - Totals footer row highlighting grand total setoran and net revenue.

---

## 6. Implementation Steps & Testing Plan

### Step 1: Update `apps/server/src/jobs/report-worker.ts`
- Refactor `fetchReportData()` to execute the 3 SQL queries (Selected Region Payments with YoY, Top 10 Regional Rankings, and Multi-Region Summary Stats).
- Update `generateExcel()` to construct the two-worksheet ExcelJS workbook with formatting and formulas.
- Update `generatePdf()` to render KPI Cards, Top 10 Rankings Table, and Multi-Region Comparison Table with page break handling.
- Update `generateReport()` to populate `summary` JSON with real `changePercentage`, `topGainers`, `topDecliners`.

### Step 2: Add Unit Tests (`apps/server/src/jobs/report-worker.test.ts`)
- Mock PostgreSQL pool (`getPgPool`), MinIO storage (`uploadReport`, `getReportDownloadUrl`), and metrics.
- Test PDF generation (`format = 'pdf'`) with valid period and region IDs. Verify storage key, database status updates (`processing` -> `completed`), and summary object content.
- Test Excel generation (`format = 'excel'`). Inspect generated buffer using `exceljs` parser to verify worksheet names (`Ringkasan & Ranking`, `Detail Pembayaran`), row counts, and cell values.
- Test failure scenario (e.g. database error). Verify status update to `failed` and error logging.

---

## 7. Conclusion & Recommendations

The survey confirms that the database schema (`mv_payments_with_cut`, `regions`, `report_jobs`) and libraries (`pdfkit`, `exceljs`, `bullmq`, `@aws-sdk/client-s3`) fully support the requirements of Roadmap Item 2.

The implementation requires extending `report-worker.ts` with multi-query data fetching, multi-worksheet Excel formatting, multi-section PDF layout, enriched JSON summary calculation, and full unit test coverage.
