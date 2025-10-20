import { Request, Response } from "express";

import { regionService } from "../services/region-service";
import { asyncHandler } from "../utils/async-handler";

const listRegions = asyncHandler(async (req: Request, res: Response) => {
  const { level, parent } = req.query as { level?: string; parent?: string };
  const regions = await regionService.listRegions({
    level: level === "province" || level === "regency" ? level : undefined,
    parent
  });

  res.json({
    data: regions,
    meta: {
      total: regions.length,
      page: 1,
      pageSize: regions.length,
      totalPages: 1
    }
  });
});

const getRegionSummary = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const { from, to } = req.query as { from?: string; to?: string };

  const summary = await regionService.getRegionSummary(id, { from, to });
  res.json(summary);
});

export const regionController = {
  listRegions,
  getRegionSummary
};
