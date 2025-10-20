export type ReportStatus = "queued" | "processing" | "completed" | "failed";

export interface ReportRequest {
  period: string;
  regionIds: string[];
  format: "pdf" | "excel";
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
  summary: ReportSummary;
}
