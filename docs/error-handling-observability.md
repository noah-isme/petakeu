# Error Handling & Observability Documentation

Comprehensive guide for error handling, logging, metrics, tracing, and alerting in Petakeu.

---

## Error Handling Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Error Handling Flow                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Request → Controller → Service → Database/External             │
│    │           │           │            │                        │
│    │           │           │            ▼                        │
│    │           │           │    ┌─────────────┐                 │
│    │           │           │    │   Errors    │                 │
│    │           │           │    │  (AppError, │                 │
│    │           │           │    │   PGError,  │                 │
│    │           │           │    │   ZodError) │                 │
│    │           │           │    └──────┬──────┘                 │
│    │           │           │           │                        │
│    ▼           ▼           ▼           ▼                        │
│  ┌─────────────────────────────────────────────┐               │
│  │           Global Error Handler              │               │
│  │  (apps/server/src/utils/error-handler.ts)  │               │
│  └─────────────────────────────────────────────┘               │
│    │                        │                        │          │
│    ▼                        ▼                        ▼          │
│  AppError              MulterError              Unknown        │
│  (4xx, known)          (file upload)           (500)           │
│    │                        │                        │          │
│    ▼                        ▼                        ▼          │
│  JSON Response        JSON Response           JSON Response   │
│  {error, details}     {error}                  {error}        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Error Types & Standards

### HTTP Status Codes

| Code | Category | Usage |
|------|----------|-------|
| 200 | Success | GET, PUT, PATCH successful |
| 201 | Created | POST successful (new resource) |
| 202 | Accepted | Async job queued (upload, report) |
| 204 | No Content | DELETE successful |
| 400 | Bad Request | Validation errors (Zod, malformed JSON) |
| 401 | Unauthorized | Missing/invalid auth token |
| 403 | Forbidden | Valid token, insufficient permissions |
| 404 | Not Found | Resource doesn't exist |
| 409 | Conflict | Duplicate upload, version conflict |
| 413 | Payload Too Large | File > 10MB |
| 415 | Unsupported Media Type | Wrong file type (not .xlsx) |
| 422 | Unprocessable Entity | Semantic validation errors |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Unexpected errors, DB connection failure |
| 503 | Service Unavailable | Downstream service down (Redis, MinIO) |

### Error Response Format

```typescript
// Standard error response
interface ErrorResponse {
  error: string;           // Human-readable message
  details?: unknown;       // Optional: validation details, stack trace (dev only)
  requestId?: string;      // Correlation ID for tracing
  timestamp: string;       // ISO 8601
  path: string;            // Request path
}

// Example responses
// 400 Validation Error
{
  "error": "Invalid request payload",
  "details": {
    "fieldErrors": [
      { "field": "period", "message": "Invalid format, expected YYYY-MM" },
      { "field": "regionId", "message": "Must be a valid UUID" }
    ]
  },
  "requestId": "req-abc123",
  "timestamp": "2025-08-03T10:30:00.000Z",
  "path": "/api/reports/export"
}

// 404 Not Found
{
  "error": "Region not found",
  "requestId": "req-def456",
  "timestamp": "2025-08-03T10:30:01.000Z",
  "path": "/api/regions/invalid-id/summary"
}

// 500 Internal Error (production - no stack trace)
{
  "error": "Internal Server Error",
  "requestId": "req-ghi789",
  "timestamp": "2025-08-03T10:30:02.000Z",
  "path": "/api/geo/choropleth"
}
```

---

## Application Error Classes

### AppError (Custom)

```typescript
// apps/server/src/utils/app-error.ts
export class AppError extends Error {
  readonly statusCode: number;
  readonly details?: unknown;
  readonly code?: string;        // Machine-readable error code
  readonly requestId?: string;   // For correlation

  constructor(
    message: string,
    statusCode = 500,
    details?: unknown,
    code?: string
  ) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    this.code = code;
    Object.setPrototypeOf(this, AppError.prototype);
  }

  // Factory methods for common errors
  static badRequest(message: string, details?: unknown) {
    return new AppError(message, 400, details, "BAD_REQUEST");
  }

  static unauthorized(message = "Unauthorized") {
    return new AppError(message, 401, undefined, "UNAUTHORIZED");
  }

  static forbidden(message = "Forbidden") {
    return new AppError(message, 403, undefined, "FORBIDDEN");
  }

  static notFound(resource: string) {
    return new AppError(`${resource} not found`, 404, undefined, "NOT_FOUND");
  }

  static conflict(message: string, details?: unknown) {
    return new AppError(message, 409, details, "CONFLICT");
  }

  static tooManyRequests(message = "Too many requests") {
    return new AppError(message, 429, undefined, "RATE_LIMITED");
  }

  static internal(message = "Internal Server Error", details?: unknown) {
    return new AppError(message, 500, details, "INTERNAL_ERROR");
  }
}
```

