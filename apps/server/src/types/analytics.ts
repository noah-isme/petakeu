export interface AnalyticsOverviewParams {
  period: string;
  from: string;
  to: string;
  provinceIds: string[];
}

export interface TargetListParams {
  regionId?: string;
  period?: string;
  from?: string;
  to?: string;
  provinceIds: string[];
}

export interface RevenueTargetInput {
  regionId: string;
  period: string;
  target: number;
}

export interface RevenueTarget {
  id: string;
  regionId: string;
  regionName: string;
  regionLevel: number;
  provinceId?: string;
  provinceName?: string;
  period: string;
  target: number;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface AnalyticsRegionMetric {
  regionId: string;
  regionName: string;
  provinceId?: string;
  provinceName?: string;
  actual: number;
  target: number;
  variance: number;
  variancePercentage: number;
  achievementPercentage: number;
  rank?: number;
}

export interface AnalyticsOutlierRegion {
  regionId: string;
  regionName: string;
  provinceId?: string;
  provinceName?: string;
  actual: number;
  previousActual: number;
  growthPercentage: number;
  direction: 'up' | 'down' | 'flat';
}

export interface AnalyticsProvinceComparison {
  provinceId?: string;
  provinceName: string;
  actual: number;
  target: number;
  variance: number;
  achievementPercentage: number;
  expectedRegencies: number;
  reportedRegencies: number;
  coveragePercentage: number;
}

export interface AnalyticsMonthlyTrendPoint {
  period: string;
  actual: number;
  target: number;
  variance: number;
  variancePercentage: number;
}

export type ReportingMatrixStatus = 'reported' | 'missing' | 'delayed' | 'pending';

export interface ReportingMatrixCell {
  period: string;
  status: ReportingMatrixStatus;
  actual: number;
}

export interface ReportingMatrixRegion {
  regionId: string;
  regionName: string;
  provinceId?: string;
  provinceName?: string;
  months: ReportingMatrixCell[];
}

export interface ReportingMatrixSummary {
  expected: number;
  reported: number;
  missing: number;
  delayed: number;
  pending: number;
  coveragePercentage: number;
}

export interface ReportingMatrix {
  periods: string[];
  regions: ReportingMatrixRegion[];
  summary: ReportingMatrixSummary;
}

export interface AnalyticsTargetVsActual {
  period: string;
  totalActual: number;
  totalTarget: number;
  variance: number;
  variancePercentage: number;
  achievementPercentage: number;
  regions: AnalyticsRegionMetric[];
}

export interface AnalyticsYoYRegion {
  regionId: string;
  regionName: string;
  provinceId?: string;
  provinceName?: string;
  actual: number;
  previousActual: number;
  growthPercentage: number;
}

export interface AnalyticsYoYComparison {
  period: string;
  comparisonPeriod: string;
  currentTotal: number;
  previousTotal: number;
  growthPercentage: number;
  regions: AnalyticsYoYRegion[];
}

export interface AnalyticsOverviewKpis {
  nationalTotal: number;
  momGrowth: number;
  reportingCoverage: number;
  outlierRegions: AnalyticsOutlierRegion[];
}

export interface AnalyticsOverview {
  filters: AnalyticsOverviewParams;
  kpis: AnalyticsOverviewKpis;
  monthlyTrend: AnalyticsMonthlyTrendPoint[];
  topRegions: AnalyticsRegionMetric[];
  bottomRegions: AnalyticsRegionMetric[];
  targetVsActual: AnalyticsTargetVsActual;
  crossProvinceComparison: AnalyticsProvinceComparison[];
  yoyComparison: AnalyticsYoYComparison;
  reportingMatrix: ReportingMatrix;
}
