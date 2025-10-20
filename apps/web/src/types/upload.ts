export type UploadStatus = "queued" | "processing" | "parsed" | "failed";

export interface UploadErrorDetail {
  row: number;
  column: string;
  message: string;
}

export interface UploadRecord {
  uploadId: string;
  filename: string;
  status: UploadStatus;
  errorCount: number;
  createdAt: string;
  fileUrl: string | null;
  errors?: UploadErrorDetail[];
}

export interface UploadCreated {
  uploadId: string;
  status: UploadStatus;
}
