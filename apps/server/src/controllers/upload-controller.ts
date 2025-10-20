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
    buffer: file.buffer
  });

  res.status(202).json(result);
});

export const uploadController = {
  handleUpload
};
