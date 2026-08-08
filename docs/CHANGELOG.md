# Changelog

## 2026-08-09
### Redesigned & Enhanced
- **Donezo Light Layout Redesign**: Transformed full web app UI (`AppLayout.tsx`, `Sidebar.tsx`, `Topbar.tsx`, `global.css`) to match the Donezo light design system with off-white canvas (`#f3f4f6`), rounded cards (`rounded-[24px] bg-white border border-slate-100 shadow-xs`), forest green primary accents (`#044e3a`), and emerald highlights (`#10b981`).
- **Domain Navigation & Header Controls**: Replaced generic task-manager placeholders with authentic Petakeu domain controls:
  - **Sidebar**: Organized into `MODUL ANALISIS` (`Peta Heatmap`, `Ringkasan Laporan`) & `PENGOLAHAN DATA` (`Unggah Data Excel`, `Tentang Petakeu`), featuring a PostGIS spatial verification badge widget.
  - **Topbar**: Regional Search (`Cari Wilayah / Provinsi / Kab / Kota...` with `⌘K`), Period selector (`2024-Q3`), `PostGIS Connected` telemetry badge, and `Analis Eksekutif (BPKAD / Kemendagri)` user chip.
- **Petakeu Executive Dashboard (`MapPage.tsx`)**:
  - Financial KPI Stat Quartet: `Total Realisasi Nominal` (Rp 16.840 M / +5.2% YoY), `Setoran Bersih (85%)` (Rp 14.314 M), `Potongan Wajib (15%)` (Rp 2.526 M), and `Total Wilayah Spasial` (38 Provinsi / 514 Kab/Kota).
  - Centerpiece Map: Interactive Leaflet MultiPolygon Choropleth Map with quantile color scale, hover tooltips showing 15% cut details, quick region filter pills, floating InfoCard HUD, and floating LegendCard HUD.
  - Petakeu Domain Widgets: `Peringkat Realisasi Penerimaan (FiscalView)` ranking table, `Status DefisitWatch (Indeks Risiko Fiskal)` early warning watchlist, `Capaian Realisasi YTD` semi-circular target gauge chart, `RankFin Liga Kinerja Finansial` gamification leaderboard, and `Infrastruktur Telemetri` card (PostGIS 24ms, Redis 99.4% cache hit rate, materialized view refresh button).
- **Sub-pages Styling**: Re-themed `ReportsPage.tsx`, `UploadPage.tsx`, `AboutPage.tsx`, `InfoCard.tsx`, and `LegendCard.tsx` to match the clean white-card Donezo layout.

### Fixed
- **Pino Logger Transport (`@petakeu/server`)**: Added `pino-pretty` to `devDependencies` in `apps/server/package.json` and added safe transport resolution fallback in `apps/server/src/utils/logger.ts` to prevent runtime logger crashes.
- **OpenTelemetry Auto-Instrumentation (`@petakeu/server`)**: Disabled `@opentelemetry/instrumentation-ioredis` in `tracing.ts` and added `ioredis` dependency to eliminate missing internal module errors on server startup.

## 2026-08-03
### Added
- **Full Cyber-GIS Viewport Canvas**: Restructured main layout (`AppLayout.tsx`) to 100% viewport height and width (`h-dvh w-screen`), eliminating the cramped right column for a command-center GIS experience.
- **Floating Executive Glassmorphic HUDs**: Refactored `InfoCard.tsx` and `LegendCard.tsx` into floating HUD panels over the Leaflet map with `backdrop-blur-2xl`, collapse/expand controls, and JetBrains Mono financial currency formatting.
- **Design System & Typography Upgrade**: Integrated Google Fonts (`Outfit`, `Space Grotesk`, `Plus Jakarta Sans`, `JetBrains Mono`) and customized dark mode CSS design tokens (`global.css`).
- **Tailwind CSS v4 Integration**: Upgraded global CSS entry point to `@import "tailwindcss";` for full PostCSS compilation under Tailwind CSS v4.
- **Playwright E2E Visual Test Suite**: Created 14 automated Playwright E2E integration tests in `apps/web/e2e/` capturing visual screenshots across all core views and mobile responsiveness.
- Integrasi database nyata: semua service dimigrasi dari in-memory `Map` ke PostgreSQL; `getPgPool()` digunakan di semua service.
- Migration runner (`src/db/migrate.ts`): migrasi `001_init.sql` dan `002_uploads_reports.sql` berjalan otomatis saat startup.
- Tabel `uploads` dan `report_jobs` di database (`migrations/002_uploads_reports.sql`).
- MinIO/S3 storage client (`src/db/minio.ts`, `src/services/storage-service.ts`) menggunakan `@aws-sdk/client-s3` dengan `forcePathStyle` untuk kompatibilitas MinIO.
- BullMQ background job workers (`src/jobs/upload-worker.ts`, `src/jobs/report-worker.ts`) — Redis-backed, 3 retries dengan exponential backoff, bertahan saat restart.
- Worker upload: parse XLSX → validasi → resolve `kode_bps` ke `region_id` → bulk UPSERT ke tabel `payments` → refresh materialized view.
- Worker laporan: query `mv_payments_with_cut` → generate PDF real (pdfkit) atau Excel real (exceljs) → upload ke MinIO → presigned URL 24 jam.
- Cron refresh materialized view setiap 15 menit (`src/jobs/mv-refresh-cron.ts`, node-cron).
- Auth middleware JWT Bearer (`src/middleware/auth.ts`): verifikasi token, `AUTH_DISABLED=true` untuk bypass development.
- Backend FiscalView: endpoint `GET /rank` dan `GET /surplus-defisit` (`src/services/fiscal-service.ts`).
- Backend RankFin: endpoint `GET /rankfin/league` dengan scoring 3 bulan + tier gold/silver/bronze + badges (`src/services/rankfin-service.ts`).
- Backend DefisitWatch: endpoint `GET /defisitwatch/watchlist` dan `GET /defisitwatch/daerah/:id/penjelasan` dengan skor IRF (`src/services/defisitwatch-service.ts`).
- Seed data wilayah Indonesia (`scripts/seed-regions.ts`): 34 provinsi + 58 kabupaten/kota dengan kode BPS resmi dan geometri PostGIS MultiPolygon.
- Geometri lengkap untuk seluruh kabupaten/kota Sulawesi Selatan (24 wilayah termasuk Kota Makassar kode 7371).
- Script `pnpm seed:regions` untuk inisialisasi data wilayah.
- Graceful shutdown dengan penutupan worker BullMQ dan koneksi DB/Redis.
- ADR 011: mendokumentasikan keputusan arsitektur storage, job queue, dan report generation.

