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

export const uploadParseErrorsTotal = new Counter({
  name: 'petakeu_upload_parse_errors_total',
  help: 'Total number of row or file parsing errors encountered during uploads',
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

export const geoJsonBytes = new Histogram({
  name: 'petakeu_geojson_bytes',
  help: 'Size in bytes of GeoJSON API responses',
  buckets: [1024, 10 * 1024, 50 * 1024, 100 * 1024, 500 * 1024, 1024 * 1024, 5 * 1024 * 1024],
  registers: [register]
});

export function normalizeReportFormat(value: unknown): 'pdf' | 'excel' | 'other' {
  return value === 'pdf' || value === 'excel' ? value : 'other';
}

export function normalizeDbQuery(query: unknown): {
  query_type: 'select' | 'insert' | 'update' | 'delete' | 'other';
  table: string;
} {
  const text = typeof query === 'string'
    ? query
    : typeof query === 'object' && query !== null && 'text' in query
      ? String((query as { text?: unknown }).text ?? '')
      : '';
  const normalized = text.trim().replace(/\s+/g, ' ').toUpperCase();
  const queryType = normalized.match(/^(SELECT|INSERT|UPDATE|DELETE)\b/)?.[1] ??
    (normalized.startsWith('WITH ') ? normalized.match(/\b(SELECT|INSERT|UPDATE|DELETE)\b/)?.[1] : undefined);
  const tableMatch = normalized.match(/\b(?:FROM|INTO|UPDATE|JOIN|TABLE)\s+([A-Z_][A-Z0-9_]*)/);
  const knownTables = new Set([
    'REGIONS',
    'PAYMENTS',
    'UPLOADS',
    'REPORT_JOBS',
    'AUDIT_LOGS',
    'MV_PAYMENTS_WITH_CUT',
    'REVENUE_TARGETS',
    'APPROVAL_WORKFLOWS',
    'APPROVAL_WORKFLOW_EVENTS',
    'FISCAL_PERIOD_LOCKS',
    'FISCAL_PERIOD_LOCK_EVENTS',
    '_MIGRATIONS',
  ]);
  const table = tableMatch && knownTables.has(tableMatch[1]) ? tableMatch[1].toLowerCase() : 'other';

  return {
    query_type: queryType === 'SELECT' || queryType === 'INSERT' || queryType === 'UPDATE' || queryType === 'DELETE'
      ? queryType.toLowerCase() as 'select' | 'insert' | 'update' | 'delete'
      : 'other',
    table,
  };
}
