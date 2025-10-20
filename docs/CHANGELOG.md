# Changelog

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
