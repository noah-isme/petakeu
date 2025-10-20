import { Router } from "express";

import { regionRouter } from "./regions";
import { geoRouter } from "./geo";
import { uploadRouter } from "./uploads";
import { reportRouter } from "./reports";

export const apiRouter = Router();

apiRouter.use("/regions", regionRouter);
apiRouter.use("/geo", geoRouter);
apiRouter.use("/uploads", uploadRouter);
apiRouter.use("/reports", reportRouter);