### Changed
- `src/services/region-service.ts`: ditulis ulang menggunakan query PostgreSQL.
- `src/services/geo-service.ts`: ditulis ulang menggunakan `ST_AsGeoJSON(r.geom)` dan `ST_Centroid(r.geom)` dari PostGIS.
- `src/services/upload-service.ts`: ditulis ulang — file disimpan ke MinIO, record ke DB, job dikirim ke BullMQ.
- `src/services/report-service.ts`: ditulis ulang — job ke DB + BullMQ; fake URL dihapus.
- `src/index.ts`: startup sequence diperbarui — migrations → storage → workers → cron → HTTP server.
- `src/config/env.ts`: ditambah konfigurasi `AUTH_DISABLED`, `STORAGE_REPORTS_BUCKET`.
- `src/routes/v1/index.ts`: mendaftarkan router fiscal, rankfin, defisitwatch.
- Semua route di `v1/` ditambah middleware `requireAuth`.
- `src/types/region.ts`: `RegionLevel` diperluas ke `district` dan `village`.
- ADR 007 dan ADR 008: status diubah dari `Proposed` ke `Accepted`.

### Fixed
- Upload pipeline tidak pernah menyimpan data ke tabel `payments` — kini diperbaiki di worker.
- `listReports()` dan `listUploads()` dipanggil tanpa `await` di controller — diperbaiki.
- Materialized view `mv_payments_with_cut` tidak pernah di-refresh — kini di-refresh setelah setiap upload dan via cron setiap 15 menit.
- FiscalView, RankFin, DefisitWatch: endpoint tidak ada di backend — kini tersedia.
- GeoJSON namespace error di `src/types/geo.ts` — diperbaiki dengan import eksplisit dari package `geojson`.
- Hanya 5 mock region (dan Makassar tanpa geometry) — kini 92+ wilayah dengan geometri PostGIS nyata.

## 2025-10-16
### Added
- MSW service worker tersedia di `apps/web/public/mockServiceWorker.js` dan bootstrap `main.tsx` di-update agar selalu memuatnya.
- Mock API kini mendukung skenario `normal`, `spike`, dan `missing-geometry`, termasuk mode publik via `?public=1` dan header `x-scenario`.
- Dataset mock diperluas dengan kota Jakarta, Bandung, Semarang, Surabaya, Denpasar, Makassar (tanpa geometry) lengkap dengan tren 12 bulan.
- Penanganan warning bagi wilayah tanpa boundary, info klasifikasi kuantil, serta parameter `scenario`/`public` otomatis diteruskan ke setiap request.
- Panel detail mendukung mode publik (tanpa angka), menampilkan tabel bulanan dinamis, dan memblokir unduh laporan saat public.
- Admin dashboard menyediakan drag & drop upload dengan progress, detail error baris, tabel job laporan dengan kolom kadaluarsa, serta regenerasi report.
- `docs/frontend-checklist.md` ditambahkan untuk QA React + Leaflet.

### Changed
- `apps/web/package.json` menurunkan `react-leaflet` ke versi 4.2.1 demi kompatibilitas React 18.
- API client dan hooks diperbarui agar aware dengan scenario/public, termasuk fallback public summary.
- Legend & MapView disesuaikan agar menampilkan class label saat publik dan mengecualikan features tanpa geometry.
- README menambahkan instruksi penggunaan parameter skenario dan mode publik pada MSW.

### Fixed
- Error registrasi MSW karena MIME `text/html` dihindari dengan menyajikan worker dari folder `public`.
- Laporan presigned URL mensimulasikan kadaluarsa (30 detik) serta memunculkan status “Kadaluarsa”.
- Upload duplikat mendeteksi berdasarkan hash SHA-256 dan respon 409; file error memunculkan detail baris/kolom.
