# Development dengan Mock Service Worker (MSW)

## Status Backend
Backend saat ini dalam status **PENDING**, sehingga pengembangan frontend menggunakan **Mock Service Worker (MSW)** untuk mensimulasikan semua API endpoint.

## Cara Menjalankan

### 1. Jalankan Frontend dengan MSW
```bash
cd /home/noah/project/petakeu
npm run dev --workspace @petakeu/web
```

Frontend akan berjalan di: **http://localhost:5175**

### 2. MSW Akan Otomatis Aktif
MSW akan otomatis diinisialisasi saat aplikasi dimuat. Anda akan melihat pesan di browser console:
```
[MSW] Mocking enabled.
```

## Fitur yang Tersedia dengan MSW

### ✅ Tab Overview (Map Dashboard)
- Peta choropleth interaktif dengan data mock
- Detail region dengan ringkasan data
- Mode: Choropleth / Heatmap
- Download report (simulasi)

### ✅ Tab Fiscal
- KPI Cards (Total Realisasi, Rata-rata Capai, Surplus/Defisit)
- Ranking Penerimaan Daerah
- Peta Surplus/Defisit
- Export ke Excel/PDF (simulasi)

### ✅ Tab RankFin (Gamifikasi)
- League Tiers: Gold, Silver, Bronze
- Ranking lengkap dengan badges
- Score dan achievement tracking

### ✅ Tab DefisitWatch (Early Warning)
- Watchlist daerah berisiko
- Detail per daerah dengan IRF (Indicator Risk Factor)
- Kategori: Red (Critical), Orange (Warning), Green (Safe)
- Proyeksi dan grafik kas

### ✅ Tab Admin Dashboard
- Upload file Excel (.xlsx)
- Status upload tracking
- Report jobs management

## Skenario Mock Data

Anda dapat mengubah skenario data dengan mengedit `.env.local`:

```env
# Pilihan skenario:
# - normal: Data seimbang
# - high-income: Daerah dengan pendapatan tinggi
# - deficit-crisis: Simulasi krisis defisit

VITE_SCENARIO=normal
```

Atau tambahkan query parameter di URL:
- `http://localhost:5175?scenario=high-income`
- `http://localhost:5175?scenario=deficit-crisis`

## Public Mode

Untuk mode publik (tanpa fitur admin):
```env
VITE_PUBLIC_MODE=true
```

Atau gunakan query parameter:
- `http://localhost:5175?public=1`

## Endpoint API yang Dimock

Semua endpoint berikut sudah dimock oleh MSW:

### Core API
- `GET /api/regions` - Daftar wilayah
- `GET /api/geo/choropleth` - Data peta choropleth
- `GET /api/regions/:id/summary` - Detail ringkasan region

### Fiscal API
- `GET /api/rank` - Ranking penerimaan
- `GET /api/surplus-defisit` - Data surplus/defisit
- `GET /api/alert` - Alert notifications

### RankFin API
- `GET /api/rankfin/league` - Data league ranking
- `GET /api/rankfin/badges/:regionId` - Badges per region

### DefisitWatch API
- `GET /api/defisitwatch/watchlist` - Daftar watchlist
- `GET /api/defisitwatch/daerah/:regionId/penjelasan` - Detail region

### Admin API
- `GET /api/uploads` - Daftar upload
- `POST /api/uploads` - Upload file
- `GET /api/reports` - Daftar report jobs
- `POST /api/reports` - Create report job

## Struktur Mock Data

Mock data tersimpan di:
```
apps/web/src/mocks/
├── browser.ts          # MSW worker setup
├── handlers.ts         # API request handlers
├── data/
│   ├── regions.ts      # Data wilayah & geometri
│   ├── scenarios.ts    # Data skenario & payment
│   └── fiscal.ts       # Data fiscal, ranking, dll
└── utils/
    └── math.ts         # Utility functions
```

## Troubleshooting

### MSW tidak terdeteksi?
1. Cek browser console untuk pesan `[MSW] Mocking enabled`
2. Pastikan file `public/mockServiceWorker.js` ada
3. Clear cache browser dan reload

### Data tidak muncul?
1. Buka Browser DevTools → Network
2. Pastikan request API muncul dengan status 200
3. Cek console untuk error messages

### Port sudah digunakan?
Edit `vite.config.ts` untuk mengubah port:
```typescript
export default defineConfig({
  server: {
    port: 5176 // ganti port
  }
})
```

## Next Steps

Ketika backend sudah siap:
1. Nonaktifkan MSW dengan menghapus/comment kode di `main.tsx`
2. Update `VITE_API_BASE_URL` di `.env.local` ke URL backend
3. Pastikan CORS sudah dikonfigurasi di backend

---

**Status**: ✅ **MSW AKTIF & BERJALAN**  
**URL**: http://localhost:5175  
**Last Updated**: 21 Oktober 2025
