import { Request, Response } from "express";

import { reportService } from "../services/report-service";
import { asyncHandler } from "../utils/async-handler";
import { AppError } from "../utils/app-error";
import { reportRequestSchema } from "../validators/report";

const enqueueReport = asyncHandler(async (req: Request, res: Response) => {
  const parseResult = reportRequestSchema.safeParse(req.body);
  if (!parseResult.success) {
    throw new AppError("Invalid report payload", 400, parseResult.error.flatten());
  }

  const job = await reportService.enqueueReport(parseResult.data);
  res.status(202).json(job);
});

export const reportController = {
  enqueueReport
};
