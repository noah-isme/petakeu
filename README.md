# Petakeu — Peta Interaktif Pemasukan Daerah

![TypeScript](https://img.shields.io/badge/typescript-%23007ACC.svg?style=for-the-badge&logo=typescript&logoColor=white) ![Node.js](https://img.shields.io/badge/node.js-6DA55F?style=for-the-badge&logo=node.js&logoColor=white) ![PostgreSQL](https://img.shields.io/badge/postgresql-4169e1?style=for-the-badge&logo=postgresql&logoColor=white) ![Redis](https://img.shields.io/badge/redis-%23DD0031.svg?style=for-the-badge&logo=redis&logoColor=white) ![MinIO](https://img.shields.io/badge/MinIO-%23C7202C.svg?style=for-the-badge&logo=minio&logoColor=white) ![Turborepo](https://img.shields.io/badge/Turborepo-%23EF4444.svg?style=for-the-badge&logo=turborepo&logoColor=white)

**Petakeu** adalah platform GovTech untuk memantau pendapatan fiskal daerah (regional fiscal revenue) melalui peta interaktif (interactive maps), unggahan data Excel, dan pembuatan laporan otomatis. Proyek ini dibangun dengan arsitektur monorepo menggunakan Turborepo, didukung oleh backend nyata dan _message queue_ tangguh.

---

## Fitur Utama (Features Overview)

Platform ini memiliki Dashboard utama (MapDashboard) dengan 4 tab analisis dan modul pengolahan data:

- **Overview (Choropleth)**: Visualisasi peta interaktif dengan kode warna (choropleth) berdasarkan data pendapatan fiskal.
- **FiscalView**: Peringkat (ranking) pendapatan fiskal teratas dan pemantauan surplus/defisit per periode.
- **RankFin**: Liga gamifikasi (gamification league) kinerja finansial antar daerah.
- **DefisitWatch**: Sistem peringatan dini (early warning) risiko Indeks Risiko Fiskal (IRF).
- **Upload Data (Excel)**: Fitur _drag-and-drop_ untuk mengunggah file Excel. Mendukung validasi data, pemrosesan latar belakang (background processing), dan UPSERT bulk ke database.
- **Report Generation**: Pembuatan laporan otomatis (PDF/Excel) dengan unduhan melalui presigned URL (tersimpan di MinIO/S3).

---

## Arsitektur (Architecture)

```text
Users → Nginx → React App (static)
                   ↓
             Express API (port 4000)
                /    |    \
         PgSQL  Redis  MinIO
                |
           BullMQ Workers
           (upload + report)
```

---

## Tech Stack

| Kategori | Teknologi | Deskripsi |
| --- | --- | --- |
| **Frontend** | React 18, Vite, React Leaflet, Recharts, React Query, Tailwind CSS v4 | UI Cyber-GIS interaktif, visualisasi peta choropleth & glassmorphism |
| **Testing** | Playwright E2E, Vitest | Pengujian E2E otomatis dengan penangkapan tangkapan layar (visual testing) |
| **Backend** | Express 4, TypeScript | REST API layer |
| **Database** | PostgreSQL 16 + PostGIS 3.4 | Penyimpanan relasional dan data spasial (geometries) |
| **Caching & Queue** | Redis 7, BullMQ | Job queue untuk unggahan dan laporan dengan 3 retries (exponential backoff) |
| **Storage** | MinIO, AWS SDK S3 | Object storage untuk file unggahan dan dokumen unduhan |
| **Reports** | pdfkit, exceljs | Generator PDF dan Excel |
| **Monorepo** | Turborepo, pnpm workspaces | Manajemen struktur multi-package |

---

## Quick Start (Docker Compose)

Cara tercepat untuk menjalankan aplikasi adalah menggunakan Docker Compose:

```bash
# 1. Jalankan semua services (DB, Redis, MinIO, API, Web)
docker-compose -f docker-compose.dev.yml up -d

# 2. Seed data wilayah awal (Provinsi & Kabupaten/Kota)
docker-compose -f docker-compose.dev.yml exec server pnpm seed:regions

# 3. Akses aplikasi
# Frontend: http://localhost:5173
# API: http://localhost:4000
# MinIO Console: http://localhost:9001 (minioadmin / minioadmin)
```

---

## Local Development Setup

Untuk pengembangan lokal tanpa menjalankan Node.js di dalam Docker:

1. **Prerequisites**: Node.js 18+, `pnpm` v8+, Docker & Docker Compose.
2. **Jalankan Services Pendukung (DB, Redis, MinIO)**:
   ```bash
   # Pastikan Anda mengomentari (comment out) web dan server di docker-compose.dev.yml jika ada
   docker-compose -f docker-compose.dev.yml up db redis minio -d
   ```
3. **Install Dependencies**:
   ```bash
   pnpm install
   ```
4. **Environment Variables**:
   Salin file `.env.example` ke `.env` di masing-masing apps (`apps/server/.env`, `apps/web/.env`).
   Pastikan pengaturan koneksi DB, Redis, dan MinIO sesuai.
5. **Seed Regions Data**:
   ```bash
   cd apps/server && pnpm seed:regions
   ```
6. **Jalankan Development Server**:
   ```bash
   # Menjalankan frontend dan backend secara paralel (di root directory)
   pnpm dev
   ```

---

## API Reference

Seluruh endpoint backend berada di bawah `base_url: /api/v1`. 

| Endpoint | Method | Keterangan |
| --- | --- | --- |
| `/health` | `GET` | Healthcheck service status |
| `/api/v1/regions` | `GET` | Daftar wilayah. Mendukung query `level=province\|regency...` dan `parent=UUID` |
| `/api/v1/regions/:id/summary` | `GET` | Ringkasan data untuk wilayah tertentu berdasar `from` & `to` |
| `/api/v1/geo/choropleth` | `GET` | Data GeoJSON untuk visualisasi peta choropleth |
| `/api/v1/uploads` | `POST` | Unggah file excel (`multipart/form-data`, field: `file`) |
| `/api/v1/uploads` | `GET` | Riwayat dan status unggahan data |
| `/api/v1/uploads/:id` | `GET` | Detail status unggahan spesifik |
| `/api/v1/reports/export` | `POST` | Buat laporan baru. Body: `{ period, regionIds[], format: 'pdf'\|'excel' }` |
| `/api/v1/reports` | `GET` | Daftar antrean dan riwayat laporan |
| `/api/v1/reports/:id` | `GET` | Cek status laporan dan dapatkan `download_url` |
| `/api/v1/rank` | `GET` | (FiscalView) Peringkat daerah (mis. top 20 pendapatan) |
| `/api/v1/surplus-defisit` | `GET` | (FiscalView) Data ringkasan surplus/defisit |
| `/api/v1/rankfin/league` | `GET` | (RankFin) Data liga kinerja finansial |
| `/api/v1/defisitwatch/watchlist` | `GET` | (DefisitWatch) Daftar daerah dengan risiko defisit |
| `/api/v1/defisitwatch/daerah/:id/penjelasan` | `GET` | (DefisitWatch) Penjelasan detail penyebab risiko defisit |

---

## Format File Upload (Excel Template)

Sistem menggunakan background worker untuk memvalidasi dan memproses Excel.
Kolom yang wajib ada pada sheet pertama:
- `kode_bps`: Kode resmi BPS daerah (contoh: 7371 untuk Kota Makassar)
- `period`: Periode pelaporan berformat YYYY-MM
- `amount`: Nilai nominal pendapatan (angka)
- `source`: Sumber pendapatan (teks)

---

## Autentikasi (Authentication)

API diproteksi menggunakan **JWT Bearer Tokens**.
- **Production Mode**: Header request harus menyertakan `Authorization: Bearer <token>`. Secret key diatur melalui variabel `AUTH_SECRET`.
- **Development Mode**: Secara default, mode pengembangan menonaktifkan auth sepenuhnya dengan env `AUTH_DISABLED=true`. Akses bebas tanpa token. Middleware otorisasi terdapat pada `src/middleware/auth.ts` (mendukung `requireAuth` dan `requireRole('admin')`).

---

## Migrasi Database (Database Migrations)

Skema database mencakup tabel `regions`, `payments`, `uploads`, `report_jobs`, serta sebuah *materialized view* `mv_payments_with_cut` (PostGIS extension).

- **Startup sequence**: Migrasi (seperti `001_init.sql` dan `002_uploads_reports.sql`) dieksekusi secara otomatis setiap kali server dihidupkan melalui script di `src/index.ts`.
- **Menambahkan Migrasi**: Tambahkan file `.sql` baru di `apps/server/src/db/migrations/` (format: `003_your_migration.sql`). Tabel `_migrations` melacak riwayat migrasi yang telah diterapkan.

---

## Background Jobs (BullMQ)

Untuk menangani proses berat (heavy-lifting) secara tangguh dan tidak memblokir HTTP threads, Petakeu menggunakan **BullMQ** (Redis-backed). Terdapat tiga komponen asinkron utama:
1. **Upload Worker** (`upload-processing`): Membaca Excel dari MinIO, memvalidasi isian, mencari `kode_bps` -> `region_id`, melakukan bulk UPSERT ke tabel `payments`, dan me-refresh materialized view.
2. **Report Worker** (`report-generation`): Melakukan query data agregasi dari `mv_payments_with_cut`, menggunakan `pdfkit` atau `exceljs` untuk merangkai laporan, mengunggah ke MinIO, dan menyimpan presigned URL pada tabel `report_jobs`.
3. **Cron Job**: Cron job (`node-cron`) yang menjalankan refresh pada `mv_payments_with_cut` setiap 15 menit agar choropleth maps dan ranking tetap aktual (up-to-date).

---

## Struktur Direktori (Project Structure)

```text
petakeu/
├── apps/
│   ├── server/             # Express Backend
│   │   ├── src/
│   │   │   ├── controllers/# Route handlers
│   │   │   ├── db/         # Migrations, seeders, PG pool
│   │   │   ├── jobs/       # BullMQ workers (upload, report)
│   │   │   ├── middleware/ # Auth, file uploads
│   │   │   ├── routes/     # API v1 routes
│   │   │   ├── services/   # Business logic (MinIO, Reports)
│   │   │   └── index.ts    # Entry point & startup sequence
│   │   └── package.json
│   └── web/                # React Frontend
│       ├── src/
│       │   ├── components/ # Reusable UI
│       │   ├── features/   # MapDashboard, RankFin, DefisitWatch
│       │   ├── pages/      # Route pages
│       │   ├── services/   # API hooks (React Query)
│       │   └── App.tsx
│       └── package.json
├── package.json            # Root workspace
└── turbo.json              # Turborepo config
```

---

## Scripts Reference

Berikut ini daftar *commands* penting yang bisa dijalankan dari _root directory_ monorepo.

| Script | Perintah | Keterangan |
| --- | --- | --- |
| `pnpm install` | - | Menginstal seluruh _dependencies_ workspace |
| `pnpm dev` | `turbo run dev` | Menjalankan frontend dan backend mode paralel |
| `pnpm dev:web` | `pnpm --filter web dev` | Hanya menjalankan frontend |
| `pnpm dev:server`| `pnpm --filter server dev` | Hanya menjalankan backend |
| `pnpm lint` | `turbo run lint` | Menjalankan ESLint pada semua apps |
| `pnpm typecheck` | `turbo run typecheck` | Validasi TypeScript |
| `pnpm build` | `turbo run build` | Proses _build_ untuk production |
| `pnpm seed:regions` | `pnpm --filter server seed:regions` | Mengisi data wilayah (di root, atau `cd apps/server && pnpm seed:regions`) |

---

## Contributing

Ketika berkontribusi, pastikan setiap penambahan fitur atau modifikasi tabel diikuti dengan file migrasi yang sesuai dan pengecekan tipe (`pnpm typecheck`). Perubahan pada antarmuka peta perlu mempertimbangkan performa _rendering_ untuk dataset berbasis poligon (PostGIS).
