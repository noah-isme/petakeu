export interface ReportRequest {
  regionId: string;
  periodFrom: string;
  periodTo: string;
  type: "pdf" | "excel";
}

export interface ReportJob {
  jobId: string;
  status: "queued" | "processing" | "completed" | "failed";
  downloadUrl?: string;
}