### Domain-Specific Errors

```typescript
// apps/server/src/utils/domain-errors.ts
export class ValidationError extends AppError {
  constructor(details: ZodError) {
    super("Validation failed", 400, details.flatten(), "VALIDATION_ERROR");
  }
}

export class DatabaseError extends AppError {
  constructor(message: string, cause: Error) {
    super(message, 500, { cause: cause.message }, "DATABASE_ERROR");
  }
}

export class ExternalServiceError extends AppError {
  constructor(service: string, cause: Error) {
    super(`${service} unavailable`, 503, { service, cause: cause.message }, "EXTERNAL_SERVICE_ERROR");
  }
}

export class FileProcessingError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 422, details, "FILE_PROCESSING_ERROR");
  }
}
```

---

## Global Error Handler

```typescript
// apps/server/src/utils/error-handler.ts
import { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import multer from "multer";
import { AppError, ValidationError, DatabaseError } from "./app-error";
import { logger } from "./logger";

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  const requestId = req.headers["x-request-id"] as string || generateRequestId();
  
  // Log error with context
  const logContext = {
    requestId,
    method: req.method,
    path: req.path,
    query: req.query,
    body: sanitizeBody(req.body),
    userAgent: req.get("user-agent"),
    ip: req.ip,
  };

  // Handle known error types
  if (err instanceof AppError) {
    logger.warn({ ...logContext, error: err.message, code: err.code, statusCode: err.statusCode }, "Application error");
    return res.status(err.statusCode).json({
      error: err.message,
      details: err.details,
      code: err.code,
      requestId,
      timestamp: new Date().toISOString(),
      path: req.path,
    });
  }

  if (err instanceof ZodError) {
    const validationError = new ValidationError(err);
    logger.warn({ ...logContext, details: validationError.details }, "Validation error");
    return res.status(400).json({
      error: "Validation failed",
      details: validationError.details,
      code: "VALIDATION_ERROR",
      requestId,
      timestamp: new Date().toISOString(),
      path: req.path,
    });
  }

  if (err instanceof multer.MulterError) {
    const message = err.code === "LIMIT_FILE_SIZE" 
      ? "File size exceeds 10MB limit" 
      : "Invalid file upload";
    logger.warn({ ...logContext, multerCode: err.code }, "Multer error");
    return res.status(400).json({
      error: message,
      code: "UPLOAD_ERROR",
      requestId,
      timestamp: new Date().toISOString(),
      path: req.path,
    });
  }

  // PostgreSQL errors
  if (err instanceof Error && "code" in err) {
    const pgError = err as { code: string; detail?: string };
    let statusCode = 500;
    let message = "Database error";
    let code = "DATABASE_ERROR";

    switch (pgError.code) {
      case "23505": // unique_violation
        statusCode = 409;
        message = "Duplicate entry";
        code = "DUPLICATE_ENTRY";
        break;
      case "23503": // foreign_key_violation
        statusCode = 400;
        message = "Referenced resource does not exist";
        code = "FOREIGN_KEY_VIOLATION";
        break;
      case "23514": // check_violation
        statusCode = 400;
        message = "Data violates constraint";
        code = "CHECK_VIOLATION";
        break;
      case "42P01": // undefined_table
        message = "Database schema error";
        code = "SCHEMA_ERROR";
        break;
    }

    const dbError = new DatabaseError(message, err);
    logger.error({ ...logContext, pgCode: pgError.code, pgDetail: pgError.detail }, "Database error");
    return res.status(statusCode).json({
      error: message,
      code,
      requestId,
      timestamp: new Date().toISOString(),
      path: req.path,
    });
  }

  // Unknown errors
  logger.error({ ...logContext, error: err instanceof Error ? err.stack : String(err) }, "Unhandled error");
  return res.status(500).json({
    error: process.env.NODE_ENV === "production" ? "Internal Server Error" : (err instanceof Error ? err.message : "Unknown error"),
    code: "INTERNAL_ERROR",
    requestId,
    timestamp: new Date().toISOString(),
    path: req.path,
  });
}

function generateRequestId(): string {
  return `req-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function sanitizeBody(body: unknown): unknown {
  if (!body || typeof body !== "object") return body;
  const sanitized = { ...body } as Record<string, unknown>;
  // Remove sensitive fields
  delete sanitized.password;
  delete sanitized.token;
  delete sanitized.secret;
  delete sanitized.authorization;
  return sanitized;
}
```

---

## Structured Logging

### Logger Configuration

```typescript
// apps/server/src/utils/logger.ts
import pino from "pino";
import { config } from "../config/env";

