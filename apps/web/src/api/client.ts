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

export const DEFAULT_API_TIMEOUT_MS = 30_000;

export interface RequestOptions extends Omit<RequestInit, "signal"> {
  timeout?: number;
  signal?: AbortSignal | null;
}

export class ApiTimeoutError extends Error {
  readonly status: number = 408;
  readonly timeoutMs: number;

  constructor(timeoutMs: number, message?: string) {
    super(message ?? `Permintaan melebihi batas waktu ${timeoutMs / 1000} detik.`);
    this.name = "ApiTimeoutError";
    this.timeoutMs = timeoutMs;
    Object.setPrototypeOf(this, ApiTimeoutError.prototype);
  }
}

/**
 * Error returned by an API request that received a non-2xx response.
 *
 * Keeping the HTTP status and the server supplied details on the error lets
 * workflow callers distinguish a recoverable conflict (409) from a terminal
 * upload failure without parsing a stringified response body.
 */
export class ApiHttpError extends Error {
  readonly status: number;
  readonly details: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = "ApiHttpError";
    this.status = status;
    this.details = details;
    Object.setPrototypeOf(this, ApiHttpError.prototype);
  }
}

type ErrorPayload = Record<string, unknown>;

function errorMessage(payload: unknown, fallback: string): string {
  if (typeof payload === "string" && payload.trim() !== "") return payload;
  const source = asObject(payload);
  const nested = asObject(source.error);
  const candidates = [source.message, source.error, source.detail, nested.message];
  const message = candidates.find((candidate) => typeof candidate === "string" && candidate.trim() !== "");
  return typeof message === "string" ? message : fallback;
}

/** Convert a JSON or text response body into the typed API error used by the UI. */
export function createApiHttpError(status: number, payload: unknown): ApiHttpError {
  return new ApiHttpError(status, errorMessage(payload, `Request failed with status ${status}`), asObject(payload).details ?? payload);
}

async function responseError(response: Response): Promise<ApiHttpError> {
  const text = await response.text();
  let payload: unknown = text;
  if (text.trim() !== "") {
    try {
      payload = JSON.parse(text) as ErrorPayload;
    } catch {
      // Keep the original text as the details for plain-text proxy errors.
    }
  }
  return createApiHttpError(response.status, payload);
}

export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestOptions
): Promise<Response> {
  const { timeout = DEFAULT_API_TIMEOUT_MS, signal: callerSignal, ...restInit } = init ?? {};
  const headers = new Headers(restInit.headers);
  const token = getAccessToken();
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let isTimedOut = false;

  const onCallerAbort = () => {
    controller.abort(callerSignal?.reason);
  };

  if (callerSignal) {
    if (callerSignal.aborted) {
      controller.abort(callerSignal.reason);
    } else {
      callerSignal.addEventListener("abort", onCallerAbort, { once: true });
    }
  }

  if (timeout > 0 && Number.isFinite(timeout)) {
    timeoutId = setTimeout(() => {
      isTimedOut = true;
      controller.abort(new Error(`Timeout of ${timeout}ms exceeded`));
    }, timeout);
  }

  try {
    return await fetch(input, {
      ...restInit,
      headers,
      signal: controller.signal
    });
  } catch (err: unknown) {
    if (isTimedOut) {
      throw new ApiTimeoutError(timeout, `Permintaan waktu habis setelah ${timeout / 1000} detik.`);
    }
    throw err;
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
    if (callerSignal) {
      callerSignal.removeEventListener("abort", onCallerAbort);
    }
  }
}

