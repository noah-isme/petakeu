import { Request, Response } from "express";

import { isPublicRole } from "../middleware/auth";
import { geoService } from "../services/geo-service";
import { asyncHandler } from "../utils/async-handler";

const getChoropleth = asyncHandler(async (req: Request, res: Response) => {
  const period = (req.query.period as string) ?? "2025-08";
  // Role-based redaction is enforced server-side (fail-closed); `?public=1`
  // can only add redaction, never remove it.
  const publicMode = isPublicRole(req) || req.query.public === "1" || req.query.public === "true";
  const level = req.query.level ? Number(req.query.level) : undefined;
  const parent = req.query.parent ? String(req.query.parent) : undefined;
  const payload = await geoService.buildChoropleth(period, { publicMode, level, parent });
  res.json(payload);
});

export const geoController = {
  getChoropleth
};
