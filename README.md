## Petakeu — Peta Interaktif Pemasukan Daerah

Platform internal untuk memantau pemasukan daerah melalui peta interaktif, unggahan Excel bulanan, dan generasi laporan otomatis.

### Struktur Monorepo
- `apps/server` — REST API (Express + TypeScript) dengan stub PostGIS/Redis, antrean unggahan, dan endpoint laporan.
- `apps/web` — Frontend React + Leaflet + React Query untuk heatmap, panel detail, dan dashboard admin.
- `packages` — Tempat paket bersama (belum terisi).

### Teknologi Utama
- **Frontend**: React 18, Vite, React Leaflet, Recharts, React Query.
- **Backend**: Express, TypeScript, Multer, Zod, pg (PostgreSQL/PostGIS), Redis SDK.
- **Data**: Rencana PostGIS `regions.geom`, materialized view `mv_payments_with_cut`, cache Redis.

### Setup Awal
1. Gunakan Node.js 18.17 atau lebih baru.
2. Instal dependencies dari root repository:
   ```bash
   npm install
   ```
3. Jalankan backend API:
   ```bash
   npm run dev --workspace @petakeu/server
   ```
   Konfigurasi environment:
   - `PORT` (default `4000`)
   - `DATABASE_URL` (PostgreSQL/PostGIS)
   - `REDIS_URL`
4. Jalankan frontend:
   ```bash
   npm run dev --workspace @petakeu/web
   ```
   Vite akan berjalan di `http://localhost:5173` dan melakukan proxy ke API (`/api` → `http://localhost:4000`).

> Catatan: Data yang digunakan masih mock/sintetis. Integrasi nyata memerlukan koneksi ke database, Redis, dan storage objek (S3/MinIO).

### Mode Pengembangan Frontend (MSW)
- Backend real bisa ditunda: frontend menggunakan [MSW](https://mswjs.io/) untuk memalsukan endpoint `/api`.
- Mock mencakup alur peta, ringkasan wilayah, riwayat unggahan, serta antrean laporan.
- Jalankan perintah di atas (`npm run dev --workspace @petakeu/web`); service worker MSW otomatis aktif pada mode development.
- Konfigurasi publik (`VITE_PUBLIC_MODE=true`) menyembunyikan nilai detail dan hanya menampilkan klasifikasi kuantil.
- Parameter tambahan:
  - `?scenario=normal|spike|missing-geometry` memilih paket data (default `normal`).
  - `?public=1` mengaktifkan mode publik read-only (API hanya mengembalikan kelas kuantil tanpa angka detail).

### API Ringkas (Stub)
- `GET /health`
- `GET /api/regions?level=regency&parent=33`
- `GET /api/regions/:id/summary?from=2025-01&to=2025-08`
- `GET /api/geo/choropleth?period=2025-08`
- `POST /api/uploads` — unggah Excel (multipart/form-data `file`)
- `POST /api/reports` — body `{regionId, periodFrom, periodTo, type}`

### Alur Data (Rencana)
1. **Upload Excel** → Simpan file + hash → antrean parse (stub).
2. **Parser** → validasi template, normalisasi kode daerah, upsert ke tabel `payments`.
3. **Materialized View `mv_payments_with_cut`** → agregasi total + potongan 15%.
4. **Geo Endpoint** → `ST_AsGeoJSON(regions.geom)` + join agregasi → kirim ke frontend (cache Redis).
5. **Laporan** → job generator (PDF/Excel) → simpan ke object storage → URL presigned `reports.url`.

### Roadmap FinMap
- **MVP (3–5 pekan)**: Heatmap provinsi/kabupaten, unggah & parse Excel, panel detail + potongan 15%, laporan PDF dasar.
- **V1**: Filter multi-periode, perbandingan antar daerah, bookmark view, manajemen pengguna dan audit log.
- **V2**: Drill-down kecamatan (jika boundary tersedia), integrasi data real-time.

### Pengembangan Lanjutan
- Lengkapi akses PostGIS/Redis nyata pada service backend.
- Implementasi antrean parsing (BullMQ/worker) & logging error baris.
- Modul generator laporan (PDF/Excel) dan penyimpanan S3/MinIO.
- Auth internal (role Admin/Operator/Viewer) + mode publik heatmap tanpa detail.
