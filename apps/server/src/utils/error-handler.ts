import { NextFunction, Request, Response } from "express";

import { AppError } from "./app-error";

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: err.message,
      details: err.details,
    });
    return;
  }

  console.error("[petakeu] Unhandled error:", err);
  res.status(500).json({ error: "Internal Server Error" });
}
