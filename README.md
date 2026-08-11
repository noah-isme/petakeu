# Petakeu

![TypeScript](https://img.shields.io/badge/typescript-%23007ACC.svg?style=for-the-badge&logo=typescript&logoColor=white) ![Node.js](https://img.shields.io/badge/node.js-6DA55F?style=for-the-badge&logo=node.js&logoColor=white) ![PostgreSQL](https://img.shields.io/badge/postgresql-4169e1?style=for-the-badge&logo=postgresql&logoColor=white) ![Redis](https://img.shields.io/badge/redis-%23DD0031.svg?style=for-the-badge&logo=redis&logoColor=white) ![MinIO](https://img.shields.io/badge/MinIO-%23C7202C.svg?style=for-the-badge&logo=minio&logoColor=white) ![Turborepo](https://img.shields.io/badge/Turborepo-%23EF4444.svg?style=for-the-badge&logo=turborepo&logoColor=white)

Petakeu: Platform GovTech untuk pemantauan pendapatan fiskal daerah via peta interaktif, impor Excel, dan laporan otomatis.

---

## Quick Start (Docker Compose)

Cara tercepat untuk menjalankan seluruh aplikasi beserta layanannya:

```bash
docker-compose -f docker-compose.dev.yml up -d
docker-compose -f docker-compose.dev.yml exec server pnpm seed:regions
# Frontend: http://localhost:5173
# API: http://localhost:4000
# MinIO: http://localhost:9001 (minioadmin/minioadmin)
```

---

## Local Development

### Prerequisites
- **Node.js**: v18+
- **pnpm**: v8+
- **Docker & Docker Compose** (untuk menjalankan backing services)

### Setup Steps
1. **Jalankan Backing Services**:
   ```bash
   docker-compose -f docker-compose.dev.yml up db redis minio -d
   ```
2. **Install Dependencies**:
   ```bash
   pnpm install
   ```
3. **Salin File Environment**:
   ```bash
   cp apps/server/.env.example apps/server/.env
   cp apps/web/.env.example apps/web/.env
   ```
4. **Seed Data Wilayah**:
   ```bash
   pnpm seed:regions
   ```
5. **Jalankan Development Server**:
   ```bash
   pnpm dev
   ```

---

## Scripts Reference

| Perintah | Deskripsi |
| --- | --- |
| `pnpm dev` | Menjalankan frontend (`apps/web`) dan backend (`apps/server`) secara bersamaan |
| `pnpm dev:web` | Menjalankan aplikasi frontend (React) saja |
| `pnpm dev:server` | Menjalankan aplikasi backend (Express API) saja |
| `pnpm lint` | Menjalankan linter ESLint pada seluruh proyek |
| `pnpm typecheck` | Menjalankan verifikasi tipe TypeScript pada seluruh proyek |
| `pnpm test` | Menjalankan seluruh unit test server dan web melalui Turborepo |
| `pnpm build` | Membangun (build) seluruh aplikasi untuk lingkungan produksi |
| `pnpm seed:regions` | Menjalankan script seeder untuk mengisi data referensi wilayah ke database |
| `pnpm benchmark` | Menjalankan benchmark latency choropleth (cache hit/cold miss) |

---

## Project Structure

```text
petakeu/
├── apps/
│   ├── server/             # Express Backend
│   │   ├── migrations/     # Database migration SQL files
│   │   ├── src/
│   │   │   ├── controllers/# Route handlers
│   │   │   ├── db/         # Postgres pool, Redis, MinIO clients
│   │   │   ├── jobs/       # BullMQ background workers (upload & report)
│   │   │   ├── middleware/ # Authentication & request middleware
│   │   │   ├── routes/     # Express API route definitions
│   │   │   └── services/   # Business logic (MinIO, Reports, GIS)
│   │   └── package.json
│   └── web/                # React Frontend
│       ├── src/
│       │   ├── api/        # API client
│       │   ├── components/ # Reusable UI components
│       │   ├── hooks/      # React Query data hooks
│       │   └── pages/      # Application view pages
│       └── package.json
├── package.json            # Root workspace configuration
└── turbo.json              # Turborepo task pipeline configuration
```

---

## API Reference

Seluruh endpoint aplikasi berada di bawah `base_url: /api`. Endpoint operasional
`/healthz`, `/ready`, `/live`, dan `/metrics` berada di root server.

| Endpoint | Method | Keterangan |
| --- | --- | --- |
| `/healthz` | `GET` | Healthcheck service status |
| `/ready` / `/live` | `GET` | Readiness dan liveness probe |
| `/metrics` | `GET` | Metrik Prometheus |
| `/api/regions` | `GET` | Daftar wilayah. Mendukung query `level=province\|regency...` dan `parent=UUID` |
| `/api/regions/:id/summary` | `GET` | Ringkasan data untuk wilayah tertentu berdasar `from` & `to` |
| `/api/geo/choropleth` | `GET` | Data GeoJSON untuk visualisasi peta choropleth |
| `/api/uploads` | `POST` | Unggah file Excel (`multipart/form-data`, field: `file`) |
| `/api/uploads` | `GET` | Riwayat dan status unggahan data |
| `/api/uploads/:id` | `GET` | Detail status unggahan spesifik |
| `/api/reports/export` | `POST` | Buat laporan baru. Body: `{ period, regionIds[], format: 'pdf'\|'excel' }` |
| `/api/reports` | `GET` | Daftar antrean dan riwayat laporan |
| `/api/reports/:id` | `GET` | Cek status laporan dan dapatkan `download_url` |
| `/api/rank` | `GET` | (FiscalView) Peringkat daerah (mis. top 20 pendapatan) |
| `/api/surplus-defisit` | `GET` | (FiscalView) Data ringkasan surplus/defisit |
| `/api/rankfin/league` | `GET` | (RankFin) Data liga kinerja finansial |
| `/api/defisitwatch/watchlist` | `GET` | (DefisitWatch) Daftar daerah dengan risiko defisit |
| `/api/defisitwatch/daerah/:id/penjelasan` | `GET` | (DefisitWatch) Penjelasan detail penyebab risiko defisit |
| `/api/analytics/overview` | `GET` | KPI, tren bulanan, target-vs-actual, YoY, perbandingan provinsi, dan reporting matrix (role `viewer+`) |
| `/api/analytics/targets` | `GET` / `POST` | Baca target pendapatan (`viewer+`) atau daftarkan target (`operator+`) |
| `/api/approvals/...` | `GET` / `POST` | Submit, review, approve, publish workflow dan lock/unlock periode fiskal |

Endpoint API yang membaca data memerlukan JWT Bearer sesuai role. Hierarki role
adalah `public` → `viewer` → `operator` → `admin`; `AUTH_DISABLED=true` hanya
untuk development lokal.

---

## Environment Variables

Dokumentasi detail mengenai seluruh konfigurasi environment variables backend dan frontend dapat dilihat di [docs/environment-variables.md](docs/environment-variables.md).

---

## Database Migrations

Petakeu menggunakan custom SQL migration runner yang dijalankan secara otomatis saat server backend dimulai. Riwayat eksekusi migrasi disimpan dalam tabel `_migrations`.

Untuk menambahkan migrasi baru:
1. Buat file SQL baru di dalam direktori `apps/server/migrations/` dengan urutan penamaan numerik (contoh: `003_fitur_baru.sql`).
2. Tulis perintah DDL/DML SQL yang dibutuhkan.
3. Jalankan server (`pnpm dev` atau `pnpm dev:server`). Migration runner akan mendeteksi dan mengeksekusi file migrasi baru secara otomatis.

---

## Upload Template

Sistem mendukung pengunggahan data pendapatan fiskal menggunakan berkas Excel. Sheet pertama berkas harus memiliki kolom wajib berikut:
- `kode_bps`: Kode resmi BPS daerah (contoh: `7371`)
- `period`: Periode pelaporan berformat `YYYY-MM`
- `amount`: Nilai nominal pendapatan (angka)
- `source`: Sumber pendapatan (teks)

Untuk petunjuk pengisian lengkap dan templat contoh, silakan merujuk ke [docs/upload-template.md](docs/upload-template.md).

---

## Documentation

Informasi arsitektur dan spesifikasi proyek lebih lanjut dapat diakses pada dokumentasi berikut:
- [PRD](docs/PRD.md) — Product requirements
- [Architecture](docs/ARCHITECTURE.md) — System design
- [Design](docs/DESIGN.md) — UI/UX spec
- [ADRs](docs/adr/) — Architecture decisions
- [Roadmap](docs/ROADMAP.md) — What's next

---

## Contributing

Saat melakukan pengembangan dan memberikan kontribusi pada proyek ini:
- **Database**: Selalu buat file migrasi SQL di `apps/server/migrations/` jika terdapat perubahan pada skema database.
- **Type Checking**: Jalankan `pnpm typecheck` sebelum melakukan komit untuk memastikan tidak ada kesalahan tipe TypeScript.
- **Verification**: Jalankan `pnpm lint` dan `pnpm test`; gunakan `pnpm build` untuk perubahan lintas aplikasi.
- **Commit**: Gunakan Conventional Commits (`feat:`, `fix:`, `docs:`, `test:`, atau `chore:`) dengan subject singkat yang menjelaskan perubahan.
- **Performa PostGIS**: Pertimbangkan efisiensi rendering spasial dan ukuran payload GeoJSON saat mengolah data peta interaktif.
