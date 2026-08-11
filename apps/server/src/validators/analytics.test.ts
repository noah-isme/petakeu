import { describe, expect, it } from 'vitest';

import {
  addMonths,
  normalizeAnalyticsOverviewQuery,
  normalizeTargetListQuery,
  targetRegistrationSchema,
} from './analytics';

describe('analytics validation', () => {
  it('normalizes periods, defaults the rolling range, and parses province IDs', () => {
    const result = normalizeAnalyticsOverviewQuery(
      {
        period: '2025-08',
        provinceIds: '11111111-1111-4111-8111-111111111111,22222222-2222-4222-8222-222222222222',
      },
      new Date('2025-08-20T00:00:00Z'),
    );

    expect(result).toMatchObject({
      period: '2025-08',
      from: '2024-09',
      to: '2025-08',
      provinceIds: ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'],
    });
  });

  it('handles year boundaries when shifting periods', () => {
    expect(addMonths('2025-01', -1)).toBe('2024-12');
    expect(addMonths('2024-12', 1)).toBe('2025-01');
  });

  it('rejects inverted or overlong ranges and accepts numeric target strings', () => {
    expect(() => normalizeTargetListQuery({ from: '2025-08', to: '2025-07' })).toThrow();
    expect(() => normalizeAnalyticsOverviewQuery({ from: '2020-01', to: '2025-01' })).toThrow();
    expect(targetRegistrationSchema.parse({
      regionId: '11111111-1111-4111-8111-111111111111',
      period: '2025-08',
      target: '1250000.50',
    }).target).toBe(1250000.5);
  });
});
