import { Request, Response } from "express";

import { uploadService } from "../services/upload-service";
import { asyncHandler } from "../utils/async-handler";
import { AppError } from "../utils/app-error";

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

  res.status(202).json({
    uploadId: result.uploadId,
    status: result.status,
    hash: result.hash
  });
});

const listUploads = asyncHandler(async (_req: Request, res: Response) => {
  const uploads = uploadService.listUploads();
  res.json({ data: uploads });
});

const getUpload = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const record = uploadService.getUpload(id);
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
