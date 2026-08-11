import { useQuery } from "@tanstack/react-query";

import { buildUrl } from "../config/api";
import {
  createEmptyAnalyticsOverview,
  type AnalyticsKpis,
  type AnalyticsNumber,
  type AnalyticsOverview,
  type AnalyticsOverviewMeta,
  type AnalyticsProvinceMetric,
  type AnalyticsRegionMetric,
  type AnalyticsReportingCell,
  type AnalyticsReportingMatrix,
  type AnalyticsReportingRow,
  type AnalyticsTargetActualPoint,
  type AnalyticsTrendPoint,
  type AnalyticsYoyPoint,
  type ReportingStatus
} from "../types/analytics";
import { normalizeAnalyticsPeriod } from "../components/analytics/analytics-utils";

export interface AnalyticsQueryParams {
  period?: string;
  from?: string;
  to?: string;
  provinceId?: string;
}

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asNumber(value: unknown): AnalyticsNumber {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function asString(value: unknown): string | null {
  if (typeof value === "string" && value.trim() !== "") {
    return value;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return null;
}

function asBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (value === "1" || value === 1 || value === "true") return true;
  if (value === "0" || value === 0 || value === "false") return false;
  return null;
}

function firstValue(source: JsonRecord | null, keys: string[]): unknown {
  if (!source) return undefined;

  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null) {
      return source[key];
    }
  }

  return undefined;
}

function firstString(source: JsonRecord | null, keys: string[]): string | null {
  return asString(firstValue(source, keys));
}

function firstNumber(source: JsonRecord | null, keys: string[]): AnalyticsNumber {
  return asNumber(firstValue(source, keys));
}

function firstRecord(source: JsonRecord | null, keys: string[]): JsonRecord | null {
  const value = firstValue(source, keys);
  return isRecord(value) ? value : null;
}

function firstArray(source: JsonRecord | null, keys: string[]): unknown[] {
  return asArray(firstValue(source, keys));
}

function percentageFrom(actual: AnalyticsNumber, target: AnalyticsNumber): AnalyticsNumber {
  if (actual === null || target === null || target === 0) return null;
  return Number(((actual / target) * 100).toFixed(2));
}

function varianceFrom(actual: AnalyticsNumber, target: AnalyticsNumber): AnalyticsNumber {
  if (actual === null || target === null || target === 0) return null;
  return Number((((actual - target) / target) * 100).toFixed(2));
}

function normalizeOutlier(value: unknown, source: JsonRecord | null): AnalyticsKpis["topOutlierRegion"] {
  if (typeof value === "string") {
    return {
      regionId: null,
      regionName: value,
      variancePercentage: firstNumber(source, ["topOutlierVariance", "outlierVariancePercentage"])
    };
  }

  if (!isRecord(value)) return null;

  return {
    regionId: firstString(value, ["regionId", "region_id", "id"]),
    regionName: firstString(value, ["regionName", "region_name", "name"]) ?? "Wilayah tidak diketahui",
    variancePercentage: firstNumber(value, ["variancePercentage", "variance", "deviationPercentage", "deviation", "growthPercentage", "growth_percentage"])
  };
}

function normalizeKpis(source: JsonRecord): AnalyticsKpis {
  const kpis = firstRecord(source, ["kpis", "metrics", "scorecards"]) ?? source;
  const nationalTotal = firstNumber(kpis, [
    "nationalTotal",
    "national_total",
    "totalRevenue",
    "totalSetoran",
    "totalActual",
    "actualTotal",
    "total"
  ]);
  const totalTarget = firstNumber(kpis, ["totalTarget", "total_target", "targetTotal", "target"]);
  const achievementPercentage =
    firstNumber(kpis, ["achievementPercentage", "achievement_percentage", "achievement", "realizationPercentage"]) ??
    percentageFrom(nationalTotal, totalTarget);
  const topOutlier =
    firstValue(kpis, ["topOutlierRegion", "top_outlier_region", "outlierRegion"]) ??
    firstArray(kpis, ["outlierRegions", "outlier_regions"])[0];

  return {
    nationalTotal,
    totalTarget,
    achievementPercentage,
    momGrowthPercentage: firstNumber(kpis, [
      "momGrowthPercentage",
      "mom_growth_percentage",
      "momGrowth",
      "monthOverMonthGrowth",
      "monthlyGrowth"
    ]),
    activeReportingCoverage: firstNumber(kpis, [
      "activeReportingCoverage",
      "active_reporting_coverage",
      "reportingCoverage",
      "coveragePercentage",
      "coverage"
    ]),
    reportingExpected: firstNumber(kpis, ["reportingExpected", "reporting_expected", "expectedReports"]),
    reportingSubmitted: firstNumber(kpis, ["reportingSubmitted", "reporting_submitted", "submittedReports"]),
    missingReports: firstNumber(kpis, ["missingReports", "missing_reports", "missing"]),
    topOutlierRegion: normalizeOutlier(topOutlier, kpis)
  };
}

