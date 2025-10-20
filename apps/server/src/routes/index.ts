import { Express } from "express";

import { apiRouter } from "./v1";

export function registerRoutes(app: Express) {
  app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok", service: "petakeu-api" });
  });

  app.use("/api", apiRouter);
}
