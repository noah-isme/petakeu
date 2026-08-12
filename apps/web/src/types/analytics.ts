export type AnalyticsNumber = number | null;

export type ReportingStatus = "Reporting" | "Missing" | "Delayed";

export type AnalyticsAmountBasis = "gross" | "share" | "net";

export type AnalyticsRankingCriterion = "total" | "monthly_average" | "target_achievement" | "growth" | "surplus" | "deficit";

export interface ReportingValidationFinding {
  findingId?: string;
  severity?: "error" | "warning" | "info";
  message: string;
}

export interface ReportingMatrixDetail {
  grossAmount: number | null;
  shareAmount: number | null;
  netAmount: number | null;
  targetAmount: number | null;
  importFilename: string | null;
  importedBy: string | null;
  importedAt: string | null;
  validationFindings: ReportingValidationFinding[];
}

export interface AnalyticsOutlier {
  regionId: string | null;
  regionName: string;
  variancePercentage: AnalyticsNumber;
}

export interface AnalyticsKpis {
  nationalTotal: AnalyticsNumber;
  totalTarget: AnalyticsNumber;
  achievementPercentage: AnalyticsNumber;
  momGrowthPercentage: AnalyticsNumber;
  activeReportingCoverage: AnalyticsNumber;
  reportingExpected: number | null;
  reportingSubmitted: number | null;
  missingReports: number | null;
  topOutlierRegion: AnalyticsOutlier | null;
}

export interface AnalyticsTrendPoint {
  period: string;
  actual: AnalyticsNumber;
  target: AnalyticsNumber;
}

export interface AnalyticsRegionMetric {
  regionId: string | null;
  regionName: string;
  provinceName: string | null;
  actual: AnalyticsNumber;
  target: AnalyticsNumber;
  achievementPercentage: AnalyticsNumber;
  variancePercentage: AnalyticsNumber;
  yoyPercentage: AnalyticsNumber;
  rank: number | null;
}

export type AnalyticsTargetActualPoint = AnalyticsRegionMetric;

export interface AnalyticsProvinceMetric {
  provinceId: string | null;
  provinceName: string;
  actual: AnalyticsNumber;
  target: AnalyticsNumber;
  achievementPercentage: AnalyticsNumber;
  variancePercentage: AnalyticsNumber;
  yoyPercentage: AnalyticsNumber;
  reportingExpected: number | null;
  reportingSubmitted: number | null;
  reportingCoverage: AnalyticsNumber;
}

export interface AnalyticsYoyPoint {
  period: string;
  currentActual: AnalyticsNumber;
  previousActual: AnalyticsNumber;
  growthPercentage: AnalyticsNumber;
}

export interface AnalyticsReportingCell {
  period: string;
  status: ReportingStatus;
  submittedAt: string | null;
  actual?: number | null;
  detail?: ReportingMatrixDetail;
}

export interface AnalyticsReportingRow {
  regionId: string | null;
  regionName: string;
  provinceName: string | null;
  cells: AnalyticsReportingCell[];
}

export interface AnalyticsReportingMatrix {
  periods: string[];
  regions: AnalyticsReportingRow[];
}

export interface AnalyticsOverviewMeta {
  period: string | null;
  generatedAt: string | null;
  public: boolean;
}

/**
 * Normalized data consumed by the analytics page. The API response may omit a
 * section when no rows are available; the hook converts that into an empty
 * array or null-valued KPI so the UI never fabricates a financial value.
 */
export interface AnalyticsOverview {
  period: string | null;
  lastUpdated: string | null;
  public: boolean;
  kpis: AnalyticsKpis;
  monthlyTrend: AnalyticsTrendPoint[];
  topRegions: AnalyticsRegionMetric[];
  bottomRegions: AnalyticsRegionMetric[];
  targetVsActual: AnalyticsTargetActualPoint[];
  provinceComparison: AnalyticsProvinceMetric[];
  yoyComparison: AnalyticsYoyPoint[];
  reportingMatrix: AnalyticsReportingMatrix;
}

/**
 * Backend envelope contract. Fields are optional at the boundary because a
 * successful empty response is valid and older deployments may omit sections
 * that were not populated for a period.
 */
export interface AnalyticsOverviewResponse {
  data?: Partial<AnalyticsOverview> | null;
  meta?: Partial<AnalyticsOverviewMeta> | null;
}

export function createEmptyAnalyticsOverview(
  meta: Partial<AnalyticsOverviewMeta> = {}
): AnalyticsOverview {
  return {
    period: meta.period ?? null,
    lastUpdated: meta.generatedAt ?? null,
    public: meta.public ?? false,
    kpis: {
      nationalTotal: null,
      totalTarget: null,
      achievementPercentage: null,
      momGrowthPercentage: null,
      activeReportingCoverage: null,
      reportingExpected: null,
      reportingSubmitted: null,
      missingReports: null,
      topOutlierRegion: null
    },
    monthlyTrend: [],
    topRegions: [],
    bottomRegions: [],
    targetVsActual: [],
    provinceComparison: [],
    yoyComparison: [],
    reportingMatrix: {
      periods: [],
      regions: []
    }
  };
}
