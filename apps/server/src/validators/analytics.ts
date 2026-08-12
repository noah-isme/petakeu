import { z } from 'zod';

import type { AmountBasis, RankingCriterion } from '../types/analytics';

export const MAX_ANALYTICS_MONTHS = 24;
export const MAX_PROVINCE_FILTER_IDS = 100;
export const MAX_RANKING_LIMIT = 100;

const PERIOD_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export const analyticsPeriodSchema = z
  .string()
  .regex(PERIOD_PATTERN, 'Period must use YYYY-MM format with a valid month');

const uuidSchema = z.string().uuid('Value must be a valid UUID');

export const amountBasisSchema = z.enum(['gross', 'share', 'net']);
export const rankingCriterionSchema = z.enum([
  'total',
  'average_monthly',
  'monthly_average',
  'target_achievement',
  'growth',
  'surplus',
  'deficit',
]);

const nonNegativeNumericSchema = z
  .union([z.number(), z.string().trim().min(1)])
  .transform((value) => (typeof value === 'number' ? value : Number(value)))
  .refine((value) => Number.isFinite(value), 'Target must be a finite number')
  .refine((value) => value >= 0, 'Target must be non-negative');

export const analyticsOverviewQuerySchema = z.object({
  period: analyticsPeriodSchema.optional(),
  from: analyticsPeriodSchema.optional(),
  to: analyticsPeriodSchema.optional(),
  provinceIds: z.array(uuidSchema).max(MAX_PROVINCE_FILTER_IDS).optional(),
  amountBasis: amountBasisSchema.optional(),
  rankingCriterion: rankingCriterionSchema.optional(),
  // `ranking` and `metric` are accepted as aliases for clients that use the
  // shorter query names. They are normalized before reaching the service.
  ranking: rankingCriterionSchema.optional(),
  criterion: rankingCriterionSchema.optional(),
  metric: amountBasisSchema.optional(),
});

export const analyticsRankingQuerySchema = z.object({
  period: analyticsPeriodSchema.optional(),
  from: analyticsPeriodSchema.optional(),
  to: analyticsPeriodSchema.optional(),
  provinceIds: z.array(uuidSchema).max(MAX_PROVINCE_FILTER_IDS).optional(),
  amountBasis: amountBasisSchema.optional(),
  rankingCriterion: rankingCriterionSchema.optional(),
  ranking: rankingCriterionSchema.optional(),
  criterion: rankingCriterionSchema.optional(),
  metric: amountBasisSchema.optional(),
  limit: z.coerce.number().int().min(1).max(MAX_RANKING_LIMIT).optional(),
});

export const targetRegistrationSchema = z
  .object({
    regionId: uuidSchema,
    period: analyticsPeriodSchema,
    target: nonNegativeNumericSchema,
  })
  .strict();

export const targetListQuerySchema = z.object({
  regionId: uuidSchema.optional(),
  period: analyticsPeriodSchema.optional(),
  from: analyticsPeriodSchema.optional(),
  to: analyticsPeriodSchema.optional(),
  provinceIds: z.array(uuidSchema).max(MAX_PROVINCE_FILTER_IDS).optional(),
});

export type AnalyticsOverviewQueryInput = z.infer<typeof analyticsOverviewQuerySchema>;
export type AnalyticsRankingQueryInput = z.infer<typeof analyticsRankingQuerySchema>;
export type TargetRegistrationInput = z.infer<typeof targetRegistrationSchema>;
export type TargetListQueryInput = z.infer<typeof targetListQuerySchema>;

function getSingleQueryValue(value: unknown): unknown {
  if (value === undefined || value === null) return undefined;
  if (Array.isArray(value)) return value.length === 1 ? value[0] : value;
  return value;
}

function parseProvinceIds(value: unknown): unknown {
  const single = getSingleQueryValue(value);
  if (single === undefined) return undefined;
  if (typeof single !== 'string') return single;

  const values = single
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  return values.length > 0 ? values : undefined;
}

function normalizeQueryObject(input: Record<string, unknown>, includeRegionId: boolean): Record<string, unknown> {
  const normalized: Record<string, unknown> = {
    period: getSingleQueryValue(input.period),
    from: getSingleQueryValue(input.from),
    to: getSingleQueryValue(input.to),
    provinceIds: parseProvinceIds(input.provinceIds),
    amountBasis: getSingleQueryValue(input.amountBasis ?? input.metric),
    rankingCriterion: getSingleQueryValue(input.rankingCriterion ?? input.ranking ?? input.criterion),
    ranking: getSingleQueryValue(input.ranking),
    criterion: getSingleQueryValue(input.criterion),
    metric: getSingleQueryValue(input.metric),
    limit: getSingleQueryValue(input.limit),
  };

  if (includeRegionId) {
    normalized.regionId = getSingleQueryValue(input.regionId);
  }

  return normalized;
}

