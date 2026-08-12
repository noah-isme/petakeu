export const PERIOD_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;
export const CURRENCY_TOLERANCE_RATIO = 0.0001; // 0.01%

export interface Db {
  query(text: string, values?: unknown[]): Promise<{ rows: Array<Record<string, unknown>>; rowCount?: number | null }>;
}

export interface ParsedUploadRow {
  rowNumber: number;
  rawValues: Record<string, unknown>;
  provinceRaw: string;
  regionRaw: string;
  codeBpsRaw: string;
  sourceRaw: string;
  periodRaw: string;
  grossRaw: unknown;
  shareRaw: unknown;
  netRaw: unknown;
  targetRaw: unknown;
}

export interface UploadFinding {
  severity: 'error' | 'warning';
  code: string;
  column: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface ValidatedUploadRow {
  input: ParsedUploadRow;
  provinceRegionId: string | null;
  regionId: string | null;
  regionLevel: number | null;
  regionCode: string | null;
  regionName: string | null;
  period: string | null;
  grossAmount: number | null;
  shareAmount: number | null;
  netAmount: number | null;
  targetAmount: number | null;
  findings: UploadFinding[];
  duplicate: boolean;
}

export interface ParsedSheet {
  headers: string[];
  rows: ParsedUploadRow[];
}

function canonicalHeader(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function normalizeAlias(value: string): string {
  return canonicalHeader(value).replace(/_/g, '');
}

export function normalizeHeader(value: string): string {
  return canonicalHeader(value);
}

const HEADER_ALIASES: Record<string, string[]> = {
  codeBps: ['kode_bps', 'code_bps', 'bps_code', 'kode_daerah', 'kode_wilayah', 'kode'],
  province: ['provinsi', 'province', 'nama_provinsi', 'prov', 'province_name'],
  region: [
    'nama_wilayah',
    'nama_daerah',
    'nama_kabupaten',
    'nama_kota',
    'kabupaten',
    'kota',
    'kab_kota',
    'regency_city',
    'regency',
    'city',
    'region',
    'wilayah',
  ],
  period: ['periode', 'period', 'bulan', 'month', 'period_id'],
  gross: ['nominal', 'amount', 'gross', 'gross_amount', 'gross_setoran', 'setoran_bruto', 'revenue'],
  share: [
    'share',
    'share_amount',
    'provincial_share',
    'province_share',
    'provincial_share_15',
    'provincial_share_15_percent',
    'share_15',
    'bagi_hasil',
    'porsi_provinsi',
    'cut_amount',
  ],
  net: ['net', 'net_amount', 'net_revenue', 'revenue_net', 'net_revenue_idr', 'penerimaan_bersih'],
  target: ['target', 'target_amount', 'target_pendapatan', 'target_allocation', 'revenue_target'],
  source: ['sumber', 'source', 'jenis_penerimaan', 'payment_source'],
};

function findColumn(headers: string[], names: string[]): number {
  const canonical = new Set(names.map(canonicalHeader));
  return headers.findIndex((header) => canonical.has(header));
}

function cell(row: string[], index: number): string {
  return index >= 0 ? String(row[index] ?? '').trim() : '';
}

function isPresentationRow(row: string[], indexes: Record<string, number>): boolean {
  if (row.every((value) => !String(value ?? '').trim())) return true;
  const values = row.map((value) => String(value ?? '').trim()).filter(Boolean);
  if (values.length === 0) return true;
  const joined = values.join(' ');
  if (/^(total|jumlah|subtotal|prop\.?\s)/i.test(joined)) return true;
  const relevant = ['codeBps', 'province', 'region', 'period', 'gross', 'share', 'net', 'target', 'source'];
  return relevant.every((key) => indexes[key] < 0 || !cell(row, indexes[key]));
}

export function parseSheetRows(rawRows: string[][]): ParsedSheet {
  if (rawRows.length === 0) {
    return { headers: [], rows: [] };
  }

  const headers = rawRows[0].map(normalizeHeader);
  const indexes: Record<string, number> = {};
  for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
    indexes[key] = findColumn(headers, aliases);
  }

  const required = ['period', 'gross'];
  const missing = required.filter((key) => indexes[key] < 0);
  if (missing.length > 0) {
    throw new Error(`Header tidak valid. Kolom wajib: ${missing.join(', ')}`);
  }

  const rows: ParsedUploadRow[] = [];
  for (let i = 1; i < rawRows.length; i += 1) {
    const row = rawRows[i];
    if (isPresentationRow(row, indexes)) continue;
    rows.push({
      rowNumber: i + 1,
      rawValues: Object.fromEntries(headers.map((header, index) => [header || `column_${index + 1}`, row[index] ?? ''])),
      provinceRaw: cell(row, indexes.province),
      regionRaw: cell(row, indexes.region),
      codeBpsRaw: cell(row, indexes.codeBps),
      sourceRaw: cell(row, indexes.source),
      periodRaw: cell(row, indexes.period),
      grossRaw: indexes.gross >= 0 ? row[indexes.gross] : '',
      shareRaw: indexes.share >= 0 ? row[indexes.share] : '',
      netRaw: indexes.net >= 0 ? row[indexes.net] : '',
      targetRaw: indexes.target >= 0 ? row[indexes.target] : '',
    });
  }

  return { headers, rows };
}

export function isFuturePeriod(period: string, referenceDate: Date = new Date()): boolean {
  if (!PERIOD_REGEX.test(period)) return false;
  const [year, month] = period.split('-').map(Number);
  const refYear = referenceDate.getFullYear();
  const refMonth = referenceDate.getMonth() + 1;
  return year > refYear || (year === refYear && month > refMonth);
}

export function normalizePeriod(value: unknown): string | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const monthMatch = raw.match(/^(\d{4})[-/]?(\d{2})$/);
  if (monthMatch) return `${monthMatch[1]}-${monthMatch[2]}`;
  const dateMatch = raw.match(/^(\d{4})[-/](\d{2})[-/]\d{2}/);
  if (dateMatch) return `${dateMatch[1]}-${dateMatch[2]}`;
  return raw;
}

