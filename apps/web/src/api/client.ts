import { buildUrl } from "../config/api";
import type { ChoroplethResponse } from "../types/geo";
import type { Region, RegionSummary } from "../types/region";
import type { ReportJob, ReportRequest } from "../types/report";
import type { UploadCreated, UploadRecord } from "../types/upload";

async function fetchJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
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
    const response = await fetch(url, {
      method: "POST",
      body: formData
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || "Upload failed");
    }
    const payload = (await response.json()) as { upload_id: string };
    return {
      uploadId: payload.upload_id,
      status: "queued"
    } satisfies UploadCreated;
  },
  createReport(payload: ReportRequest) {
    const url = buildUrl("/reports");
    return fetchJson<{ job_id: string }>(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    }).then((res) => res.job_id);
  },
  listUploads() {
    const url = buildUrl("/uploads");
    return fetchJson<{ data: UploadRecord[] }>(url).then((res) => res.data);
  },
  listReportJobs() {
    const url = buildUrl("/reports");
    return fetchJson<{ data: ReportJob[] }>(url).then((res) => res.data);
  }
};