function normalizeTrendPoint(value: unknown): AnalyticsTrendPoint {
  const source = isRecord(value) ? value : null;
  return {
    period: firstString(source, ["period", "month", "label", "date"]) ?? "",
    actual: firstNumber(source, ["actual", "actualAmount", "realization", "realizationAmount", "amount", "total"]),
    target: firstNumber(source, ["target", "targetAmount", "budgetTarget", "baseline"])
  };
}

function normalizeRegionMetric(value: unknown, index: number): AnalyticsRegionMetric {
  const source = isRecord(value) ? value : null;
  const actual = firstNumber(source, [
    "actual",
    "actualAmount",
    "realization",
    "realizationAmount",
    "grossAmount",
    "amount",
    "total"
  ]);
  const target = firstNumber(source, ["target", "targetAmount", "budgetTarget"]);

  return {
    regionId: firstString(source, ["regionId", "region_id", "id"]),
    regionName: firstString(source, ["regionName", "region_name", "name"]) ?? "Wilayah tidak diketahui",
    provinceName: firstString(source, ["provinceName", "province_name", "province"]),
    actual,
    target,
    achievementPercentage:
      firstNumber(source, ["achievementPercentage", "achievement_percentage", "achievement", "percentage"]) ??
      percentageFrom(actual, target),
    variancePercentage:
      firstNumber(source, ["variancePercentage", "variance_percentage", "variance", "deviationPercentage", "deviation"]) ??
      varianceFrom(actual, target),
    yoyPercentage: firstNumber(source, ["yoyPercentage", "yoy_percentage", "yoy", "growthPercentage"]),
    rank: firstNumber(source, ["rank", "position"]) ?? index + 1
  };
}

function normalizeProvinceMetric(value: unknown): AnalyticsProvinceMetric {
  const source = isRecord(value) ? value : null;
  const actual = firstNumber(source, ["actual", "actualAmount", "realization", "amount", "total"]);
  const target = firstNumber(source, ["target", "targetAmount", "budgetTarget"]);
  const reportingExpected = firstNumber(source, ["reportingExpected", "reporting_expected", "expectedReports"]);
  const reportingSubmitted = firstNumber(source, ["reportingSubmitted", "reporting_submitted", "submittedReports"]);

  return {
    provinceId: firstString(source, ["provinceId", "province_id", "id"]),
    provinceName: firstString(source, ["provinceName", "province_name", "name"]) ?? "Provinsi tidak diketahui",
    actual,
    target,
    achievementPercentage:
      firstNumber(source, ["achievementPercentage", "achievement_percentage", "achievement", "percentage"]) ??
      percentageFrom(actual, target),
    variancePercentage:
      firstNumber(source, ["variancePercentage", "variance_percentage", "variance", "deviationPercentage", "deviation"]) ??
      varianceFrom(actual, target),
    yoyPercentage: firstNumber(source, ["yoyPercentage", "yoy_percentage", "yoy", "growthPercentage"]),
    reportingExpected,
    reportingSubmitted,
    reportingCoverage:
      firstNumber(source, ["reportingCoverage", "reporting_coverage", "coveragePercentage", "coverage"]) ??
      (reportingExpected && reportingExpected > 0 && reportingSubmitted !== null
        ? Number(((reportingSubmitted / reportingExpected) * 100).toFixed(2))
        : null)
  };
}

