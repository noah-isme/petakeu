import { randomUUID } from "node:crypto";

import {
  ReportJob,
  ReportRequest,
  ReportSummary,
  ReportSummaryRegion,
  ReportTrendItem,
} from "../types/report";

const reportStore = new Map<string, ReportJob>();

function buildDownloadUrl(jobId: string, format: ReportRequest["format"]): string {
  const extension = format === "excel" ? "xlsx" : "pdf";
  return `https://storage.petakeu.local/reports/${jobId}.${extension}`;
}

function buildTotalsByRegion(request: ReportRequest): ReportSummaryRegion[] {
  return request.regionIds.map((regionId, index) => ({
    regionId,
    regionName: `Wilayah ${index + 1}`,
    total: 50_000_000 + index * 7_500_000,
    changePercentage: Number((Math.sin(index + 1) * 12).toFixed(2)),
  }));
}

function buildTrendItems(
  totals: ReportSummaryRegion[],
  order: "desc" | "asc",
): ReportTrendItem[] {
  const sorted = [...totals].sort((a, b) =>
    order === "desc" ? b.changePercentage - a.changePercentage : a.changePercentage - b.changePercentage,
  );
  return sorted.slice(0, Math.min(sorted.length, 10)).map((item) => ({
    regionId: item.regionId,
    regionName: item.regionName,
    changePercentage: item.changePercentage,
  }));
}

function buildLastTwelveMonths(period: string): ReportSummary["lastTwelveMonths"] {
  const [yearStr, monthStr] = period.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);

  return Array.from({ length: 12 }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 1));
    date.setUTCMonth(date.getUTCMonth() - (11 - index));
    const isoYear = date.getUTCFullYear();
    const isoMonth = `${date.getUTCMonth() + 1}`.padStart(2, "0");
    return {
      period: `${isoYear}-${isoMonth}`,
      total: 40_000_000 + index * 2_500_000,
    };
  });
}

function buildSummary(request: ReportRequest): ReportSummary {
  const totals = buildTotalsByRegion(request);
  return {
    totalsByRegion: totals,
    topGainers: buildTrendItems(totals, "desc"),
    topDecliners: buildTrendItems(totals, "asc"),
    lastTwelveMonths: buildLastTwelveMonths(request.period),
  };
}

export async function enqueueReport(request: ReportRequest): Promise<ReportJob> {
  const jobId = randomUUID();
  const now = new Date().toISOString();
  const summary = buildSummary(request);

  const job: ReportJob = {
    jobId,
    period: request.period,
    regionIds: request.regionIds,
    format: request.format,
    status: "completed",
    downloadUrl: buildDownloadUrl(jobId, request.format),
    requestedAt: now,
    updatedAt: now,
    expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString(),
    summary,
  };

  reportStore.set(jobId, job);
  return job;
}

export function listReports(): ReportJob[] {
  return Array.from(reportStore.values()).sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
}

export function getReport(jobId: string): ReportJob | undefined {
  return reportStore.get(jobId);
}

export const reportService = {
  enqueueReport,
  listReports,
  getReport,
};