const isProduction = config.env?.NODE_ENV === "production";

export const logger = pino({
  level: config.env?.LOG_LEVEL || (isProduction ? "info" : "debug"),
  formatters: {
    level: (label) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  base: {
    service: "petakeu-api",
    version: process.env.npm_package_version || "0.1.0",
    environment: config.env?.NODE_ENV || "development",
    hostname: process.env.HOSTNAME,
  },
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "req.body.password",
      "req.body.token",
      "req.body.secret",
      "*.password",
      "*.token",
      "*.secret",
      "*.authorization",
    ],
    censor: "[REDACTED]",
  },
  transport: isProduction ? undefined : {
    target: "pino-pretty",
    options: { colorize: true, translateTime: "SYS:standard" },
  },
});

// Child loggers for modules
export function createModuleLogger(module: string) {
  return logger.child({ module });
}
```

### Log Levels & Usage

| Level | Usage | Example |
|-------|-------|---------|
| `trace` | Very detailed debugging | SQL queries, cache keys |
| `debug` | Development debugging | Request/response bodies |
| `info` | General operational info | Request started, job queued |
| `warn` | Recoverable issues | Validation errors, rate limits |
| `error` | Failures requiring attention | DB errors, external service down |
| `fatal` | System unusable | Startup failure, config missing |

### Log Context Standards

Every log entry should include:
```typescript
{
  requestId: "req-abc123",      // Correlation ID
  module: "upload-service",     // Source module
  userId?: "user-123",          // If authenticated
  regionId?: "region-3374",     // If region-scoped
  action: "upload.parse",       // Action being performed
  durationMs?: 1250,            // For performance logs
}
```

---

## Metrics & Monitoring

### Key Metrics to Collect

#### API Metrics (RED Method)

| Metric | Description | Target |
|--------|-------------|--------|
| **Rate** | Requests per second | - |
| **Errors** | Error rate (5xx / total) | < 0.1% |
| **Duration** | Latency p50, p95, p99 | p95 < 300ms (cached) |

#### Business Metrics

| Metric | Description | Target |
|--------|-------------|--------|
| `upload.success` | Successful uploads | > 99% |
| `upload.failed` | Failed uploads | < 1% |
| `upload.duplicate` | Duplicate uploads | - |
| `report.generated` | Reports completed | - |
| `report.failed` | Report generation failures | < 1% |
| `choropleth.cache_hit` | Cache hit rate | > 90% |
| `choropleth.latency` | Query latency | p95 < 300ms |

#### System Metrics

| Metric | Description | Alert Threshold |
|--------|-------------|-----------------|
| `db.connections.active` | Active DB connections | > 80% of pool |
| `db.query.duration` | Query latency | p95 > 1s |
| `redis.memory.used` | Redis memory usage | > 80% |
| `redis.connected_clients` | Connected clients | > 1000 |
| `queue.jobs.pending` | Pending background jobs | > 100 |
| `queue.jobs.failed` | Failed jobs (last hour) | > 10 |

### Metrics Implementation (Prometheus)

```typescript
// apps/server/src/utils/metrics.ts
import { Counter, Histogram, Gauge, Registry } from "prom-client";

export const register = new Registry();
register.setDefaultLabels({ service: "petakeu-api" });

// Collect default metrics
import { collectDefaultMetrics } from "prom-client";
collectDefaultMetrics({ register, prefix: "petakeu_" });

// Custom metrics
export const httpRequestsTotal = new Counter({
  name: "petakeu_http_requests_total",
  help: "Total HTTP requests",
  labelNames: ["method", "path", "status_code"],
  registers: [register],
});

export const httpRequestDuration = new Histogram({
  name: "petakeu_http_request_duration_seconds",
  help: "HTTP request latency in seconds",
  labelNames: ["method", "path"],
  buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5],
  registers: [register],
});

export const uploadTotal = new Counter({
  name: "petakeu_upload_total",
  help: "Total uploads",
  labelNames: ["status"],
  registers: [register],
});

