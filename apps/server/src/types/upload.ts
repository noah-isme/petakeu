export type UploadStatus = "queued" | "processing" | "parsed" | "failed";

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
  storagePath: string;
  errorCount: number;
  errorFilePath?: string;
  fileUrl?: string | null;
  summary?: UploadSummary;
  errors?: UploadErrorDetail[];
}

export interface UploadRequest {
  filename: string;
  mimetype: string;
  buffer: Buffer;
  size: number;
}

export interface UploadResult {
  uploadId: string;
  status: UploadStatus;
  hash: string;
}
