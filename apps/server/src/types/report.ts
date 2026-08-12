export type ReportStatus = "queued" | "processing" | "completed" | "failed";
export type ReportAmountBasis = "gross" | "share" | "net";
export type ReportRankingCriterion =
  | "total"
  | "average_monthly"
  | "target_achievement"
  | "growth"
  | "surplus"
  | "deficit";
export type ReportType = "executive-summary" | "full" | "missing-data";

export interface ReportLogo {
  /** A bounded data URI for a PNG or JPEG logo. */
  dataUri: string;
}

export interface ReportBranding {
  organizationName?: string;
  header?: string;
  footer?: string;
  signatureText?: string;
  logo?: ReportLogo;
}

export interface ReportRequest {
  period: string;
  regionIds: string[];
  format: "pdf" | "excel";
  branding?: ReportBranding;
  periodFrom?: string;
  periodTo?: string;
  provinceIds?: string[];
  rankingCriterion?: ReportRankingCriterion;
  amountBasis?: ReportAmountBasis;
  reportType?: ReportType;
}

export interface ReportJobData {
  jobId: string;
  period: string;
  regionIds: string[];
  format: "pdf" | "excel";
  branding?: ReportBranding;
  periodFrom?: string;
  periodTo?: string;
  provinceIds?: string[];
  rankingCriterion?: ReportRankingCriterion;
  amountBasis?: ReportAmountBasis;
  reportType?: ReportType;
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
  topGainers?: ReportTrendItem[];
  topDecliners?: ReportTrendItem[];
  lastTwelveMonths?: ReportMonthlySummaryItem[];
  filters?: {
    periodFrom: string;
    periodTo: string;
    provinceIds: string[];
    rankingCriterion: ReportRankingCriterion;
    amountBasis: ReportAmountBasis;
    reportType: ReportType;
  };
  missingData?: {
    expected: number;
    reported: number;
    missing: number;
  };
}

export interface ReportJob {
  jobId: string;
  period: string;
  regionIds: string[];
  format: "pdf" | "excel";
  status: ReportStatus;
  downloadUrl?: string | null;
  requestedAt: string;
  updatedAt: string;
  expiresAt?: string;
  errorMessage?: string;
  summary?: ReportSummary | null;
  periodFrom?: string;
  periodTo?: string;
  provinceIds?: string[];
  rankingCriterion?: ReportRankingCriterion;
  amountBasis?: ReportAmountBasis;
  reportType?: ReportType;
}
