import express, { Express, Request, Response, NextFunction } from "express";
import cors from "cors";
import morgan from "morgan";
import helmet from "helmet";
import pinoHttp from "pino-http";

import { registerRoutes } from "./routes";
import { errorHandler } from "./utils/error-handler";
import { setupSwagger } from "./config/swagger";
import { logger } from "./utils/logger";
import { register, httpRequestsTotal, httpRequestDuration } from "./utils/metrics";
import { performHealthChecks, performReadinessChecks, performLivenessCheck } from "./utils/health";
import { loadEnv } from "./config/env";

const env = loadEnv();

export async function createApp(): Promise<Express> {
  const app = express();

  app.use(helmet({ crossOriginResourcePolicy: false }));
  app.use(cors());
  app.use(express.json({ limit: "5mb" }));
  app.use(express.urlencoded({ extended: true }));

  // Structured logging with pino-http
  app.use(pinoHttp({
    logger,
    customProps: (req: Request) => ({
      requestId: req.headers['x-request-id'] || req.id,
    }),
    customSuccessMessage: (req: Request, res: Response) => `${req.method} ${req.url} ${res.statusCode}`,
    customErrorMessage: (req: Request, res: Response, err: Error) => `${req.method} ${req.url} ${res.statusCode} - ${err.message}`,
  }));

  // Prometheus metrics middleware
  app.use((req: Request, res: Response, next: NextFunction) => {
    const start = process.hrtime.bigint();
    const route = req.route?.path || req.path;

    res.on('finish', () => {
      const durationSec = Number(process.hrtime.bigint() - start) / 1e9;
      httpRequestsTotal.inc({ method: req.method, route, status_code: res.statusCode });
      httpRequestDuration.observe({ method: req.method, route, status_code: res.statusCode }, durationSec);
    });

    next();
  });

  app.use(morgan("dev"));

  // Swagger API Documentation (only in non-production)
  if (process.env.NODE_ENV !== "production") {
    setupSwagger(app);
  }

  // Health & Readiness Endpoints
  app.get("/health", async (_req: Request, res: Response) => {
    const health = await performHealthChecks(env);
    const statusCode = health.status === 'healthy' ? 200 : health.status === 'degraded' ? 200 : 503;
    res.status(statusCode).json(health);
  });

  app.get("/healthz", async (_req: Request, res: Response) => {
    const health = await performHealthChecks(env);
    const statusCode = health.status === 'healthy' ? 200 : health.status === 'degraded' ? 200 : 503;
    res.status(statusCode).json(health);
  });

  app.get("/live", (_req: Request, res: Response) => {
    const liveness = performLivenessCheck();
    res.status(liveness.alive ? 200 : 500).json(liveness);
  });

  app.get("/ready", async (_req: Request, res: Response) => {
    const readiness = await performReadinessChecks(env);
    res.status(readiness.ready ? 200 : 503).json(readiness);
  });

  // Prometheus metrics endpoint
  app.get("/metrics", async (_req: Request, res: Response) => {
    try {
      res.set('Content-Type', register.contentType);
      res.end(await register.metrics());
    } catch (error) {
      res.status(500).end('Error generating metrics');
    }
  });

  registerRoutes(app);

  app.use(errorHandler);

  return app;
}