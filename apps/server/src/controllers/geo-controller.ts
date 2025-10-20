import { Request, Response } from "express";

import { geoService } from "../services/geo-service";
import { asyncHandler } from "../utils/async-handler";

const getChoropleth = asyncHandler(async (req: Request, res: Response) => {
  const period = (req.query.period as string) ?? "2025-08";
  const payload = await geoService.buildChoropleth(period);
  res.json(payload);
});

export const geoController = {
  getChoropleth
};
