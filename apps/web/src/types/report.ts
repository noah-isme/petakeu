export interface ReportRequest {
  regionId: string;
  periodFrom: string;
  periodTo: string;
  type: "pdf" | "excel";
}

export interface ReportJob {
  jobId: string;
  status: "queued" | "processing" | "completed" | "failed";
  downloadUrl: string | null;
  regionId: string;
  periodFrom: string;
  periodTo: string;
  type: "pdf" | "excel";
  requestedAt: string;
  updatedAt: string;
  expiresAt?: string;
  expired?: boolean;
}
