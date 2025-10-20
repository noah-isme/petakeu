# Frontend QA Checklist

Gunakan daftar cepat ini untuk memastikan skenario UI React + Leaflet (dengan MSW) berjalan sesuai DoD.

## 1. Peta & Choropleth
- [ ] `npm run dev --workspace @petakeu/web` berjalan dan MSW register tanpa error.
- [ ] `/` dengan `?scenario=normal` menampilkan heatmap 5 kelas (Jakarta, Bandung, Semarang, Surabaya, Denpasar).
- [ ] Toggle choropleth/heatmap bekerja dan warna stabil saat reload (legend mengikuti metadata).
- [ ] Klik tiap kota membuka panel detail dengan total, potongan 15%, tren 12 bulan, tabel bulanan, tombol unduh.
- [ ] Mode publik (`?public=1`) hanya menampilkan kelas kuantil, panel detail menunjukkan badge “Mode Publik” dan tidak ada angka.
- [ ] Skenario `?scenario=spike` menampilkan lonjakan warna pada Surabaya & Jakarta di 2025-08.
- [ ] Skenario `?scenario=missing-geometry` memunculkan warning Makassar tanpa geometry dan tidak crash.

## 2. Upload Excel
- [ ] Unggah file baru → status `queued → processing → parsed`, link file muncul setelah selesai.
- [ ] Unggah file yang sama → API mengembalikan 409 Duplicate (muncul pesan status).
- [ ] File bermasalah memicu status `failed` dan kolom “Detail Error” berisi daftar baris/kolom.

## 3. Job Laporan
- [ ] Submit permintaan laporan → status berubah `queued → processing → completed`.
- [ ] URL unduhan tersedia saat `completed` lalu kadaluarsa < 30 detik, kolom “Kedaluwarsa” memperlihatkan “Kadaluarsa”.
- [ ] Tombol regenerate membuat job baru dan menambah entri daftar.

## 4. Aksesibilitas & UX
- [ ] Toolbar peta, legend, panel detail, dan tabel dapat diakses keyboard / screen reader (periksa `aria-label` dan focus).
- [ ] Notifikasi status dan warning menggunakan `role="status"` atau alert sesuai.

## 5. Konfigurasi MSW / Lingkungan
- [ ] `mockServiceWorker.js` tersedia di `apps/web/public/` dan tidak hilang saat build ulang.
- [ ] Parameter `scenario` dan `public` ikut diteruskan saat API call (cek tab Network → Request URL).
