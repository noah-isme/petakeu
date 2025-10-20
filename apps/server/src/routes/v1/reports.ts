import { Router } from "express";

import { reportController } from "../../controllers/report-controller";

export const reportRouter = Router();

reportRouter.post("/", reportController.enqueueReport);
