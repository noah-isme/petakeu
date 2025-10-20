import express, { Express } from "express";
import cors from "cors";
import morgan from "morgan";
import helmet from "helmet";

import { registerRoutes } from "./routes";
import { errorHandler } from "./utils/error-handler";

export async function createApp(): Promise<Express> {
  const app = express();

  app.use(helmet({ crossOriginResourcePolicy: false }));
  app.use(cors());
  app.use(express.json({ limit: "5mb" }));
  app.use(express.urlencoded({ extended: true }));
  app.use(morgan("dev"));

  registerRoutes(app);

  app.use(errorHandler);

  return app;
}
