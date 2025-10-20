export interface UploadRequest {
  filename: string;
  mimetype: string;
  buffer: Buffer;
}

export interface UploadResult {
  uploadId: string;
  status: "queued" | "parsed" | "failed";
}
