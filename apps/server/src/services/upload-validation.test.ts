import { describe, expect, it } from 'vitest';

import {
  normalizeAlias,
  parseCurrency,
  parseSheetRows,
  validateUploadRow,
  type ParsedUploadRow,
} from './upload-validation';

describe('upload validation', () => {
  it('normalizes Indonesian aliases and common currency formats', () => {
    expect(normalizeAlias('KAL-Barat')).toBe('kalbarat');
    expect(parseCurrency('Rp 1.234.567')).toBe(1_234_567);
    expect(parseCurrency('1.234,50')).toBe(1_234.5);
    expect(parseCurrency('1,234.50')).toBe(1_234.5);
  });

  it('strips presentation rows and maps the official workbook headers', () => {
    const parsed = parseSheetRows([
      ['kode_bps', 'provinsi', 'nama_wilayah', 'periode', 'gross_setoran', 'sumber'],
      ['Prop. Jawa Tengah', '', '', '', '', ''],
      ['3301', 'Jawa Tengah', 'Kabupaten Cilacap', '2026-01', '100', 'PAD'],
      ['Jumlah', '', '', '', '', ''],
    ]);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]).toMatchObject({ codeBpsRaw: '3301', periodRaw: '2026-01', grossRaw: '100' });
  });

  it('keeps a missing gross value as a warning instead of a blocking error', async () => {
    const row: ParsedUploadRow = {
      rowNumber: 2,
      rawValues: {},
      provinceRaw: '',
      regionRaw: '',
      codeBpsRaw: '3301',
      sourceRaw: 'PAD',
      periodRaw: '2026-01',
      grossRaw: '',
      shareRaw: '',
      netRaw: '',
      targetRaw: '',
    };
    const db = {
      query: async (sql: string) => {
        if (sql.includes('FROM regions') && sql.includes('code_bps')) {
          return { rows: [{ id: 'r1', code_bps: '3301', name: 'Kabupaten Cilacap', level: 2, parent_id: 'p1' }] };
        }
        if (sql.includes('fiscal_period_locks')) return { rows: [{ locked: false }] };
        if (sql.includes('FROM payments')) return { rows: [{ exists: false }] };
        return { rows: [] };
      },
    };
    const result = await validateUploadRow(db, row);
    expect(result.grossAmount).toBeNull();
    expect(result.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'missing_amount', severity: 'warning' }),
    ]));
    expect(result.findings.some((finding) => finding.severity === 'error')).toBe(false);
  });

  it('flags share and net calculation mismatches as warnings', async () => {
    const row: ParsedUploadRow = {
      rowNumber: 2,
      rawValues: {},
      provinceRaw: '',
      regionRaw: '',
      codeBpsRaw: '3301',
      sourceRaw: 'PAD',
      periodRaw: '2026-01',
      grossRaw: '100000',
      shareRaw: '1000',
      netRaw: '98000',
      targetRaw: '',
    };
    const db = {
      query: async (sql: string) => {
        if (sql.includes('FROM regions') && sql.includes('code_bps')) {
          return { rows: [{ id: 'r1', code_bps: '3301', name: 'Kabupaten Cilacap', level: 2, parent_id: 'p1' }] };
        }
        if (sql.includes('fiscal_period_locks')) return { rows: [{ locked: false }] };
        if (sql.includes('FROM payments')) return { rows: [{ exists: false }] };
        return { rows: [] };
      },
    };
    const result = await validateUploadRow(db, row);
    expect(result.findings.map((finding) => finding.code)).toEqual(expect.arrayContaining([
      'share_calculation_mismatch',
      'net_calculation_mismatch',
    ]));
  });
});
