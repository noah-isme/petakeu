import { Request, Response } from "express";

import { geoService } from "../services/geo-service";
import { asyncHandler } from "../utils/async-handler";

const getChoropleth = asyncHandler(async (req: Request, res: Response) => {
  const period = (req.query.period as string) ?? "2025-08";
  const publicMode = req.query.public === "1" || req.query.public === "true";
  const payload = await geoService.buildChoropleth(period, { publicMode });
  res.json(payload);
});

export const geoController = {
  getChoropleth
};
