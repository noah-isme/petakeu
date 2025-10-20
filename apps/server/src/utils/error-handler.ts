import { NextFunction, Request, Response } from "express";
import multer from "multer";

import { AppError } from "./app-error";

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: err.message,
      details: err.details,
    });
    return;
  }

  if (err instanceof multer.MulterError) {
    const message =
      err.code === "LIMIT_FILE_SIZE"
        ? "Ukuran file melebihi batas 10MB"
        : "Format file tidak diizinkan";
    res.status(400).json({ error: message });
    return;
  }

  console.error("[petakeu] Unhandled error:", err);
  res.status(500).json({ error: "Internal Server Error" });
}
