import 'dotenv/config';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

function makeBboxMultiPolygon(lon1: number, lat1: number, lon2: number, lat2: number): string {
  return `MULTIPOLYGON(((${lon1} ${lat1}, ${lon2} ${lat1}, ${lon2} ${lat2}, ${lon1} ${lat2}, ${lon1} ${lat1})))`;
}

interface ProvinceData {
  code: string;
  name: string;
  bbox: [number, number, number, number]; // [lon1, lat1, lon2, lat2]
}

interface RegencyData {
  code: string;
  name: string;
  parentCode: string;
  bbox: [number, number, number, number];
}

const PROVINCES: ProvinceData[] = [
  { code: '11', name: 'Aceh', bbox: [95.0, -6.0, 98.5, -2.0] },
  { code: '12', name: 'Sumatera Utara', bbox: [97.5, -3.5, 100.0, 4.5] },
  { code: '13', name: 'Sumatera Barat', bbox: [98.5, -3.5, 101.5, 1.5] },
  { code: '14', name: 'Riau', bbox: [100.0, 0.0, 109.5, 3.0] },
  { code: '15', name: 'Jambi', bbox: [101.5, -3.0, 104.5, 2.0] },
  { code: '16', name: 'Sumatera Selatan', bbox: [102.0, -5.5, 109.0, -1.5] },
  { code: '17', name: 'Bengkulu', bbox: [101.5, -5.5, 104.0, -2.0] },
  { code: '18', name: 'Lampung', bbox: [103.5, -6.0, 106.0, -3.5] },
  { code: '19', name: 'Kepulauan Bangka Belitung', bbox: [105.0, -4.0, 108.5, -1.5] },
  { code: '21', name: 'Kepulauan Riau', bbox: [103.5, -0.5, 109.0, 4.5] },
  { code: '31', name: 'DKI Jakarta', bbox: [106.6, -6.4, 107.0, -6.1] },
  { code: '32', name: 'Jawa Barat', bbox: [106.0, -7.8, 109.0, -5.8] },
  { code: '33', name: 'Jawa Tengah', bbox: [108.5, -8.2, 111.5, -6.0] },
  { code: '34', name: 'DI Yogyakarta', bbox: [110.0, -8.2, 110.7, -7.5] },
  { code: '35', name: 'Jawa Timur', bbox: [111.0, -9.0, 115.0, -6.9] },
  { code: '36', name: 'Banten', bbox: [105.5, -7.0, 106.8, -5.8] },
  { code: '51', name: 'Bali', bbox: [114.4, -8.8, 115.7, -8.0] },
  { code: '52', name: 'Nusa Tenggara Barat', bbox: [115.7, -9.2, 117.0, -8.0] },
  { code: '53', name: 'Nusa Tenggara Timur', bbox: [118.0, -11.0, 125.5, -8.0] },
  { code: '61', name: 'Kalimantan Barat', bbox: [108.0, -3.0, 118.0, 2.5] },
  { code: '62', name: 'Kalimantan Tengah', bbox: [111.0, -4.5, 116.5, 2.0] },
  { code: '63', name: 'Kalimantan Selatan', bbox: [114.0, -4.5, 117.0, -1.0] },
  { code: '64', name: 'Kalimantan Timur', bbox: [113.0, -3.0, 118.5, 4.5] },
  { code: '65', name: 'Kalimantan Utara', bbox: [114.5, 1.0, 118.5, 4.5] },
  { code: '71', name: 'Sulawesi Utara', bbox: [123.5, 0.5, 127.5, 3.8] },
  { code: '72', name: 'Sulawesi Tengah', bbox: [119.5, -3.5, 125.0, 1.5] },
  { code: '73', name: 'Sulawesi Selatan', bbox: [119.0, -7.5, 122.5, -1.5] },
  { code: '74', name: 'Sulawesi Tenggara', bbox: [121.0, -6.5, 124.5, -3.0] },
  { code: '75', name: 'Gorontalo', bbox: [121.5, 0.2, 123.5, 1.2] },
  { code: '76', name: 'Sulawesi Barat', bbox: [118.5, -4.0, 120.0, -0.5] },
  { code: '81', name: 'Maluku', bbox: [126.0, -9.0, 135.5, -1.5] },
  { code: '82', name: 'Maluku Utara', bbox: [124.5, -3.0, 129.5, 3.5] },
  { code: '91', name: 'Papua Barat', bbox: [130.5, -5.0, 136.5, 0.5] },
  { code: '94', name: 'Papua', bbox: [131.5, -9.5, 141.0, -1.0] }
];

