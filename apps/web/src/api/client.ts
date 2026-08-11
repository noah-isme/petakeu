import { buildUrl } from "../config/api";
import { getAccessToken } from "../lib/auth";

import type { AuditLogQuery, AuditLogResponse } from "../types/audit";
import type { ChoroplethResponse } from "../types/geo";
import type { Region, RegionSummary } from "../types/region";
import type { ReportJob, ReportRequest } from "../types/report";
import type { UploadCreated, UploadRecord } from "../types/upload";

async function fetchJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  const token = getAccessToken();
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(input, { ...init, headers });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed with status ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export const apiClient = {
  getRegions(params: { level?: "province" | "regency"; parent?: string } = {}) {
    const url = buildUrl("/regions", params);
    return fetchJson<{ data: Region[]; meta: { page: number; pageSize: number; total: number; totalPages: number } }>(url).then(
      (res) => res.data
    );
  },
  getRegionSummary(regionId: string, params: { from?: string; to?: string } = {}) {
    const url = buildUrl(`/regions/${regionId}/summary`, params);
    return fetchJson<RegionSummary>(url);
  },
  getChoropleth(period: string) {
    const url = buildUrl("/geo/choropleth", { period });
    return fetchJson<ChoroplethResponse>(url);
  },
  async uploadFile(formData: FormData) {
    const url = buildUrl("/uploads");
    const headers = new Headers();
    const token = getAccessToken();
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: formData
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || "Upload failed");
    }
    const payload = (await response.json()) as UploadCreated;
    return payload;
  },
  createReport(payload: ReportRequest) {
    const url = buildUrl("/reports/export");
    return fetchJson<{ data: ReportJob }>(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    }).then((res) => res.data);
  },
  listUploads() {
    const url = buildUrl("/uploads");
    return fetchJson<{ data: UploadRecord[] }>(url).then((res) => res.data);
  },
  listReportJobs() {
    const url = buildUrl("/reports");
    return fetchJson<{ data: ReportJob[] }>(url).then((res) => res.data);
  },
  listAuditLogs(params: AuditLogQuery) {
    const url = buildUrl("/audit-logs", { ...params });
    return fetchJson<AuditLogResponse>(url);
  }
};
