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
  res.status(201).json({ data: job });
});

const listReports = asyncHandler(async (_req: Request, res: Response) => {
  const jobs = reportService.listReports();
  res.json({ data: jobs });
});

const getReportById = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const job = reportService.getReport(id);
  if (!job) {
    throw new AppError("Report job not found", 404);
  }

  res.json({ data: job });
});

export const reportController = {
  enqueueReport,
  listReports,
  getReportById
};