const REGENCIES: RegencyData[] = [
  { code: '7301', name: 'Kab. Selayar', parentCode: '73', bbox: [120.3, -7.2, 121.0, -5.7] },
  { code: '7302', name: 'Kab. Bulukumba', parentCode: '73', bbox: [119.8, -5.8, 120.3, -5.2] },
  { code: '7303', name: 'Kab. Bantaeng', parentCode: '73', bbox: [119.8, -5.7, 120.2, -5.4] },
  { code: '7304', name: 'Kab. Jeneponto', parentCode: '73', bbox: [119.5, -5.8, 120.0, -5.4] },
  { code: '7305', name: 'Kab. Takalar', parentCode: '73', bbox: [119.3, -5.7, 119.7, -5.2] },
  { code: '7306', name: 'Kab. Gowa', parentCode: '73', bbox: [119.4, -6.0, 120.0, -5.0] },
  { code: '7307', name: 'Kab. Sinjai', parentCode: '73', bbox: [120.1, -5.5, 120.5, -4.8] },
  { code: '7308', name: 'Kab. Maros', parentCode: '73', bbox: [119.5, -5.5, 120.0, -4.7] },
  { code: '7309', name: 'Kab. Pangkajene dan Kepulauan', parentCode: '73', bbox: [119.4, -4.9, 120.5, -4.4] },
  { code: '7310', name: 'Kab. Barru', parentCode: '73', bbox: [119.5, -4.8, 119.9, -4.0] },
  { code: '7311', name: 'Kab. Bone', parentCode: '73', bbox: [120.0, -5.5, 120.8, -3.8] },
  { code: '7312', name: 'Kab. Soppeng', parentCode: '73', bbox: [119.8, -5.0, 120.2, -4.3] },
  { code: '7313', name: 'Kab. Wajo', parentCode: '73', bbox: [119.8, -4.5, 120.7, -3.5] },
  { code: '7314', name: 'Kab. Sidenreng Rappang', parentCode: '73', bbox: [119.7, -4.5, 120.1, -3.8] },
  { code: '7315', name: 'Kab. Pinrang', parentCode: '73', bbox: [119.3, -4.5, 119.7, -3.5] },
  { code: '7316', name: 'Kab. Enrekang', parentCode: '73', bbox: [119.5, -4.3, 120.2, -3.3] },
  { code: '7317', name: 'Kab. Luwu', parentCode: '73', bbox: [120.3, -3.5, 120.8, -2.5] },
  { code: '7318', name: 'Kab. Tana Toraja', parentCode: '73', bbox: [119.5, -3.5, 120.3, -2.5] },
  { code: '7322', name: 'Kab. Luwu Utara', parentCode: '73', bbox: [120.0, -3.0, 121.2, -2.0] },
  { code: '7325', name: 'Kab. Luwu Timur', parentCode: '73', bbox: [120.7, -3.0, 122.5, -2.0] },
  { code: '7326', name: 'Kab. Toraja Utara', parentCode: '73', bbox: [119.5, -3.5, 120.3, -2.7] },
  { code: '7371', name: 'Kota Makassar', parentCode: '73', bbox: [119.35, -5.25, 119.50, -5.08] },
  { code: '7372', name: 'Kota Parepare', parentCode: '73', bbox: [119.60, -4.08, 119.72, -3.96] },
  { code: '7373', name: 'Kota Palopo', parentCode: '73', bbox: [120.15, -3.05, 120.25, -2.95] },
  { code: '1171', name: 'Kota Banda Aceh', parentCode: '11', bbox: [95.28, -5.64, 95.42, -5.52] },
  { code: '1275', name: 'Kota Medan', parentCode: '12', bbox: [98.60, 3.47, 98.73, 3.66] },
  { code: '1375', name: 'Kota Padang', parentCode: '13', bbox: [100.31, -1.06, 100.49, -0.87] },
  { code: '1471', name: 'Kota Pekanbaru', parentCode: '14', bbox: [101.38, 0.53, 101.46, 0.61] },
  { code: '1571', name: 'Kota Jambi', parentCode: '15', bbox: [103.58, -1.63, 103.70, -1.55] },
  { code: '1671', name: 'Kota Palembang', parentCode: '16', bbox: [104.68, -3.04, 104.82, -2.89] },
  { code: '1771', name: 'Kota Bengkulu', parentCode: '17', bbox: [102.26, -3.84, 102.37, -3.76] },
  { code: '1871', name: 'Kota Bandar Lampung', parentCode: '18', bbox: [105.23, -5.45, 105.32, -5.38] },
  { code: '1971', name: 'Kota Pangkalpinang', parentCode: '19', bbox: [106.08, -2.17, 106.15, -2.08] },
  { code: '2171', name: 'Kota Batam', parentCode: '21', bbox: [103.98, 1.08, 104.12, 1.18] },
  { code: '3171', name: 'Kota Jakarta Pusat', parentCode: '31', bbox: [106.81, -6.19, 106.88, -6.13] },
  { code: '3271', name: 'Kota Bandung', parentCode: '32', bbox: [107.54, -6.96, 107.67, -6.84] },
  { code: '3374', name: 'Kota Semarang', parentCode: '33', bbox: [110.32, -7.06, 110.47, -6.97] },
  { code: '3471', name: 'Kota Yogyakarta', parentCode: '34', bbox: [110.33, -7.84, 110.41, -7.77] },
  { code: '3578', name: 'Kota Surabaya', parentCode: '35', bbox: [112.63, -7.35, 112.81, -7.20] },
  { code: '3671', name: 'Kota Serang', parentCode: '36', bbox: [106.14, -6.14, 106.19, -6.10] },
  { code: '5171', name: 'Kota Denpasar', parentCode: '51', bbox: [115.19, -8.73, 115.27, -8.62] },
  { code: '5271', name: 'Kota Mataram', parentCode: '52', bbox: [116.07, -8.64, 116.14, -8.55] },
  { code: '5371', name: 'Kota Kupang', parentCode: '53', bbox: [123.57, -10.19, 123.65, -10.12] },
  { code: '6171', name: 'Kota Pontianak', parentCode: '61', bbox: [109.29, -0.07, 109.39, 0.03] },
  { code: '6271', name: 'Kota Palangka Raya', parentCode: '62', bbox: [113.87, -2.23, 113.94, -2.18] },
  { code: '6371', name: 'Kota Banjarmasin', parentCode: '63', bbox: [114.56, -3.33, 114.62, -3.29] },
  { code: '6471', name: 'Kota Samarinda', parentCode: '64', bbox: [117.08, -0.54, 117.18, -0.44] },
  { code: '6571', name: 'Kota Tarakan', parentCode: '65', bbox: [117.56, 3.28, 117.63, 3.35] },
  { code: '7171', name: 'Kota Manado', parentCode: '71', bbox: [124.82, 1.45, 124.88, 1.52] },
  { code: '7271', name: 'Kota Palu', parentCode: '72', bbox: [119.85, -0.92, 119.91, -0.87] },
  { code: '7471', name: 'Kota Kendari', parentCode: '74', bbox: [122.50, -3.99, 122.58, -3.93] },
  { code: '7571', name: 'Kota Gorontalo', parentCode: '75', bbox: [122.41, 0.52, 122.48, 0.59] },
  { code: '7671', name: 'Kota Mamuju', parentCode: '76', bbox: [118.87, -2.69, 118.93, -2.63] },
  { code: '8171', name: 'Kota Ambon', parentCode: '81', bbox: [128.16, -3.73, 128.22, -3.67] },
  { code: '8271', name: 'Kota Ternate', parentCode: '82', bbox: [127.37, 0.76, 127.42, 0.80] },
  { code: '9171', name: 'Kota Sorong', parentCode: '91', bbox: [131.22, -0.91, 131.29, -0.85] },
  { code: '9471', name: 'Kota Jayapura', parentCode: '94', bbox: [140.67, -2.60, 140.73, -2.53] }
];

