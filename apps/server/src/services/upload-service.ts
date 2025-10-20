import { randomUUID, createHash } from "node:crypto";
import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { UploadRequest, UploadResult } from "../types/upload";

const UPLOADS_DIR = path.resolve(process.cwd(), "uploads");

async function ensureUploadsDir() {
  try {
    await stat(UPLOADS_DIR);
  } catch {
    await mkdir(UPLOADS_DIR, { recursive: true });
  }
}

export async function enqueueUpload(file: UploadRequest): Promise<UploadResult> {
  await ensureUploadsDir();

  const hash = createHash("sha256").update(file.buffer).digest("hex");
  const filename = `${hash}-${file.filename}`;
  const filepath = path.join(UPLOADS_DIR, filename);
  await writeFile(filepath, file.buffer);

  // In a full implementation this would schedule a background job.
  return {
    uploadId: randomUUID(),
    status: "queued"
  };
}

export const uploadService = {
  enqueueUpload
};
