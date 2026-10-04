import { types } from 'pg';
import { describe, expect, it } from 'vitest';

import { dbPeriod } from './db-period';

describe('dbPeriod', () => {
  it('formats a node-pg DATE value (local midnight) as YYYY-MM', () => {
    expect(dbPeriod(new Date(2023, 6, 1))).toBe('2023-07');
    expect(dbPeriod(new Date(2026, 0, 1))).toBe('2026-01');
    expect(dbPeriod(new Date(2025, 11, 1))).toBe('2025-12');
  });

  it('keeps the month of a DATE parsed by node-pg in any server timezone', () => {
    const parseDate = types.getTypeParser(1082);
    const originalTz = process.env.TZ;
    try {
      for (const tz of ['UTC', 'Asia/Jakarta', 'Asia/Jayapura', 'America/Los_Angeles', 'Pacific/Kiritimati']) {
        process.env.TZ = tz;
        expect(dbPeriod(parseDate('2023-07-01')), tz).toBe('2023-07');
        expect(dbPeriod(parseDate('2024-01-01')), tz).toBe('2024-01');
        expect(dbPeriod(parseDate('2025-12-01')), tz).toBe('2025-12');
      }
    } finally {
      process.env.TZ = originalTz;
    }
  });

  it('truncates DATE and month strings to YYYY-MM', () => {
    expect(dbPeriod('2023-07-01')).toBe('2023-07');
    expect(dbPeriod('2023-07')).toBe('2023-07');
  });

  it('returns null for empty or invalid values', () => {
    expect(dbPeriod(null)).toBeNull();
    expect(dbPeriod(undefined)).toBeNull();
    expect(dbPeriod('')).toBeNull();
    expect(dbPeriod(new Date(Number.NaN))).toBeNull();
  });

  it('passes short unrecognised strings through for validation to reject', () => {
    expect(dbPeriod('2023')).toBe('2023');
  });
});