async function seed() {
  const client = await pool.connect();
  try {
    console.log('Seeding provinces...');
    for (const prov of PROVINCES) {
      const geomWkt = makeBboxMultiPolygon(...prov.bbox);
      await client.query(
        `INSERT INTO regions(id, code_bps, name, level, parent_id, geom)
         VALUES(gen_random_uuid(), $1, $2, 1, NULL, ST_GeomFromText($3, 4326))
         ON CONFLICT (code_bps) DO UPDATE SET name=EXCLUDED.name, geom=EXCLUDED.geom, updated_at=NOW()`,
        [prov.code, prov.name, geomWkt]
      );
      process.stdout.write('.');
    }
    console.log(`\\nInserted ${PROVINCES.length} provinces`);

    console.log('Seeding regencies...');
    for (const reg of REGENCIES) {
      const parentRes = await client.query(
        'SELECT id FROM regions WHERE code_bps = $1',
        [reg.parentCode]
      );
      if (parentRes.rows.length === 0) {
        console.warn(`Parent province ${reg.parentCode} not found for ${reg.code} ${reg.name}`);
        continue;
      }
      const parentId = parentRes.rows[0].id;
      const geomWkt = makeBboxMultiPolygon(...reg.bbox);
      await client.query(
        `INSERT INTO regions(id, code_bps, name, level, parent_id, geom)
         VALUES(gen_random_uuid(), $1, $2, 2, $3, ST_GeomFromText($4, 4326))
         ON CONFLICT (code_bps) DO UPDATE SET name=EXCLUDED.name, geom=EXCLUDED.geom, parent_id=EXCLUDED.parent_id, updated_at=NOW()`,
        [reg.code, reg.name, parentId, geomWkt]
      );
      process.stdout.write('.');
    }
    console.log(`\\nInserted ${REGENCIES.length} regencies`);

    // Try to refresh materialized view
    try {
      await client.query('SELECT refresh_mv_payments_with_cut()');
      console.log('Materialized view refreshed');
    } catch {
      console.log('Materialized view refresh skipped (no payment data yet)');
    }

    const { rows } = await client.query('SELECT level, COUNT(*) FROM regions GROUP BY level ORDER BY level');
    console.log('\\nRegion counts by level:');
    rows.forEach((r: any) => console.log(`  Level ${r.level}: ${r.count}`));
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
