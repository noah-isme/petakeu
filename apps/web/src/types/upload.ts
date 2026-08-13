/**
 * Upload lifecycle values used by both the legacy queue and staged review
 * workflow. Unknown values from an older deployment are normalized to the
 * closest supported state in the API adapter.
 */
export type UploadStatus =
  | "queued"
  | "processing"
  | "parsing"
  | "parsed"
  | "awaiting_confirmation"
  | "committing"
  | "persisted"
  | "confirmed"
  | "failed"
  | "cancelled";

export type ValidationSeverity = "error" | "warning" | "info";

export interface UploadValidationFinding {
  findingId: string;
  code?: string;
  severity: ValidationSeverity;
  column?: string | null;
  message: string;
  acknowledged?: boolean;
}

export interface StagedUploadRow {
  rowId: string;
  rowNumber: number;
  revision: number;
  regionId: string | null;
  regionCode: string | null;
  regionName: string | null;
  province: string | null;
  period: string | null;
  grossAmount: number | null;
  shareAmount: number | null;
  netAmount: number | null;
  targetAmount: number | null;
  source: string | null;
  findings: UploadValidationFinding[];
  rawValues?: Record<string, unknown>;
  warningAcknowledged?: boolean;
}

export interface UploadRowsMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface UploadRowsPage {
  data: StagedUploadRow[];
  meta: UploadRowsMeta;
}

export interface UploadRowPatch {
  revision?: number;
  regionCode?: string | null;
  regionName?: string | null;
  province?: string | null;
  period?: string | null;
  grossAmount?: number | null;
  shareAmount?: number | null;
  netAmount?: number | null;
  targetAmount?: number | null;
  source?: string | null;
}

export interface UploadConfirmationInput {
  /** IDs of warning findings explicitly checked by the operator. */
  acknowledgedWarningIds?: string[];
  acknowledgedFindingIds?: string[];
  acknowledgeWarnings?: boolean;
}

export interface UploadConfirmationResult {
  uploadId: string;
  status: UploadStatus;
  persistedRows?: number;
  overwrittenRows?: number;
}

export interface RegionAlias {
  aliasId: string;
  alias: string;
  normalizedAlias?: string;
  regionId: string;
  regionName?: string;
  provinceId?: string;
  provinceName?: string;
  active?: boolean;
}

export interface UploadErrorDetail {
  row: number;
  column: string;
  message: string;
}

export interface UploadSummary {
  totalRows: number;
  validRows: number;
  totalAmount: number;
  periodRange: {
    from?: string;
    to?: string;
  };
}

export interface UploadRecord {
  uploadId: string;
  filename: string;
  mimetype: string;
  size: number;
  status: UploadStatus;
  createdAt: string;
  updatedAt: string;
  hash: string;
  fileUrl: string | null;
  errorCount: number;
  errorFilePath?: string;
  summary?: UploadSummary;
  errors?: UploadErrorDetail[];
  warnings?: UploadValidationFinding[];
  totalRows?: number;
  stagedRows?: number;
  blockingErrorCount?: number;
  warningCount?: number;
}

export interface UploadCreated {
  uploadId: string;
  status: UploadStatus;
  hash: string;
}
