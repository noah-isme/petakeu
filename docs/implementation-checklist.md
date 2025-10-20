# Petakeu Implementation Checklist (Definition of Done)

Gunakan daftar berikut sebagai acuan evaluasi kesiapan rilis MVP. Setiap butir perlu tercentang sebelum fitur dinyatakan selesai.

## A. Fondasi & Infrastruktur
- [ ] Docker Compose menyalakan layanan `web`, `api`, `db` (Postgres + PostGIS), `redis`, `minio`, `worker`.
- [ ] Variabel env terdefinisi lengkap: `DATABASE_URL`, `REDIS_URL`, kredensial & bucket storage (`STORAGE_BUCKET`, `STORAGE_KEY`, dst.), `MAP_TILE_KEY` (opsional), `AUTH_SECRET`.
- [ ] Migrasi database (DDL) termasuk seed provinsi & kab/kota dan indeks `GIST` pada kolom geospasial.
- [ ] Health check tersedia: `GET /healthz` untuk API, readiness worker, dan pengecekan akses storage.

## B. API & Data
- [ ] `GET /api/regions` mendukung filter `level`, `parent`, dan pagination opsional. Respons 200 mengikuti JSON schema.
- [ ] `GET /api/geo/choropleth?period=YYYY-MM`:
  - [ ] Agregat diambil dari materialized view; fallback ke `SUM` langsung bila MV belum tersedia.
  - [ ] Mengembalikan FeatureCollection GeoJSON valid dengan properti `{ total, cut15, trendSparkline }`.
  - [ ] Batas quantile dihitung di API dan dikirim ke FE untuk legend warna konsisten.
  - [ ] Cache Redis menggunakan key yang mencakup `period|level|parent`.
- [ ] `GET /api/regions/:id/summary?from&to`:
  - [ ] Mengembalikan total kumulatif, tabel bulanan, dan data sparkline (maks 12 titik).
  - [ ] Mengembalikan 404 jika region tidak ditemukan dan 400 jika rentang tidak valid.
- [ ] `POST /api/uploads` (multipart):
  - [ ] File disimpan immutable dengan hash `sha256`; unggahan duplikat menghasilkan 409.
  - [ ] Record `uploads` dibuat dengan status `queued` dan job id terkait.
  - [ ] Respons berisi `{ upload_id }`.
- [ ] Worker `parse:payments`:
  - [ ] Membaca seluruh sheet, menerima header `kode_daerah,nama_daerah,periode,setoran`.
  - [ ] Menormalkan periode ke `YYYY-MM-01`.
  - [ ] Validasi dan UPSERT ke tabel `payments`.
  - [ ] Mengumpulkan error (baris, kolom, pesan) dan menyimpannya di `uploads.errors`.
  - [ ] Memperbarui status `parsed`/`failed` serta menghapus cache periode terkait.
- [ ] `POST /api/reports`:
  - [ ] Validasi payload; membuat job `report:generate` dan mengembalikan `job_id`.
  - [ ] Worker menghasilkan file (PDF/Excel), mengunggah ke bucket, menyimpan `reports.url` (presigned), dan mengatur status `done`.
  - [ ] Konten laporan mencakup ringkasan, top 10 daerah, peta kecil (spark choropleth), tren 12 bulan, dan tabel per daerah.

## C. Frontend (React + Leaflet)
- [ ] Halaman peta:
  - [ ] Basemap OSM/Mapbox dengan boundary dari `/api/geo/choropleth`.
  - [ ] Legend quantile 5 kelas dengan warna konsisten antar reload (menggunakan edges API).
  - [ ] Filter periode (month picker) dan toggle heat vs choropleth.
  - [ ] Klik feature menampilkan panel detail: total, badge “Potongan 15%”, mini-chart tren, tombol “Unduh laporan”.
  - [ ] State loading & kosong tertangani; mode publik menyembunyikan angka detail.
- [ ] Dashboard admin:
  - [ ] Tabel unggahan menampilkan filename, status, error count, `created_at`, link file.
  - [ ] Form unggah (drag & drop) dengan progres dan ringkasan validasi.
  - [ ] Daftar job laporan dengan status, link unduh presigned, dan tombol regenerate.
  - [ ] Aksesibilitas: fokus/keyboard, `aria-label` pada kontrol layer & legend.

## D. Keamanan & Akses
- [ ] Autentikasi JWT/SSO dengan middleware RBAC (Admin, Operator, Viewer, Public).
- [ ] Endpoint publik hanya mengirim kelas agregat tanpa angka mentah.
- [ ] Validasi input ketat (celebrate/zod/pydantic); batas ukuran file unggahan; whitelist MIME `xlsx`.
- [ ] URL presigned kedaluwarsa ≤ 24 jam dan tidak ada URL publik permanen.
- [ ] Audit log mencatat siapa mengunggah, membuat laporan, dan mengakses detail.

## E. Kualitas Data & Validasi
- [ ] Template Excel diverifikasi: kolom wajib `kode_daerah`, `nama_daerah`, `periode (YYYY-MM)`, `setoran`.
- [ ] `kode_daerah` harus cocok dengan `regions.code`; jika tidak, catat error dan lewati baris.
- [ ] Cegah duplikasi `(region_id, period)` dengan UPSERT; perilaku overwrite terakhir + audit terdokumentasi.
- [ ] Periode masa depan diberi peringatan (flag `forecast=false`).
- [ ] Nilai negatif ditolak sebagai error.

## F. Performa & Reliabilitas
- [ ] Redis cache untuk agregasi & GeoJSON memiliki TTL dan dibersihkan saat parsing berhasil.
- [ ] Refresh materialized view terjadwal (cron) dan tersedia pemicu on-demand untuk periode yang berubah.
- [ ] Respons laporan besar (Excel) dikirim via streaming.
- [ ] Pagination disediakan untuk daftar region & ringkasan bila diperlukan.
- [ ] Target p95 `GET /api/geo/choropleth` saat cache hit < 300 ms; cold hit < 2 s.

## G. Observabilitas
- [ ] Log terstruktur dengan `request_id`, `user_id`, `region`, `period`.
- [ ] Metrik tersedia: cache hit/miss, durasi kueri, waktu parsing/job laporan, ukuran GeoJSON.
- [ ] Tracing (OTel) di endpoint berat dan worker job.
- [ ] Dashboard alert memantau job gagal & lonjakan error parsing.

## H. Testing
- [ ] Unit tests: normalisasi periode, validasi kode daerah, perhitungan quantile.
- [ ] Unit tests parser Excel termasuk variasi header/sheet dan angka format `1.234,56`.
- [ ] Integration tests: unggah → parse → data `payments` berubah → choropleth ikut berubah.
- [ ] Integration tests laporan: request → job → URL presigned tersedia.
- [ ] E2E (Playwright/Cypress): peta render, klik feature, panel detail, unduh laporan.
- [ ] E2E RBAC: perbedaan akses public, viewer, operator, admin.
- [ ] Load test: choropleth nasional 10x/menit memastikan cache efektif.
- [ ] Security test: endpoint publik tidak bocorkan angka detail & presigned URL kedaluwarsa tepat waktu.
