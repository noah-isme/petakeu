import { Registry, Counter, Histogram, Gauge, collectDefaultMetrics } from 'prom-client';

export const register = new Registry();

collectDefaultMetrics({ register, prefix: 'petakeu_' });

export const httpRequestsTotal = new Counter({
  name: 'petakeu_http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register]
});

export const httpRequestDuration = new Histogram({
  name: 'petakeu_http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.2, 0.5, 1, 2, 5],
  registers: [register]
});

export const dbQueryDuration = new Histogram({
  name: 'petakeu_db_query_duration_seconds',
  help: 'Duration of database queries in seconds',
  labelNames: ['query_type', 'table'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1],
  registers: [register]
});

export const redisOperationDuration = new Histogram({
  name: 'petakeu_redis_operation_duration_seconds',
  help: 'Duration of Redis operations in seconds',
  labelNames: ['operation', 'key_type'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5],
  registers: [register]
});

export const workerJobsTotal = new Counter({
  name: 'petakeu_worker_jobs_total',
  help: 'Total number of worker jobs processed',
  labelNames: ['worker', 'status'],
  registers: [register]
});

export const workerJobDuration = new Histogram({
  name: 'petakeu_worker_job_duration_seconds',
  help: 'Duration of worker jobs in seconds',
  labelNames: ['worker', 'job_type'],
  buckets: [0.1, 0.5, 1, 5, 10, 30, 60, 300],
  registers: [register]
});

export const cacheHits = new Counter({
  name: 'petakeu_cache_hits_total',
  help: 'Total number of cache hits',
  labelNames: ['cache_type'],
  registers: [register]
});

export const cacheMisses = new Counter({
  name: 'petakeu_cache_misses_total',
  help: 'Total number of cache misses',
  labelNames: ['cache_type'],
  registers: [register]
});

export const activeConnections = new Gauge({
  name: 'petakeu_active_connections',
  help: 'Number of active connections',
  labelNames: ['type'],
  registers: [register]
});

export const uploadsTotal = new Counter({
  name: 'petakeu_uploads_total',
  help: 'Total number of uploads',
  labelNames: ['status'],
  registers: [register]
});

export const reportsTotal = new Counter({
  name: 'petakeu_reports_total',
  help: 'Total number of reports generated',
  labelNames: ['format', 'status'],
  registers: [register]
});

export const alertsSent = new Counter({
  name: 'petakeu_alerts_sent_total',
  help: 'Total number of alerts sent',
  labelNames: ['channel', 'level'],
  registers: [register]
});