async function fetchJson<T>(input: RequestInfo | URL, init?: RequestOptions): Promise<T> {
  const response = await fetchWithTimeout(input, init);
  if (!response.ok) {
    throw await responseError(response);
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
  getRegions(params: { level?: "province" | "regency"; parent?: string } = {}, options?: RequestOptions) {
    const url = buildUrl("/regions", params);
    return fetchJson<{ data: Region[]; meta: { page: number; pageSize: number; total: number; totalPages: number } }>(
      url,
      options
    ).then((res) => res.data);
  },
  getRegionSummary(regionId: string, params: { from?: string; to?: string } = {}, options?: RequestOptions) {
    const url = buildUrl(`/regions/${regionId}/summary`, params);
    return fetchJson<RegionSummary>(url, options);
  },
  getChoropleth(period: string, options?: RequestOptions) {
    const url = buildUrl("/geo/choropleth", { period });
    return fetchJson<ChoroplethResponse>(url, options);
  },
  getReportingMatrixDetail(regionId: string, period: string, options?: RequestOptions) {
    const url = buildUrl(`/analytics/reporting-matrix/${encodeURIComponent(regionId)}/${encodeURIComponent(period)}`);
    return fetchJson<unknown>(url, options).then(normalizeReportingDetail);
  },
  listRegionAliases(params: { query?: string; regionId?: string; provinceId?: string } = {}, options?: RequestOptions) {
    const url = buildUrl("/region-aliases", params);
    return fetchJson<{ data?: RegionAlias[] } | RegionAlias[]>(url, options).then((payload) => {
      if (Array.isArray(payload)) return payload;
      return payload.data ?? [];
    });
  },
  createRegionAlias(input: { alias: string; regionId: string; provinceId?: string }, options?: RequestOptions) {
    const url = buildUrl("/region-aliases");
    const headers = new Headers(options?.headers);
    if (!headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    return fetchJson<{ data?: RegionAlias } | RegionAlias>(url, {
      ...options,
      method: "POST",
      headers,
      body: JSON.stringify(input)
    }).then((payload) => (asObject(payload).data ?? payload) as RegionAlias);
  },
  async uploadFile(formData: FormData, options?: RequestOptions) {
    const url = buildUrl("/uploads");
    const payload = await fetchJson<unknown>(url, {
      ...options,
      method: "POST",
      body: formData
    });
    return normalizeUploadCreated(payload);
  },
  getUpload(uploadId: string, options?: RequestOptions) {
    const url = buildUrl(`/uploads/${encodeURIComponent(uploadId)}`);
    return fetchJson<{ data?: UploadRecord } | UploadRecord>(url, options).then((payload) => {
      const source = asObject(payload);
      const data = asObject(source.data);
      return data.uploadId ? (data as unknown as UploadRecord) : (payload as UploadRecord);
    });
  },
  getUploadRows(uploadId: string, params: { page?: number; pageSize?: number } = {}, options?: RequestOptions) {
    const url = buildUrl(`/uploads/${encodeURIComponent(uploadId)}/rows`, {
      page: params.page,
      pageSize: params.pageSize
    });
    return fetchJson<unknown>(url, options).then(normalizeUploadRows);
  },
  updateUploadRow(uploadId: string, rowId: string, patch: UploadRowPatch, options?: RequestOptions) {
    const url = buildUrl(`/uploads/${encodeURIComponent(uploadId)}/rows/${encodeURIComponent(rowId)}`);
    const headers = new Headers(options?.headers);
    if (!headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    return fetchJson<unknown>(url, {
      ...options,
      method: "PATCH",
      headers,
      body: JSON.stringify(patch)
    }).then((payload) => normalizeStagedRow(asObject(payload).data ?? payload, 0));
  },
  confirmUpload(uploadId: string, input: UploadConfirmationInput = {}, options?: RequestOptions) {
    const url = buildUrl(`/uploads/${encodeURIComponent(uploadId)}/confirm`);
    const headers = new Headers(options?.headers);
    if (!headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    return fetchJson<unknown>(url, {
      ...options,
      method: "POST",
      headers,
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
  cancelUpload(uploadId: string, options?: RequestOptions) {
    const url = buildUrl(`/uploads/${encodeURIComponent(uploadId)}/cancel`);
    return fetchJson<unknown>(url, { ...options, method: "POST" }).then((payload) => {
      const source = asObject(payload);
      const data = asObject(source.data);
      const value = Object.keys(data).length > 0 ? data : source;
      return {
        uploadId: asString(firstValue(value, ["uploadId", "upload_id", "id"])) ?? uploadId,
        status: normalizeUploadStatus(firstValue(value, ["status", "state"]))
      };
    });
  },
  async downloadUploadTemplate(options?: RequestOptions) {
    const url = buildUrl("/uploads/template");
    const response = await fetchWithTimeout(url, options);
    if (!response.ok) {
      throw await responseError(response);
    }
    return response.blob();
  },
  createReport(payload: ReportRequest, options?: RequestOptions) {
    const url = buildUrl("/reports/export");
    const headers = new Headers(options?.headers);
    if (!headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    return fetchJson<{ data: ReportJob }>(url, {
      ...options,
      method: "POST",
      headers,
      body: JSON.stringify(payload)
    }).then((res) => res.data);
  },
  listUploads(options?: RequestOptions) {
    const url = buildUrl("/uploads");
    return fetchJson<{ data: UploadRecord[] }>(url, options).then((res) => res.data);
  },
  listReportJobs(options?: RequestOptions) {
    const url = buildUrl("/reports");
    return fetchJson<{ data: ReportJob[] }>(url, options).then((res) => res.data);
  },
  listAuditLogs(params: AuditLogQuery, options?: RequestOptions) {
    const url = buildUrl("/audit-logs", { ...params });
    return fetchJson<AuditLogResponse>(url, options);
  }
};
