# Petakeu Implementation Checklist (Definition of Done)

Gunakan daftar berikut sebagai acuan evaluasi kesiapan rilis MVP. Setiap butir perlu tercentang sebelum fitur dinyatakan selesai.

## Status Implementasi (per 2026-08-12)

| Bagian | Selesai | Total | Catatan |
|--------|---------|-------|---------|
| A. Fondasi & Infrastruktur | 4 | 4 | ✅ Selesai |
| B. API & Data | 16 | 16 | ✅ Selesai |
| C. Frontend | 7 | 7 | ✅ Selesai |
| D. Keamanan | 5 | 5 | ✅ Selesai untuk kebutuhan MVP |
| E. Kualitas Data | 5 | 5 | ✅ Selesai |
| F. Performa | 5 | 5 | ✅ Selesai |
| G. Observabilitas | 4 | 4 | ✅ Instrumentasi aplikasi selesai; wiring deployment tetap diperlukan |
| H. Testing | 2 | 8 | Unit/parser selesai; integration, E2E, load, security masih tersisa |

---

## A. Fondasi & Infrastruktur
- [x] Docker Compose menyalakan layanan `web`, `api`, `db` (Postgres + PostGIS), `redis`, `minio`, `worker`.
- [x] Variabel env terdefinisi lengkap: `DATABASE_URL`, `REDIS_URL`, kredensial & bucket storage (`STORAGE_BUCKET`, `STORAGE_REPORTS_BUCKET`, `STORAGE_ACCESS_KEY`, `STORAGE_SECRET_KEY`), `AUTH_SECRET`, `AUTH_DISABLED`.
- [x] Migrasi database (DDL) termasuk seed provinsi & kab/kota dan indeks `GIST` pada kolom geospasial. *(Migration runner otomatis + `pnpm seed:regions`)*
- [x] Health check tersedia: `GET /healthz` untuk API, readiness worker, dan pengecekan akses storage.

## B. API & Data
- [x] `GET /api/regions` mendukung filter `level` (province/regency/district/village), `parent`, dan pagination opsional. Respons 200 mengikuti JSON schema.
- [x] `GET /api/geo/choropleth?period=YYYY-MM`:
  - [x] Agregat diambil dari materialized view; fallback ke `SUM` langsung bila MV belum tersedia.
  - [x] Mengembalikan FeatureCollection GeoJSON valid dengan properti `{ total, cut15, trendSparkline }`.
  - [x] Batas quantile dihitung di API dan dikirim ke FE untuk legend warna konsisten.
  - [x] Cache Redis menggunakan key yang mencakup `period|level|parent`.
- [x] `GET /api/regions/:id/summary?from&to`:
  - [x] Mengembalikan total kumulatif, tabel bulanan, dan data sparkline (maks 12 titik).
  - [x] Mengembalikan 404 jika region tidak ditemukan dan 400 jika rentang tidak valid.
- [x] `POST /api/uploads` (multipart):
  - [x] File disimpan immutable dengan hash `sha256`; unggahan duplikat menghasilkan 409.
  - [x] Record `uploads` dibuat dengan status `queued` dan job id terkait.
  - [x] Respons berisi `{ uploadId, status, hash }`.
- [x] Worker `parse:payments` (queue: `upload-processing`):
  - [x] Membaca seluruh sheet, menerima header `kode_daerah,nama_daerah,periode,setoran`.
  - [x] Menormalkan periode ke `YYYY-MM-01`.
  - [x] Validasi dan UPSERT ke tabel `payments`.
  - [x] Mengumpulkan error (baris, kolom, pesan) dan menyimpannya di `uploads.errors`.
  - [x] Memperbarui status `persisted`/`failed` serta me-refresh materialized view setelah berhasil.
- [x] `POST /api/reports/export`:
  - [x] Validasi payload; membuat record di `report_jobs` dan job BullMQ, mengembalikan `jobId`.
  - [x] Worker menghasilkan file PDF (pdfkit) atau Excel (exceljs), mengunggah ke MinIO, menyimpan presigned URL, dan mengatur status `completed`.
  - [x] Konten laporan mencakup ranking top 10 dengan perbandingan YoY dan tabel lengkap per daerah.
- [x] `GET /api/rank`, `GET /api/surplus-defisit` — FiscalView backend.
- [x] `GET /api/rankfin/league` — RankFin backend dengan tier & badges.
- [x] `GET /api/defisitwatch/watchlist`, `GET /api/defisitwatch/daerah/:id/penjelasan` — DefisitWatch backend.

