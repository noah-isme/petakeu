import { randomUUID } from "node:crypto";

import { ReportJob, ReportRequest } from "../types/report";

export async function enqueueReport(request: ReportRequest): Promise<ReportJob> {
  return {
    jobId: randomUUID(),
    status: "queued",
    downloadUrl: undefined
  };
}

export const reportService = {
  enqueueReport
};
