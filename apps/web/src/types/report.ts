export type ReportStatus = "queued" | "processing" | "completed" | "failed";

export type ReportAmountBasis = "gross" | "share" | "net";
export type ReportRankingCriterion = "total" | "monthly_average" | "target_achievement" | "growth" | "surplus" | "deficit";

export interface ReportRequest {
  period: string;
  from?: string;
  to?: string;
  regionIds: string[];
  format: "pdf" | "excel";
  reportType?: "executive_summary" | "rankings" | "monthly_breakdown" | "target_achievement" | "missing_data_audit" | "full";
  provinceIds?: string[];
  ranking?: ReportRankingCriterion;
  amountBasis?: ReportAmountBasis;
}

export interface ReportSummaryRegion {
  regionId: string;
  regionName: string;
  total: number;
  changePercentage: number;
}

export interface ReportTrendItem {
  regionId: string;
  regionName: string;
  changePercentage: number;
}

export interface ReportMonthlySummaryItem {
  period: string;
  total: number;
}

export interface ReportSummary {
  totalsByRegion: ReportSummaryRegion[];
  topGainers: ReportTrendItem[];
  topDecliners: ReportTrendItem[];
  lastTwelveMonths: ReportMonthlySummaryItem[];
}

export interface ReportJob {
  jobId: string;
  period: string;
  regionIds: string[];
  format: "pdf" | "excel";
  status: ReportStatus;
  downloadUrl: string | null;
  requestedAt: string;
  updatedAt: string;
  expiresAt?: string;
  errorMessage?: string;
  summary?: ReportSummary | null;
}