export const reportTotal = new Counter({
  name: "petakeu_report_total",
  help: "Total reports generated",
  labelNames: ["format", "status"],
  registers: [register],
});

export const choroplethCacheHit = new Counter({
  name: "petakeu_choropleth_cache_hit_total",
  help: "Choropleth cache hits",
  labelNames: ["hit"],
  registers: [register],
});

export const activeJobs = new Gauge({
  name: "petakeu_active_jobs",
  help: "Currently processing jobs",
  labelNames: ["type"],
  registers: [register],
});

export const dbConnections = new Gauge({
  name: "petakeu_db_connections_active",
  help: "Active database connections",
  registers: [register],
});
```

### Metrics Middleware

```typescript
// apps/server/src/middleware/metrics.ts
import { Request, Response, NextFunction } from "express";
import { httpRequestsTotal, httpRequestDuration } from "../utils/metrics";

export function metricsMiddleware(req: Request, res: Response, next: NextFunction) {
  const start = process.hrtime.bigint();
  const path = req.route?.path || req.path;

  res.on("finish", () => {
    const duration = Number(process.hrtime.bigint() - start) / 1e9;
    httpRequestsTotal.inc({ method: req.method, path, status_code: res.statusCode });
    httpRequestDuration.observe({ method: req.method, path }, duration);
  });

  next();
}
```

---

## Distributed Tracing (OpenTelemetry)

### Setup

```typescript
// apps/server/src/utils/tracing.ts
import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { JaegerExporter } from "@opentelemetry/exporter-jaeger";
import { Resource } from "@opentelemetry/resources";
import { SemanticResourceAttributes } from "@opentelemetry/semantic-conventions";

const sdk = new NodeSDK({
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: "petakeu-api",
    [SemanticResourceAttributes.SERVICE_VERSION]: process.env.npm_package_version || "0.1.0",
    [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: process.env.NODE_ENV || "development",
  }),
  traceExporter: new JaegerExporter({
    endpoint: process.env.JAEGER_ENDPOINT || "http://localhost:14268/api/traces",
  }),
  instrumentations: [getNodeAutoInstrumentations()],
});

sdk.start();

process.on("SIGTERM", () => {
  sdk.shutdown().catch(console.error);
});

export { sdk };
```

### Manual Span Creation

```typescript
// In services
import { trace, SpanStatusCode } from "@opentelemetry/api";

const tracer = trace.getTracer("petakeu-api");

export async function processUpload(uploadId: string) {
  return tracer.startActiveSpan("upload.process", async (span) => {
    try {
      span.setAttribute("upload.id", uploadId);
      
      // Parse file
      const parseSpan = tracer.startSpan("upload.parse");
      const data = await parseFile(uploadId);
      parseSpan.end();
      
      // Validate
      const validateSpan = tracer.startSpan("upload.validate");
      const result = await validateData(data);
      validateSpan.end();
      
      // Store
      const storeSpan = tracer.startSpan("upload.store");
      await storePayments(result);
      storeSpan.end();
      
      span.setStatus({ code: SpanStatusCode.OK });
    } catch (error) {
      span.recordException(error as Error);
      span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
      throw error;
    } finally {
      span.end();
    }
  });
}
```

---

## Alerting Rules

### Prometheus Alerting Rules

```yaml
# alerts/petakeu.yml
groups:
  - name: petakeu-api
    interval: 30s
    rules:
      # High error rate
      - alert: HighErrorRate
        expr: |
          sum(rate(petakeu_http_requests_total{status_code=~"5.."}[5m]))
          /
          sum(rate(petakeu_http_requests_total[5m]))
          > 0.01
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "High error rate on Petakeu API"
          description: "Error rate > 1% for 5 minutes"

      # High latency
      - alert: HighLatency
        expr: |
          histogram_quantile(0.95, 
            sum(rate(petakeu_http_request_duration_seconds_bucket[5m])) by (le, method, path)
          ) > 1
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High latency on {{ $labels.method }} {{ $labels.path }}"
          description: "p95 latency > 1s for 5 minutes"

      # Upload failures
      - alert: UploadFailuresHigh
        expr: |
          sum(rate(petakeu_upload_total{status="failed"}[15m]))
          /
          sum(rate(petakeu_upload_total[15m]))
          > 0.05
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "High upload failure rate"
          description: "Upload failure rate > 5%"

      # Report generation failures
      - alert: ReportGenerationFailures
        expr: |
          sum(rate(petakeu_report_total{status="failed"}[15m])) > 0
        for: 2m
        labels:
          severity: warning
        annotations:
          summary: "Report generation failing"
          description: "Reports failing to generate"

      # Choropleth cache miss rate
      - alert: ChoroplethCacheMissRateHigh
        expr: |
          sum(rate(petakeu_choropleth_cache_hit_total{hit="false"}[5m]))
          /
          sum(rate(petakeu_choropleth_cache_hit_total[5m]))
          > 0.5
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "Choropleth cache miss rate high"
          description: "Cache miss rate > 50%, check MV refresh"

      # Database connections
      - alert: DatabaseConnectionsHigh
        expr: petakeu_db_connections_active > 80
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Database connections high"
          description: "Active connections > 80"

      # Redis memory
      - alert: RedisMemoryHigh
        expr: (redis_memory_used_bytes / redis_memory_max_bytes) > 0.85
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Redis memory usage high"
          description: "Redis memory > 85%"

      # Queue backlog
      - alert: QueueBacklogHigh
        expr: petakeu_active_jobs{type="upload-processing"} > 50
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: "Upload queue backlog"
          description: "More than 50 uploads pending"

      # Dead letter queue
      - alert: DeadLetterQueueNotEmpty
        expr: petakeu_queue_dead_letter_total > 0
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Dead letter queue has messages"
          description: "Jobs moved to DLQ, investigate immediately"
