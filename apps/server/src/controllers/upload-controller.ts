import { Request, Response } from "express";

import { uploadService } from "../services/upload-service";
import { logAudit } from "../services/audit-service";
import { asyncHandler } from "../utils/async-handler";
import { AppError } from "../utils/app-error";
import { logger } from "../utils/logger";
import { uploadsTotal } from "../utils/metrics";

const handleUpload = asyncHandler(async (req: Request, res: Response) => {
  const file = req.file;
  if (!file) {
    throw new AppError("No file uploaded", 400);
  }

  const result = await uploadService.enqueueUpload({
    filename: file.originalname,
    mimetype: file.mimetype,
    buffer: file.buffer,
    size: file.size
  });

  uploadsTotal.inc({ status: 'queued' });
  logger.info({ uploadId: result.uploadId, filename: file.originalname, size: file.size }, 'Upload queued');

  const rawIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim();
  const ip = rawIp || req.socket.remoteAddress || req.ip || '';

  logAudit({
    event: 'upload.created',
    action: 'upload',
    endpoint: req.originalUrl || '/api/v1/uploads',
    method: 'POST',
    user_id: req.user?.sub,
    resource: 'upload',
    resource_id: result.uploadId,
    status_code: 202,
    ip_address: ip,
    user_agent: req.headers['user-agent'] || '',
    details: {
      filename: file.originalname,
      size: file.size,
      hash: result.hash,
    },
  }).catch(() => {});

  res.status(202).json({
    uploadId: result.uploadId,
    status: result.status,
    hash: result.hash
  });
});

const listUploads = asyncHandler(async (_req: Request, res: Response) => {
  const uploads = await uploadService.listUploads();
  res.json({ data: uploads });
});

const getUpload = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const record = await uploadService.getUpload(id);
  if (!record) {
    throw new AppError("Upload not found", 404);
  }

  res.json({ data: record });
});

export const uploadController = {
  handleUpload,
  listUploads,
  getUpload
};