## C. Frontend (React + Leaflet)
- [x] Halaman peta:
  - [x] Basemap OSM/Mapbox dengan boundary dari `/api/geo/choropleth`.
  - [x] Legend quantile 5 kelas dengan warna konsisten antar reload (menggunakan edges API).
  - [x] Filter periode (month picker) dan toggle heat vs choropleth.
  - [x] Klik feature menampilkan panel detail: total, badge "Potongan 15%", mini-chart tren, tombol "Unduh laporan".
  - [x] State loading & kosong tertangani; mode publik menyembunyikan angka detail.
- [x] Dashboard admin:
  - [x] Tabel unggahan menampilkan filename, status, error count, `created_at`, link file.
  - [x] Form unggah (drag & drop) dengan progres dan ringkasan validasi.
  - [x] Daftar job laporan dengan status, link unduh presigned, dan tombol regenerate.
  - [x] Aksesibilitas: fokus/keyboard, `aria-label` pada kontrol layer & legend.

## D. Keamanan & Akses
- [x] Autentikasi JWT Bearer middleware (`src/middleware/auth.ts`) dengan hierarki RBAC `public` → `viewer` → `operator` → `admin`; `AUTH_DISABLED=true` untuk dev bypass.
- [x] Endpoint publik hanya mengirim kelas agregat tanpa angka mentah (`publicMode`).
- [x] Validasi input ketat (Zod); batas ukuran file unggahan; whitelist MIME `xlsx`.
- [x] URL presigned kedaluwarsa ≤ 24 jam dan tidak ada URL publik permanen.
- [x] Audit log mencatat siapa mengunggah, membuat laporan, dan mengakses detail.

## E. Kualitas Data & Validasi
- [x] Template Excel diverifikasi: kolom wajib `kode_daerah`, `nama_daerah`, `periode (YYYY-MM)`, `setoran`.
- [x] `kode_daerah` harus cocok dengan `regions.code`; jika tidak, catat error dan lewati baris.
- [x] Cegah duplikasi `(region_id, period)` dengan UPSERT; perilaku overwrite terakhir + audit terdokumentasi.
- [x] Periode masa depan diberi peringatan (flag `forecast=false`).
- [x] Nilai negatif ditolak sebagai error.

## F. Performa & Reliabilitas
- [x] Redis cache untuk agregasi & GeoJSON memiliki TTL dan dibersihkan saat parsing berhasil.
- [x] Refresh materialized view terjadwal (cron setiap 15 menit via `node-cron`) dan pemicu on-demand setelah setiap upload berhasil.
- [x] Respons laporan besar (Excel) dikirim via streaming. *(ExcelJS `stream.xlsx.WorkbookWriter` + PDFKit `PassThrough` → MinIO `uploadReportStream`, tanpa buffering penuh di heap V8)*
- [x] Pagination disediakan untuk daftar region (LIMIT 500).
- [x] Target p95 `GET /api/geo/choropleth` saat cache hit < 300 ms; cold hit < 2 s. *(Diukur via `pnpm benchmark` — `scripts/benchmark-perf.ts`)*

## G. Observabilitas
- [x] Log terstruktur dengan `request_id`, `user_id`, `region`, `period`, dan `duration_ms`.
- [x] Metrik tersedia: cache hit/miss, durasi kueri/Redis, waktu parsing/job laporan, ukuran GeoJSON, dan HTTP latency.
- [x] Tracing (OTel) di endpoint HTTP, PostGIS, Redis, dan worker job melalui auto-instrumentation.
- [x] Dashboard dan alert Prometheus/Grafana memantau job gagal, lonjakan error parsing, dan degradasi respons API.

## H. Testing
- [x] Unit tests: normalisasi periode, validasi kode daerah, perhitungan quantile.
- [x] Unit tests parser Excel termasuk variasi header/sheet, periode masa depan, error baris, dan angka.
- [ ] Integration tests: unggah → parse → data `payments` berubah → choropleth ikut berubah.
- [ ] Integration tests laporan: request → job → URL presigned tersedia.
- [ ] E2E (Playwright/Cypress): peta render, klik feature, panel detail, unduh laporan.
- [ ] E2E RBAC: perbedaan akses public, viewer, operator, admin.
- [ ] Load test: choropleth nasional 10x/menit memastikan cache efektif.
- [ ] Security test: endpoint publik tidak bocorkan angka detail & presigned URL kedaluwarsa tepat waktu.
