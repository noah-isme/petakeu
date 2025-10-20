import { Router } from "express";

import { reportController } from "../../controllers/report-controller";

export const reportRouter = Router();

reportRouter.post("/export", reportController.enqueueReport);
reportRouter.get("/", reportController.listReports);
reportRouter.get("/:id", reportController.getReportById);