export function parseCurrency(value: unknown): number | null {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
  let raw = String(value).trim().replace(/^rp\.?\s*/i, '').replace(/\s/g, '');
  if (!raw) return null;
  if (/^\(.*\)$/.test(raw)) raw = `-${raw.slice(1, -1)}`;
  if (!/^[+-]?[0-9.,]+$/.test(raw)) return null;

  const hasDot = raw.includes('.');
  const hasComma = raw.includes(',');
  if (hasDot && hasComma) {
    if (raw.lastIndexOf(',') > raw.lastIndexOf('.')) raw = raw.replace(/\./g, '').replace(',', '.');
    else raw = raw.replace(/,/g, '');
  } else if (hasComma) {
    const parts = raw.split(',');
    raw = parts[parts.length - 1].length === 3 ? raw.replace(/,/g, '') : raw.replace(',', '.');
  } else if (hasDot) {
    const parts = raw.split('.');
    if (parts.length > 1 && parts[parts.length - 1].length === 3) raw = raw.replace(/\./g, '');
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : null;
}

function addFinding(
  findings: UploadFinding[],
  severity: UploadFinding['severity'],
  code: string,
  column: string,
  message: string,
  details?: Record<string, unknown>,
): void {
  findings.push({ severity, code, column, message, details });
}

interface RegionRow {
  id: string;
  code_bps: string;
  name: string;
  level: number;
  parent_id: string | null;
}

async function resolveRegionByCode(db: Db, code: string): Promise<RegionRow | null> {
  const result = await db.query(
    `SELECT id::text, code_bps, name, level, parent_id::text
       FROM regions
      WHERE code_bps = $1
      LIMIT 1`,
    [code],
  );
  return (result.rows[0] as unknown as RegionRow | undefined) ?? null;
}

async function resolveRegionByName(
  db: Db,
  value: string,
  level?: number,
  parentId?: string | null,
): Promise<RegionRow[]> {
  const normalized = normalizeAlias(value);
  if (!normalized) return [];
  const values: unknown[] = [normalized];
  const conditions = [
    `(regexp_replace(lower(name), '[^[:alnum:]]', '', 'g') = $1
      OR EXISTS (
        SELECT 1 FROM region_aliases a
         WHERE a.region_id = regions.id
           AND a.active
           AND a.normalized_alias = $1
      ))`,
  ];
  if (level !== undefined) {
    values.push(level);
    conditions.push(`level = $${values.length}`);
  }
  if (parentId) {
    values.push(parentId);
    conditions.push(`parent_id = $${values.length}`);
  }
  const result = await db.query(
    `SELECT id::text, code_bps, name, level, parent_id::text
       FROM regions
      WHERE ${conditions.join(' AND ')}
      ORDER BY id
      LIMIT 10`,
    values,
  );
  return result.rows as unknown as RegionRow[];
}

async function regionExistsInScope(db: Db, regionId: string, provinceId: string | null): Promise<boolean> {
  if (!provinceId) return true;
  const result = await db.query(
    `WITH RECURSIVE ancestors AS (
       SELECT id, parent_id FROM regions WHERE id = $1
       UNION ALL
       SELECT r.id, r.parent_id FROM regions r JOIN ancestors a ON a.parent_id = r.id
     )
     SELECT EXISTS(SELECT 1 FROM ancestors WHERE id = $2) AS exists`,
    [regionId, provinceId],
  );
  return Boolean(result.rows[0]?.exists);
}

async function isLocked(db: Db, period: string): Promise<boolean> {
  const result = await db.query(
    `SELECT EXISTS(
       SELECT 1 FROM fiscal_period_locks WHERE period = ($1 || '-01')::date
     ) AS locked`,
    [period],
  );
  return Boolean(result.rows[0]?.locked);
}

function parseField(
  value: unknown,
  column: string,
  findings: UploadFinding[],
): number | null {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const parsed = parseCurrency(value);
  if (parsed === null) {
    addFinding(findings, 'error', 'invalid_number', column, `${column} harus berupa angka`);
    return null;
  }
  if (parsed < 0) {
    addFinding(findings, 'error', 'negative_amount', column, `${column} tidak boleh negatif`);
  }
  return parsed;
}

export async function validateUploadRow(db: Db, input: ParsedUploadRow): Promise<ValidatedUploadRow> {
  const findings: UploadFinding[] = [];
  const normalizedPeriod = normalizePeriod(input.periodRaw);
  const period = normalizedPeriod && PERIOD_REGEX.test(normalizedPeriod) ? normalizedPeriod : null;
  if (!period) {
    addFinding(findings, 'error', 'invalid_period', 'period', 'Format periode harus YYYY-MM');
  }

  const grossAmount = parseField(input.grossRaw, 'gross_amount', findings);
  let shareAmount = parseField(input.shareRaw, 'share_amount', findings);
  let netAmount = parseField(input.netRaw, 'net_amount', findings);
  const targetAmount = parseField(input.targetRaw, 'target_amount', findings);

  if (grossAmount !== null && shareAmount === null) shareAmount = Math.round(grossAmount * 0.15 * 100) / 100;
  if (grossAmount !== null && netAmount === null && shareAmount !== null) {
    netAmount = Math.round((grossAmount - shareAmount) * 100) / 100;
  }

  if (grossAmount !== null && shareAmount !== null) {
    const expected = Math.round(grossAmount * 0.15 * 100) / 100;
    const tolerance = Math.max(1, Math.abs(grossAmount) * CURRENCY_TOLERANCE_RATIO);
    if (Math.abs(shareAmount - expected) > tolerance) {
      addFinding(findings, 'warning', 'share_calculation_mismatch', 'share_amount', 'Provincial share berbeda dari 15% gross', {
        expected,
        provided: shareAmount,
        tolerance,
      });
    }
  }
  if (grossAmount !== null && shareAmount !== null && netAmount !== null) {
    const expected = Math.round((grossAmount - shareAmount) * 100) / 100;
    const tolerance = Math.max(1, Math.abs(grossAmount) * CURRENCY_TOLERANCE_RATIO);
    if (Math.abs(netAmount - expected) > tolerance) {
      addFinding(findings, 'warning', 'net_calculation_mismatch', 'net_amount', 'Net revenue berbeda dari gross dikurangi share', {
        expected,
        provided: netAmount,
        tolerance,
      });
    }
  }
  if (grossAmount === null) {
    addFinding(findings, 'warning', 'missing_amount', 'gross_amount', 'Nominal kosong; baris dicatat sebagai laporan belum masuk');
  }
  if (period && isFuturePeriod(period)) {
    addFinding(findings, 'warning', 'future_period', 'period', 'Periode berada di masa depan');
  }
  if (!input.sourceRaw) {
    addFinding(findings, 'error', 'missing_source', 'source', 'Sumber wajib diisi');
  }

  let provinceRegion: RegionRow | null = null;
  if (input.provinceRaw) {
    const provinces = await resolveRegionByName(db, input.provinceRaw, 1);
    if (provinces.length === 0) {
      addFinding(findings, 'error', 'unknown_province', 'province', `Provinsi '${input.provinceRaw}' tidak ditemukan`);
    } else if (provinces.length > 1) {
      addFinding(findings, 'error', 'ambiguous_province', 'province', `Provinsi '${input.provinceRaw}' tidak unik`);
    } else {
      provinceRegion = provinces[0];
    }
  }

  let region: RegionRow | null = null;
  if (input.codeBpsRaw) {
    region = await resolveRegionByCode(db, input.codeBpsRaw);
    if (!region) {
      addFinding(findings, 'error', 'unknown_region', 'code_bps', `Wilayah dengan kode BPS '${input.codeBpsRaw}' tidak ditemukan`);
    }
  }

  if (!region && input.regionRaw) {
    const candidates = await resolveRegionByName(db, input.regionRaw, undefined, provinceRegion?.id);
    if (candidates.length === 0) {
      addFinding(findings, 'error', 'unknown_region', 'region', `Wilayah '${input.regionRaw}' tidak ditemukan`);
    } else if (candidates.length > 1) {
      addFinding(findings, 'error', 'ambiguous_region', 'region', `Wilayah '${input.regionRaw}' tidak unik`);
    } else {
      region = candidates[0];
    }
  }

  if (!region && !input.regionRaw && provinceRegion) region = provinceRegion;
  if (region && provinceRegion && !(await regionExistsInScope(db, region.id, provinceRegion.id))) {
    addFinding(findings, 'error', 'province_region_mismatch', 'province', 'Wilayah tidak berada di provinsi yang dipilih');
  }
  if (region && provinceRegion && region.id === provinceRegion.id && region.level !== 1) {
    addFinding(findings, 'error', 'province_region_mismatch', 'province', 'Wilayah dan provinsi tidak konsisten');
  }

  if (period && await isLocked(db, period)) {
    addFinding(findings, 'error', 'locked_period', 'period', `Fiscal period ${period} is locked`);
  }

  let duplicate = false;
  if (region && period) {
    const result = await db.query(
      `SELECT EXISTS(
         SELECT 1 FROM payments WHERE region_id = $1 AND period = ($2 || '-01')::date AND source = $3
       ) AS exists`,
      [region.id, period, input.sourceRaw],
    );
    duplicate = Boolean(result.rows[0]?.exists);
    if (duplicate) {
      addFinding(findings, 'warning', 'duplicate_overwrite', 'region', 'Data untuk wilayah, periode, dan sumber sudah ada dan akan di-upsert');
    }
  }

  const provinceRegionId = provinceRegion?.id ?? (region?.level === 1 ? region.id : region?.parent_id ?? null);
  return {
    input,
    provinceRegionId,
    regionId: region?.id ?? null,
    regionLevel: region?.level ?? null,
    regionCode: region?.code_bps ?? null,
    regionName: region?.name ?? null,
    period,
    grossAmount,
    shareAmount,
    netAmount,
    targetAmount,
    findings,
    duplicate,
  };
}
