import { Express } from "express";

import { apiRouter } from "./v1";

export function registerRoutes(app: Express) {
  app.use("/api", apiRouter);
}