```

### Alert Notification Channels

| Severity | Channels | Escalation |
|----------|----------|------------|
| `critical` | PagerDuty, Slack #critical-alerts, SMS on-call | Page immediately, escalate in 15 min |
| `warning` | Slack #warnings, Email | Notify in 5 min, escalate in 1 hour |
| `info` | Slack #info | Log only |

---

## Health Checks

### API Health Endpoints

```typescript
// apps/server/src/routes/v1/health.ts
import { Router, Request, Response } from "express";
import { pgPool } from "../../db/postgres";
import { redis } from "../../db/redis";
import { checkMinio } from "../../services/storage";

export const healthRouter = Router();

// Liveness probe (k8s)
healthRouter.get("/live", (_req: Request, res: Response) => {
  res.json({ status: "alive", timestamp: new Date().toISOString() });
});

// Readiness probe (k8s)
healthRouter.get("/ready", async (_req: Request, res: Response) => {
  const checks = await Promise.allSettled([
    pgPool.query("SELECT 1").then(() => ({ db: "ok" })),
    redis.ping().then(() => ({ redis: "ok" })),
    checkMinio().then(() => ({ minio: "ok" })),
  ]);

  const results = checks.map((c, i) => {
    const names = ["db", "redis", "minio"];
    return c.status === "fulfilled" ? c.value : { [names[i]]: "failed", error: c.reason?.message };
  });

  const allHealthy = results.every((r) => Object.values(r)[0] === "ok");
  
  res.status(allHealthy ? 200 : 503).json({
    status: allHealthy ? "ready" : "not ready",
    checks: Object.assign({}, ...results),
    timestamp: new Date().toISOString(),
  });
});

// Detailed health (internal monitoring)
healthRouter.get("/health", async (req: Request, res: Response) => {
  const [dbStats, redisInfo, queueStats] = await Promise.all([
    getDbStats(),
    redis.info("memory"),
    getQueueStats(),
  ]);

  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version,
    uptime: process.uptime(),
    database: dbStats,
    redis: { memory: redisInfo },
    queues: queueStats,
  });
});
```

---

## Log Aggregation & Analysis

### ELK/EFK Stack

```yaml
# docker-compose.logging.yml
version: "3.9"
services:
  elasticsearch:
    image: docker.elastic.co/elasticsearch/elasticsearch:8.11.0
    environment:
      - discovery.type=single-node
      - xpack.security.enabled=false
    ports: ["9200:9200"]
    volumes: [es-data:/usr/share/elasticsearch/data]

  fluent-bit:
    image: fluent/fluent-bit:2.2
    volumes:
      - ./fluent-bit.conf:/fluent-bit/etc/fluent-bit.conf
      - /var/log/containers:/var/log/containers:ro
    depends_on: [elasticsearch]

  kibana:
    image: docker.elastic.co/kibana/kibana:8.11.0
    ports: ["5601:5601"]
    environment:
      ELASTICSEARCH_HOSTS: http://elasticsearch:9200
    depends_on: [elasticsearch]

volumes:
  es-data:
```

### Fluent Bit Config

```ini
# fluent-bit.conf
[SERVICE]
    Flush         5
    Log_Level     info
    Daemon        off
    Parsers_File  parsers.conf

