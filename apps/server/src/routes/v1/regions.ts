import { Router } from "express";

import { regionController } from "../../controllers/region-controller";

export const regionRouter = Router();

regionRouter.get("/", regionController.listRegions);
regionRouter.get("/:id/summary", regionController.getRegionSummary);
