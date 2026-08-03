# ADR 011: Real Storage, Job Queue, and Report Generation Architecture

**Date:** 2026-08-03  
**Status:** Accepted  
**Deciders:** Backend team

---

## Context

Sebelumnya, backend Petakeu menggunakan pendekatan sementara:
- Upload disimpan ke filesystem lokal dengan `fs.writeFile()`
- Job diproses dengan `setTimeout(…, 250)` — hilang saat restart
- Laporan menggunakan URL palsu (`storage.petakeu.local/reports/…`)
- Report service langsung mengembalikan `status: "completed"` tanpa menghasilkan file apapun

Keputusan ini mendokumentasikan arsitektur produksi yang menggantikan pendekatan tersebut.

---

## Decision

### 1. Object Storage: @aws-sdk/client-s3 + MinIO

**Dipilih:** AWS SDK v3 (`@aws-sdk/client-s3`) dengan `forcePathStyle: true` untuk kompatibilitas MinIO.

**Alternatif yang dipertimbangkan:**
- `minio` (official MinIO Node.js SDK): Lebih spesifik ke MinIO, tidak kompatibel dengan S3 jika suatu saat migrasi ke AWS.
- `@aws-sdk/client-s3`: Kompatibel dengan MinIO (via forcePathStyle), AWS S3, GCS, dan object storage S3-compatible lainnya.

**Keputusan:** AWS SDK v3 dipilih karena portabilitas — satu kode bekerja untuk MinIO (dev) dan AWS S3 (production).

**File:** `src/db/minio.ts`, `src/services/storage-service.ts`

**Bucket structure:**
- `uploads` — file Excel yang diunggah user
- `reports` — file PDF/Excel yang dihasilkan, dengan presigned URL 24 jam

### 2. Background Jobs: BullMQ

**Dipilih:** BullMQ (Redis-backed job queue)

**Alternatif yang dipertimbangkan:**
- `setTimeout` (existing): Non-persisten, hilang saat restart, tidak ada retry.
- Polling PostgreSQL: Sederhana tapi kurang efisien dan butuh polling loop.
- BullMQ: Persisten (Redis), retry otomatis dengan exponential backoff, concurrency control, monitoring support.

**Keputusan:** BullMQ dipilih karena sudah ada Redis dalam stack dan memberikan production-grade reliability.

**Queue names:**
- `upload-processing` — worker concurrency 2, 3 retries
- `report-generation` — worker concurrency 1, 3 retries

**File:** `src/jobs/upload-worker.ts`, `src/jobs/report-worker.ts`

**Catatan peer dependency:** BullMQ 6.x memerlukan Redis 5+, namun proyek menggunakan `redis` package versi 4.x (node_modules). Koneksi worker menggunakan URL string langsung (bukan client instance) sehingga kompatibel.

### 3. PDF Generation: pdfkit

**Dipilih:** pdfkit (native Node.js PDF generation)

**Alternatif yang dipertimbangkan:**
- Puppeteer (headless Chrome): Bisa render HTML ke PDF tapi membutuhkan ~300MB Chrome binary dan lebih lambat.
- `pdfmake`: Lebih deklaratif tapi lebih besar.
- `pdfkit`: Lightweight, no external binaries, cukup untuk laporan tabular.

**Keputusan:** pdfkit cukup untuk kebutuhan laporan finansial berbasis tabel. Puppeteer bisa dipertimbangkan di masa depan jika perlu laporan yang lebih visual.

### 4. Excel Generation: exceljs

**Dipilih:** exceljs

**Alternatif yang dipertimbangkan:**
- `xlsx` (SheetJS): Sudah terinstal untuk parsing. Namun API generation-nya kurang ergonomis dan styling terbatas.
- `exceljs`: API yang lebih baik untuk styling (font bold, background color header), streaming support.

**Keputusan:** exceljs untuk generation (laporan), xlsx tetap dipakai untuk parsing (upload).

### 5. Materialized View Refresh: node-cron

**Dipilih:** node-cron (cron in-process)

**Alternatif yang dipertimbangkan:**
- PostgreSQL pg_cron extension: Tidak tersedia di semua managed PostgreSQL.
- Cron container terpisah: Overhead deployment tambahan.
- node-cron in-process: Sederhana, no external dependency, cukup untuk kebutuhan saat ini.

**Keputusan:** node-cron karena simplicity. Jadwal: setiap 15 menit (`*/15 * * * *`). MV juga di-refresh on-demand setelah setiap upload berhasil.

---

## Consequences

**Positif:**
- Upload dan laporan persisten melewati restart server
- Retry otomatis jika worker gagal (jaringan, DB timeout, dll.)
- File tersimpan di MinIO — bisa diakses dari banyak instance server (horizontal scaling)
- Presigned URL berarti server tidak perlu proxy file download

**Negatif / Trade-offs:**
- BullMQ memerlukan Redis yang sehat — jika Redis down, upload/laporan tidak diproses (bukan hilang, hanya tertunda)
- Worker berjalan in-process bersama HTTP server — untuk skala besar, pisahkan ke container terpisah
- pdfkit tidak support complex layout (chart, image) — pertimbangkan Puppeteer untuk V2

---

## Related ADRs

- [ADR 008](./008-bullmq-for-background-jobs.md) — Keputusan awal memilih BullMQ (sebelum implementasi)
- [ADR 006](./006-materialized-view-for-aggregations.md) — Materialized view strategy