[INPUT]
    Name              tail
    Path              /var/log/containers/*.log
    Parser            docker
    Tag               kube.*
    Refresh_Interval  10

[FILTER]
    Name                kubernetes
    Match               kube.*
    Kube_URL            https://kubernetes.default.svc:443
    Kube_CA_File        /var/run/secrets/kubernetes.io/serviceaccount/ca.crt
    Kube_Token_File     /var/run/secrets/kubernetes.io/serviceaccount/token
    Kube_Tag_Prefix     kube.var.log.containers.
    Merge_Log           On
    Merge_Log_Key       log_processed
    K8S-Logging.Parser  On
    K8S-Logging.Exclude On

[OUTPUT]
    Name            es
    Match           *
    Host            elasticsearch
    Port            9200
    Index           petakeu-logs
    Type            _doc
    Logstash_Format On
    Logstash_Prefix petakeu
    Retry_Limit     False
```

---

## Runbooks

### Common Incident Runbooks

| Incident | Runbook Link |
|----------|--------------|
| High API error rate | `/runbooks/high-error-rate.md` |
| Choropleth not loading | `/runbooks/choropleth-failures.md` |
| Upload stuck in processing | `/runbooks/upload-stuck.md` |
| Report generation timeout | `/runbooks/report-timeout.md` |
| Database connection pool exhausted | `/runbooks/db-pool-exhausted.md` |
| Redis memory pressure | `/runbooks/redis-memory.md` |
| MV refresh failed | `/runbooks/mv-refresh-failed.md` |

### Example Runbook: High Error Rate

```markdown
# Runbook: High API Error Rate

## Symptoms
- Alert: HighErrorRate firing
- Increased 5xx responses in Grafana
- User reports of failed operations

## Diagnosis Steps
1. Check error breakdown by endpoint:
   ```promql
   sum by (path, status_code) (rate(petakeu_http_requests_total{status_code=~"5.."}[5m]))
   ```

2. Check recent logs for error patterns:
   ```bash
   kubectl logs -l app=petakeu-api --since=10m | grep "ERROR" | jq -r '.error' | sort | uniq -c | sort -rn
   ```

3. Check downstream dependencies:
   - Database: `pg_stat_activity` for long queries
   - Redis: `INFO memory`, `CLIENT LIST`
   - MinIO: Health endpoint

## Resolution
| Cause | Action |
|-------|--------|
| DB connection pool exhausted | Increase pool size, kill long queries |
| Redis OOM | Restart Redis, check for memory leaks |
| MinIO down | Failover to replica, check disk space |
| Code regression | Rollback to previous version |

## Post-Incident
- Create incident record
- Add regression test if code bug
- Update runbook if new failure mode
```

---

## Current Petakeu Implementation

The production paths currently used by the application are:

- Structured Pino logs are emitted by `apps/server/src/utils/logger.ts`. `request-context.ts` propagates a bounded `X-Request-Id` and enriches request/worker logs with `request_id`, `user_id`, `region_code`, `period`, and `duration_ms` where available.
- Prometheus metrics are exposed at `GET /metrics`. HTTP, database, Redis, cache, worker, upload parsing, report, and GeoJSON metrics are defined in `apps/server/src/utils/metrics.ts`.
- OpenTelemetry auto-instrumentation is configured in `apps/server/src/utils/tracing.ts` for HTTP/Express, `pg`, Redis, and worker-side Node operations. It starts only outside test mode and shuts down during graceful termination.
- Deployable alert rules live in `monitoring/prometheus-rules.yml`; the importable Grafana dashboard is `monitoring/grafana-dashboard.json`.
- `/healthz`, `/ready`, and `/live` are registered by `apps/server/src/server.ts`. Readiness checks cover Postgres/PostGIS, Redis, object storage, and BullMQ queues.

Prometheus and Grafana deployment, an OTLP collector/exporter endpoint, and notification receivers remain environment-level configuration responsibilities.

## References

- [OpenTelemetry Documentation](https://opentelemetry.io/docs/)
- [Prometheus Best Practices](https://prometheus.io/docs/practices/naming/)
- [Grafana Alerting](https://grafana.com/docs/grafana/latest/alerting/)
- [Pino Logger](https://getpino.io/)
- [Structured Logging](https://www.cncf.io/blog/2021/04/01/structured-logging-best-practices/)
- [RED Method](https://www.weave.works/blog/the-red-method-key-metrics-for-microservices-architecture/)
- [USE Method](https://www.brendangregg.com/usemethod.html)
