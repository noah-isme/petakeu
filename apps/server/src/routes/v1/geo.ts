import { Router } from "express";

import { geoController } from "../../controllers/geo-controller";

export const geoRouter = Router();

geoRouter.get("/choropleth", geoController.getChoropleth);
