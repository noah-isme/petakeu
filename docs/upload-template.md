# Template Unggahan Petakeu

Gunakan templat CSV `template.csv` pada direktori ini ketika menyiapkan data pembayaran. File tersebut dapat langsung dipakai untuk unggahan yang menerima format teks koma-terpisah atau dikonversi ke Excel (`.xlsx`) melalui aplikasi spreadsheet pilihan Anda. Tabel harus berformat **sheet tunggal** dengan baris pertama berisi header berikut:

| Kolom        | Deskripsi                                                                 | Contoh       |
|--------------|----------------------------------------------------------------------------|--------------|
| `kode_bps`   | Kode BPS wilayah (4–6 digit). Wajib diisi dan harus sesuai referensi wilayah. | `3372`       |
| `nama_wilayah` | Nama resmi wilayah administratif.                                         | `Kota Semarang` |
| `periode`    | Periode pelaporan dalam format `YYYY-MM`.                                   | `2025-08`    |
| `nominal`    | Nilai pemasukan bruto dalam Rupiah tanpa pemisah ribuan.                   | `1525000000` |
| `sumber`     | Sumber atau kanal pembayaran.                                              | `PAD`        |

## Validasi Otomatis

Backend melakukan validasi berikut selama proses ETL:

1. **Ukuran File**: Maksimum 10 MB per unggahan. Backend produksi menerima berkas `.xlsx`; jika Anda memulai dari `template.csv`, silakan ekspor ulang ke Excel sebelum mengunggah.
2. **Header Tepat**: Nama kolom harus identik dengan tabel di atas. Kolom tambahan diabaikan.
3. **Format Periode**: Mengikuti pola `YYYY-MM` dan berada dalam rentang kalender yang valid.
4. **Nominal**: Harus berupa angka positif. Nilai negatif atau teks akan dianggap invalid.
5. **Kode & Nama Wilayah**: Tidak boleh kosong. Normalisasi kode dilakukan untuk menghapus spasi.
6. **Dedup**: Setiap file dihitung hash SHA-256; unggahan duplikat akan dikembalikan ke antrean lama.

Baris yang gagal validasi akan dicatat pada `error.csv` untuk unggahan terkait. File tersebut berisi kolom `row,column,message` agar operator bisa memperbaiki data sumber.

## Alur ETL

1. **Unggah** melalui halaman Admin → Upload.
2. **Validasi & Hashing** oleh backend.
3. **Parsing**: Nilai sah dimasukkan ke tabel `payments` (lihat `apps/server/migrations/001_init.sql`).
4. **Materialized View** `mv_payments_with_cut` diperbarui dengan `REFRESH MATERIALIZED VIEW CONCURRENTLY mv_payments_with_cut();`.
5. **Ringkasan** tersedia melalui panel admin dan endpoint choropleth.

## Contoh Data

Lihat `template.csv` untuk tiga baris sampel:

- Kota Semarang (`3372`) periode `2025-08` dengan nominal Rp 1.525.000.000 sumber `PAD`.
- Kab. Kudus (`3315`) periode `2025-08` dengan nominal Rp 845.000.000 sumber `PAD`.
- Kota Jakarta Selatan (`3171`) periode `2025-08` dengan nominal Rp 2.100.000.000 sumber `Lainnya`.

Saat baris invalid ditemukan, backend akan menandai unggahan sebagai `failed` dan menyertakan tautan CSV error di riwayat unggahan.