function normalizeYoyPoint(value: unknown): AnalyticsYoyPoint {
  const source = isRecord(value) ? value : null;
  return {
    period: firstString(source, ["period", "month", "label", "date"]) ?? "",
    currentActual: firstNumber(source, ["currentActual", "current_actual", "current", "currentTotal", "current_total", "actual", "actualAmount"]),
    previousActual: firstNumber(source, ["previousActual", "previous_actual", "previous", "previousTotal", "previous_total", "prior", "priorActual"]),
    growthPercentage: firstNumber(source, ["growthPercentage", "growth_percentage", "yoyPercentage", "yoy", "growth"])
  };
}

function normalizeStatus(value: unknown): ReportingStatus {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (["reporting", "reported", "submitted", "complete", "completed", "valid", "verified"].includes(normalized)) {
    return "Reporting";
  }
  if (["delayed", "delay", "late", "pending", "processing", "warning", "invalid"].includes(normalized)) {
    return "Delayed";
  }
  return "Missing";
}

function normalizeReportingCell(value: unknown, fallbackPeriod?: string): AnalyticsReportingCell {
  if (!isRecord(value)) {
    return {
      period: fallbackPeriod ?? "",
      status: normalizeStatus(value),
      submittedAt: null
    };
  }

  return {
    period: firstString(value, ["period", "month", "label", "date"]) ?? fallbackPeriod ?? "",
    status: normalizeStatus(firstValue(value, ["status", "state", "value", "compliance"])),
    submittedAt: firstString(value, ["submittedAt", "submitted_at", "reportedAt", "reported_at"])
  };
}

function normalizeReportingRow(value: unknown, periods: string[]): AnalyticsReportingRow {
  const source = isRecord(value) ? value : null;
  const rawCells = firstValue(source, ["cells", "statuses", "months", "periods"]);
  let cells: AnalyticsReportingCell[];

  if (Array.isArray(rawCells)) {
    cells = rawCells.map((cell, index) => normalizeReportingCell(cell, periods[index]));
  } else if (isRecord(rawCells)) {
    cells = Object.entries(rawCells).map(([period, cell]) => normalizeReportingCell(cell, period));
  } else {
    cells = [];
  }

  return {
    regionId: firstString(source, ["regionId", "region_id", "id"]),
    regionName: firstString(source, ["regionName", "region_name", "name"]) ?? "Wilayah tidak diketahui",
    provinceName: firstString(source, ["provinceName", "province_name", "province"]),
    cells
  };
}

function normalizeReportingMatrix(value: unknown): AnalyticsReportingMatrix {
  const source = Array.isArray(value) ? null : isRecord(value) ? value : null;
  const rawPeriods = firstArray(source, ["periods", "months", "columns"]);
  const rawRows = Array.isArray(value) ? value : firstArray(source, ["regions", "rows", "items", "data"]);
  const periods = rawPeriods.map((period) => {
    if (isRecord(period)) {
      return firstString(period, ["period", "month", "label", "date"]) ?? "";
    }
    return asString(period) ?? "";
  }).filter(Boolean);
  const regions = rawRows.map((row) => normalizeReportingRow(row, periods));
  const derivedPeriods = [...new Set(regions.flatMap((row) => row.cells.map((cell) => cell.period)).filter(Boolean))];

  return {
    periods: periods.length > 0 ? periods : derivedPeriods,
    regions
  };
}

function sourceForPayload(payload: unknown): { source: JsonRecord; envelope: JsonRecord } {
  const envelope = isRecord(payload) ? payload : {};
  const data = isRecord(envelope.data) ? envelope.data : envelope;
  return { source: data, envelope };
}

