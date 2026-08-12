export type UploadStatus =
  | 'queued'
  | 'processing'
  | 'parsing'
  | 'parsed'
  | 'awaiting_confirmation'
  | 'committing'
  | 'persisted'
  | 'failed'
  | 'cancelled';

export type UploadFindingSeverity = 'error' | 'warning';

export interface UploadErrorDetail {
  id?: string;
  row: number;
  column: string;
  code?: string;
  severity?: UploadFindingSeverity;
  message: string;
  details?: Record<string, unknown>;
  acknowledged?: boolean;
}

export interface UploadSummary {
  totalRows: number;
  validRows: number;
  totalAmount: number;
  periodRange: {
    from?: string;
    to?: string;
  };
  errorCount?: number;
  warningCount?: number;
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
  storagePath?: string;
  errorCount: number;
  errorFilePath?: string;
  fileUrl?: string | null;
  summary?: UploadSummary;
  errors?: UploadErrorDetail[];
  createdBy?: string | null;
  confirmedBy?: string | null;
  confirmedAt?: string | null;
  cancelledBy?: string | null;
  cancelledAt?: string | null;
  committedAt?: string | null;
  rowCount?: number;
  validRowCount?: number;
  warningCount?: number;
}

export interface UploadRequest {
  filename: string;
  mimetype: string;
  buffer: Buffer;
  size: number;
  actorId?: string;
}

export interface UploadResult {
  uploadId: string;
  status: UploadStatus;
  hash: string;
}

export interface StagedUploadRow {
  id: string;
  rowId?: string;
  uploadId: string;
  rowNumber: number;
  revision: number;
  rawValues: Record<string, unknown>;
  provinceRaw?: string | null;
  province?: string | null;
  regionRaw?: string | null;
  codeBpsRaw?: string | null;
  sourceRaw?: string | null;
  source?: string | null;
  regionId?: string | null;
  regionLevel?: number | null;
  regionCode?: string | null;
  regionName?: string | null;
  provinceRegionId?: string | null;
  period?: string | null;
  grossAmount?: number | null;
  shareAmount?: number | null;
  netAmount?: number | null;
  targetAmount?: number | null;
  status: 'valid' | 'invalid' | 'pending';
  errorCount: number;
  warningCount: number;
  acknowledgedWarningIds: string[];
  findings: UploadErrorDetail[];
  createdAt: string;
  updatedAt: string;
}

export interface StagedRowPatch {
  province?: string | null;
  region?: string | null;
  codeBps?: string | null;
  source?: string | null;
  period?: string | null;
  grossAmount?: number | string | null;
  shareAmount?: number | string | null;
  netAmount?: number | string | null;
  targetAmount?: number | string | null;
  acknowledgedWarningIds?: string[];
}

export interface ConfirmUploadInput {
  acknowledgedWarningIds?: string[];
  acknowledgedFindingIds?: string[];
  acknowledgeWarnings?: boolean;
  overwriteConfirmed?: boolean;
}

export interface RegionAlias {
  id: string;
  aliasId?: string;
  alias: string;
  normalizedAlias: string;
  regionId: string;
  level: number;
  parentId?: string | null;
  active: boolean;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
  region?: {
    code: string;
    name: string;
  };
  regionName?: string;
}

export interface RegionAliasInput {
  alias: string;
  regionId: string;
}