export function addMonths(period: string, offset: number): string {
  const [yearText, monthText] = period.split('-');
  const absoluteMonth = Number(yearText) * 12 + Number(monthText) - 1 + offset;
  const year = Math.floor(absoluteMonth / 12);
  const month = ((absoluteMonth % 12) + 12) % 12 + 1;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`;
}

export function comparePeriods(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function currentPeriod(now: Date = new Date()): string {
  return now.toISOString().slice(0, 7);
}

function rangeIssue(message: string): z.ZodError {
  return new z.ZodError([{ code: z.ZodIssueCode.custom, path: ['from'], message }]);
}

function normalizeRankingCriterion(value: string): RankingCriterion {
  return value === 'monthly_average' ? 'average_monthly' : value as RankingCriterion;
}

export function normalizeAnalyticsOverviewQuery(
  input: Record<string, unknown>,
  now: Date = new Date(),
): AnalyticsOverviewQueryInput & {
  period: string;
  from: string;
  to: string;
  provinceIds: string[];
  amountBasis: AmountBasis;
  rankingCriterion: RankingCriterion;
} {
  const parsed = analyticsOverviewQuerySchema.parse(normalizeQueryObject(input, false));
  const period = parsed.period ?? parsed.to ?? currentPeriod(now);
  const to = parsed.to ?? period;
  const from = parsed.from ?? addMonths(to, -11);

  if (comparePeriods(from, to) > 0) {
    throw rangeIssue('from must be less than or equal to to');
  }

  const monthCount = Number(addMonths(to, 1).slice(0, 4)) * 12 + Number(addMonths(to, 1).slice(5))
    - (Number(from.slice(0, 4)) * 12 + Number(from.slice(5)));
  if (monthCount > MAX_ANALYTICS_MONTHS) {
    throw rangeIssue(`Analytics range cannot exceed ${MAX_ANALYTICS_MONTHS} months`);
  }

  return {
    ...parsed,
    period,
    from,
    to,
    provinceIds: parsed.provinceIds ?? [],
    amountBasis: parsed.amountBasis ?? parsed.metric ?? 'gross',
    rankingCriterion: normalizeRankingCriterion(parsed.rankingCriterion ?? parsed.ranking ?? parsed.criterion ?? 'total'),
  };
}

export function normalizeAnalyticsRankingQuery(
  input: Record<string, unknown>,
  now: Date = new Date(),
): AnalyticsRankingQueryInput & {
  period: string;
  from: string;
  to: string;
  provinceIds: string[];
  amountBasis: AmountBasis;
  rankingCriterion: RankingCriterion;
  limit: number;
} {
  const normalized = normalizeQueryObject(input, false);
  const parsed = analyticsRankingQuerySchema.parse(normalized);
  const period = parsed.period ?? parsed.to ?? currentPeriod(now);
  const to = parsed.to ?? period;
  const from = parsed.from ?? to;

  if (comparePeriods(from, to) > 0) {
    throw rangeIssue('from must be less than or equal to to');
  }

  const monthCount = Number(addMonths(to, 1).slice(0, 4)) * 12 + Number(addMonths(to, 1).slice(5))
    - (Number(from.slice(0, 4)) * 12 + Number(from.slice(5)));
  if (monthCount > MAX_ANALYTICS_MONTHS) {
    throw rangeIssue(`Analytics range cannot exceed ${MAX_ANALYTICS_MONTHS} months`);
  }

  return {
    ...parsed,
    period,
    from,
    to,
    provinceIds: parsed.provinceIds ?? [],
    amountBasis: parsed.amountBasis ?? parsed.metric ?? 'gross',
    rankingCriterion: normalizeRankingCriterion(parsed.rankingCriterion ?? parsed.ranking ?? parsed.criterion ?? 'total'),
    limit: parsed.limit ?? MAX_RANKING_LIMIT,
  };
}

export function normalizeTargetListQuery(input: Record<string, unknown>): TargetListQueryInput & { provinceIds: string[] } {
  const parsed = targetListQuerySchema.parse(normalizeQueryObject(input, true));

  if (parsed.from && parsed.to && comparePeriods(parsed.from, parsed.to) > 0) {
    throw rangeIssue('from must be less than or equal to to');
  }

  return {
    ...parsed,
    provinceIds: parsed.provinceIds ?? [],
  };
}