export function normalizeAnalyticsOverview(payload: unknown): AnalyticsOverview {
  const { source, envelope } = sourceForPayload(payload);
  const metaSource = firstRecord(envelope, ["meta", "metadata"]);
  const publicValue =
    asBoolean(firstValue(source, ["public", "publicMode", "public_mode"])) ??
    asBoolean(firstValue(metaSource, ["public", "publicMode", "public_mode"])) ??
    false;
  const filters = firstRecord(source, ["filters"]);
  const period =
    firstString(source, ["period", "activePeriod", "active_period"]) ??
    firstString(filters, ["period"]) ??
    firstString(metaSource, ["period"]);
  const generatedAt =
    firstString(source, ["lastUpdated", "last_updated", "generatedAt", "generated_at", "updatedAt"]) ??
    firstString(metaSource, ["generatedAt", "generated_at", "updatedAt"]);
  const empty = createEmptyAnalyticsOverview({ period, generatedAt, public: publicValue } satisfies Partial<AnalyticsOverviewMeta>);
  const regionComparison = firstRecord(source, ["regionComparison", "topBottomRegions", "top_bottom_regions"]);
  const rawTopRegions = firstArray(source, ["topRegions", "top_regions", "top"]);
  const rawBottomRegions = firstArray(source, ["bottomRegions", "bottom_regions", "bottom"]);
  const targetVsActualValue = firstValue(source, ["targetVsActual", "target_vs_actual", "targetVariance", "target_variance"]);
  const rawTargetVsActual = Array.isArray(targetVsActualValue)
    ? targetVsActualValue
    : firstArray(isRecord(targetVsActualValue) ? targetVsActualValue : null, ["regions", "items", "data"]);
  const yoyValue = firstValue(source, ["yoyComparison", "yoy_comparison", "yoy", "historicalComparison"]);
  const rawYoy = Array.isArray(yoyValue)
    ? yoyValue
    : isRecord(yoyValue)
      ? [yoyValue]
      : [];
  const rawProvinceComparison = firstArray(source, ["provinceComparison", "province_comparison", "crossProvinceComparison", "cross_province_comparison", "provinces"]);
  const rawMonthlyTrend = firstArray(source, ["monthlyTrend", "monthly_trend", "revenueTrend", "trend"]);

  return {
    ...empty,
    kpis: normalizeKpis(source),
    monthlyTrend: rawMonthlyTrend.map(normalizeTrendPoint).filter((point) => point.period !== ""),
    topRegions: (rawTopRegions.length > 0 ? rawTopRegions : firstArray(regionComparison, ["top", "topRegions"]))
      .map(normalizeRegionMetric),
    bottomRegions: (rawBottomRegions.length > 0 ? rawBottomRegions : firstArray(regionComparison, ["bottom", "bottomRegions"]))
      .map(normalizeRegionMetric),
    targetVsActual: rawTargetVsActual.map(normalizeRegionMetric) as AnalyticsTargetActualPoint[],
    provinceComparison: rawProvinceComparison.map(normalizeProvinceMetric),
    yoyComparison: rawYoy.map(normalizeYoyPoint).filter((point) => point.period !== ""),
    reportingMatrix: normalizeReportingMatrix(
      firstValue(source, ["reportingMatrix", "reporting_matrix", "complianceMatrix", "compliance", "reporting"])
    )
  };
}

export async function fetchAnalyticsOverview(params: AnalyticsQueryParams = {}): Promise<AnalyticsOverview> {
  const period = normalizeAnalyticsPeriod(params.period);
  const from = normalizeAnalyticsPeriod(params.from);
  const to = normalizeAnalyticsPeriod(params.to);
  const url = buildUrl("/analytics/overview", {
    period,
    from,
    to,
    provinceIds: params.provinceId
  });
  const response = await fetch(url);

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed with status ${response.status}`);
  }

  return normalizeAnalyticsOverview(await response.json());
}

export function useAnalytics(params: AnalyticsQueryParams = {}, options?: { enabled?: boolean }) {
  const period = normalizeAnalyticsPeriod(params.period);
  const from = normalizeAnalyticsPeriod(params.from);
  const to = normalizeAnalyticsPeriod(params.to);

  return useQuery({
    queryKey: ["analytics-overview", period ?? null, from ?? null, to ?? null, params.provinceId ?? null],
    queryFn: () => fetchAnalyticsOverview({ ...params, period, from, to }),
    enabled: options?.enabled ?? true,
    staleTime: 5 * 60 * 1000,
    retry: 1,
    placeholderData: (previousData) => previousData
  });
}
