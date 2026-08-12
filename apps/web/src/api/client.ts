import { buildUrl } from "../config/api";
import { getAccessToken } from "../lib/auth";

import type { AuditLogQuery, AuditLogResponse } from "../types/audit";
import type { ChoroplethResponse } from "../types/geo";
import type { Region, RegionSummary } from "../types/region";
import type { ReportJob, ReportRequest } from "../types/report";
import type { ReportingMatrixDetail } from "../types/analytics";
import type {
  StagedUploadRow,
  UploadConfirmationInput,
  UploadConfirmationResult,
  UploadCreated,
  UploadRecord,
  UploadRowPatch,
  UploadRowsPage,
  UploadStatus,
  UploadValidationFinding,
  ValidationSeverity,
  RegionAlias
} from "../types/upload";

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

type JsonObject = Record<string, unknown>;

function asObject(value: unknown): JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as JsonObject) : {};
}

function firstValue(source: JsonObject, keys: string[]): unknown {
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null) return source[key];
  }
  return undefined;
}

function asString(value: unknown): string | null {
  if (typeof value === "string" && value.trim() !== "") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value.replace(/\s/g, "").replace(/,/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeUploadStatus(value: unknown): UploadStatus {
  const status = String(value ?? "").trim().toLowerCase();
  if (["awaiting_confirmation", "awaiting-confirmation", "review", "under_review", "staged"].includes(status)) {
    return "awaiting_confirmation";
  }
  if (["persisted", "published", "committed"].includes(status)) return "persisted";
  if (["confirmed", "approved"].includes(status)) return "confirmed";
  if (["cancelled", "canceled"].includes(status)) return "cancelled";
  if (status === "parsing") return "parsing";
  if (status === "committing") return "committing";
  if (["processing", "running"].includes(status)) return "processing";
  if (["parsed", "ready", "completed"].includes(status)) return "parsed";
  if (["failed", "error"].includes(status)) return "failed";
  return "queued";
}

function normalizeUploadCreated(payload: unknown): UploadCreated {
  const source = asObject(payload);
  const data = asObject(source.data);
  const value = Object.keys(data).length > 0 ? data : source;
  return {
    uploadId: asString(firstValue(value, ["uploadId", "upload_id", "id"])) ?? "",
    status: normalizeUploadStatus(firstValue(value, ["status", "state"])),
    hash: asString(firstValue(value, ["hash", "sha256", "sha_key"])) ?? ""
  };
}

function normalizeSeverity(value: unknown): ValidationSeverity {
  const severity = String(value ?? "error").trim().toLowerCase();
  if (severity === "warning" || severity === "warn") return "warning";
  if (severity === "info" || severity === "notice") return "info";
  return "error";
}

function normalizeFinding(value: unknown, index: number): UploadValidationFinding {
  const source = asObject(value);
  return {
    findingId: asString(firstValue(source, ["findingId", "finding_id", "id", "code"])) ?? `finding-${index + 1}`,
    code: asString(firstValue(source, ["code", "rule", "validationCode"])) ?? undefined,
    severity: normalizeSeverity(firstValue(source, ["severity", "level", "type"])),
    column: asString(firstValue(source, ["column", "field", "columnName"])),
    message: asString(firstValue(source, ["message", "detail", "reason"])) ?? "Validasi perlu ditinjau.",
    acknowledged: firstValue(source, ["acknowledged", "isAcknowledged"]) === true
  };
}

function normalizeStagedRow(value: unknown, index: number): StagedUploadRow {
  const source = asObject(value);
  const findingsValue = firstValue(source, ["findings", "validationFindings", "validation_findings", "errors", "warnings"]);
  const findings = Array.isArray(findingsValue) ? findingsValue.map(normalizeFinding) : [];
  return {
    rowId: asString(firstValue(source, ["rowId", "row_id", "id"])) ?? `row-${index + 1}`,
    rowNumber: asNumber(firstValue(source, ["rowNumber", "row_number", "row", "line"])) ?? index + 1,
    revision: asNumber(firstValue(source, ["revision", "version"])) ?? 0,
    regionId: asString(firstValue(source, ["regionId", "region_id"])),
    regionCode: asString(firstValue(source, ["regionCode", "region_code", "bpsCode", "bps_code", "kodeBps", "kode_daerah"])),
    regionName: asString(firstValue(source, ["regionName", "region_name", "name", "namaWilayah", "nama_daerah"])),
    province: asString(firstValue(source, ["province", "provinceName", "province_name", "provinsi"])),
    period: asString(firstValue(source, ["period", "reportPeriod", "report_period", "periode"])),
    grossAmount: asNumber(firstValue(source, ["grossAmount", "gross_amount", "gross", "amount", "nominal", "setoran"])),
    shareAmount: asNumber(firstValue(source, ["shareAmount", "share_amount", "share", "cut15Amount", "cut15_amount"])),
    netAmount: asNumber(firstValue(source, ["netAmount", "net_amount", "net", "neto"])),
    targetAmount: asNumber(firstValue(source, ["targetAmount", "target_amount", "target"])),
    source: asString(firstValue(source, ["source", "sourceName", "sumber"])),
    findings,
    rawValues: asObject(firstValue(source, ["rawValues", "raw_values", "raw"])),
    warningAcknowledged: firstValue(source, ["warningAcknowledged", "warning_acknowledged", "acknowledged"]) === true
  };
}

function normalizeUploadRows(payload: unknown): UploadRowsPage {
  const envelope = asObject(payload);
  const rawData = firstValue(envelope, ["data", "rows", "items"]);
  const nestedObject = asObject(rawData);
  const nestedData = nestedObject.data ?? nestedObject.rows ?? nestedObject.items;
  const dataSource: unknown[] = Array.isArray(rawData) ? rawData : Array.isArray(nestedData) ? nestedData : [];
  const rows = dataSource.map(normalizeStagedRow);
  // Staged rows have existed in two compatible envelopes during the rollout:
  // `{data, meta}` and `{data, page, pageSize, total, totalPages}`. Accept
  // both so the review UI can be deployed before/after the backend migration.
  const explicitMeta = asObject(firstValue(envelope, ["meta", "pagination"]));
  const meta = Object.keys(explicitMeta).length > 0 ? explicitMeta : envelope;
  return {
    data: rows,
    meta: {
      page: asNumber(firstValue(meta, ["page", "currentPage"])) ?? 1,
      pageSize: asNumber(firstValue(meta, ["pageSize", "page_size", "limit"])) ?? (rows.length || 25),
      total: asNumber(firstValue(meta, ["total", "totalRows", "count"])) ?? rows.length,
      totalPages: asNumber(firstValue(meta, ["totalPages", "total_pages", "pages"])) ?? 1
    }
  };
}

function normalizeReportingDetail(payload: unknown): ReportingMatrixDetail {
  const envelope = asObject(payload);
  const candidate = asObject(firstValue(envelope, ["data", "detail"]));
  const source = Object.keys(candidate).length > 0 ? candidate : envelope;
  const findings = firstValue(source, ["validationFindings", "validation_findings", "findings"]);
  return {
    grossAmount: asNumber(firstValue(source, ["grossAmount", "gross_amount", "gross", "amount"])),
    shareAmount: asNumber(firstValue(source, ["shareAmount", "share_amount", "share", "cut15Amount"])),
    netAmount: asNumber(firstValue(source, ["netAmount", "net_amount", "net"])),
    targetAmount: asNumber(firstValue(source, ["targetAmount", "target_amount", "target"])),
    importFilename: asString(firstValue(source, ["importFilename", "import_filename", "filename"])),
    importedBy: asString(firstValue(source, ["importedBy", "imported_by", "operator", "user"])),
    importedAt: asString(firstValue(source, ["importedAt", "imported_at", "createdAt"])),
    validationFindings: Array.isArray(findings)
      ? findings.map((finding, index) => {
          const item = asObject(finding);
          return {
            findingId: asString(firstValue(item, ["findingId", "finding_id", "id"])) ?? `finding-${index + 1}`,
            severity: normalizeSeverity(firstValue(item, ["severity", "level"])),
            message: asString(firstValue(item, ["message", "detail", "reason"])) ?? "Validasi perlu ditinjau."
          };
        })
      : []
  };
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
  getReportingMatrixDetail(regionId: string, period: string) {
    const url = buildUrl(`/analytics/reporting-matrix/${encodeURIComponent(regionId)}/${encodeURIComponent(period)}`);
    return fetchJson<unknown>(url).then(normalizeReportingDetail);
  },
  listRegionAliases(params: { query?: string; regionId?: string; provinceId?: string } = {}) {
    const url = buildUrl("/region-aliases", params);
    return fetchJson<{ data?: RegionAlias[] } | RegionAlias[]>(url).then((payload) => {
      if (Array.isArray(payload)) return payload;
      return payload.data ?? [];
    });
  },
  createRegionAlias(input: { alias: string; regionId: string; provinceId?: string }) {
    const url = buildUrl("/region-aliases");
    return fetchJson<{ data?: RegionAlias } | RegionAlias>(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input)
    }).then((payload) => (asObject(payload).data ?? payload) as RegionAlias);
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
    return normalizeUploadCreated(await response.json());
  },
  getUpload(uploadId: string) {
    const url = buildUrl(`/uploads/${encodeURIComponent(uploadId)}`);
    return fetchJson<{ data?: UploadRecord } | UploadRecord>(url).then((payload) => {
      const source = asObject(payload);
      const data = asObject(source.data);
      return data.uploadId ? (data as unknown as UploadRecord) : (payload as UploadRecord);
    });
  },
  getUploadRows(uploadId: string, params: { page?: number; pageSize?: number } = {}) {
    const url = buildUrl(`/uploads/${encodeURIComponent(uploadId)}/rows`, {
      page: params.page,
      pageSize: params.pageSize
    });
    return fetchJson<unknown>(url).then(normalizeUploadRows);
  },
  updateUploadRow(uploadId: string, rowId: string, patch: UploadRowPatch) {
    const url = buildUrl(`/uploads/${encodeURIComponent(uploadId)}/rows/${encodeURIComponent(rowId)}`);
    return fetchJson<unknown>(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch)
    }).then((payload) => normalizeStagedRow(asObject(payload).data ?? payload, 0));
  },
  confirmUpload(uploadId: string, input: UploadConfirmationInput = {}) {
    const url = buildUrl(`/uploads/${encodeURIComponent(uploadId)}/confirm`);
    return fetchJson<unknown>(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input)
    }).then((payload) => {
      const source = asObject(payload);
      const data = asObject(source.data);
      const value = Object.keys(data).length > 0 ? data : source;
      return {
        uploadId: asString(firstValue(value, ["uploadId", "upload_id", "id"])) ?? uploadId,
        status: normalizeUploadStatus(firstValue(value, ["status", "state"])) || "persisted",
        persistedRows: asNumber(firstValue(value, ["persistedRows", "persisted_rows", "rows"])) ?? undefined,
        overwrittenRows: asNumber(firstValue(value, ["overwrittenRows", "overwritten_rows", "overwrites"])) ?? undefined
      } satisfies UploadConfirmationResult;
    });
  },
  cancelUpload(uploadId: string) {
    const url = buildUrl(`/uploads/${encodeURIComponent(uploadId)}/cancel`);
    return fetchJson<unknown>(url, { method: "POST" }).then((payload) => {
      const source = asObject(payload);
      const data = asObject(source.data);
      const value = Object.keys(data).length > 0 ? data : source;
      return {
        uploadId: asString(firstValue(value, ["uploadId", "upload_id", "id"])) ?? uploadId,
        status: normalizeUploadStatus(firstValue(value, ["status", "state"]))
      };
    });
  },
  async downloadUploadTemplate() {
    const url = buildUrl("/uploads/template");
    const headers = new Headers();
    const token = getAccessToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
    const response = await fetch(url, { headers });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `Request failed with status ${response.status}`);
    }
    return response.blob();
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
