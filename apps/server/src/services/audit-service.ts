import { getPgPool } from '../db/postgres';
import { logger } from '../utils/logger';

export interface AuditEntryInput {
  event: string;
  action: string;
  endpoint: string;
  method: string;
  user_id?: string;
  request_id?: string;
  resource?: string;
  resource_id?: string;
  status_code?: number;
  ip_address?: string;
  user_agent?: string;
  details?: Record<string, unknown>;
}

export interface AuditLogItem {
  id: string;
  timestamp: string;
  event: string;
  request_id: string | null;
  user_id: string | null;
  action: string;
  resource: string | null;
  resource_id: string | null;
  endpoint: string;
  method: string;
  status_code: number | null;
  ip_address: string | null;
  user_agent: string | null;
  details: Record<string, unknown> | null;
}

export interface AuditLogQueryParams {
  userId?: string;
  event?: string;
  action?: string;
  resource?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

export async function logAudit(entry: AuditEntryInput): Promise<void> {
  try {
    const pool = getPgPool();
    const sql = `
      INSERT INTO audit_logs (
        event, action, endpoint, method, user_id, request_id,
        resource, resource_id, status_code, ip_address, user_agent, details
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
    `;
    await pool.query(sql, [
      entry.event,
      entry.action,
      entry.endpoint,
      entry.method,
      entry.user_id ?? null,
      entry.request_id ?? null,
      entry.resource ?? null,
      entry.resource_id ?? null,
      entry.status_code ?? null,
      entry.ip_address ?? null,
      entry.user_agent ?? null,
      entry.details ? JSON.stringify(entry.details) : null,
    ]);
  } catch (err) {
    logger.error({ err, entry }, '[audit] Failed to write audit log');
  }
}

export async function getAuditLogs(params: AuditLogQueryParams = {}): Promise<{ data: AuditLogItem[]; total: number }> {
  const pool = getPgPool();
  const conditions: string[] = [];
  const values: (string | number)[] = [];
  let idx = 1;

  if (params.userId) {
    conditions.push(`user_id = $${idx++}`);
    values.push(params.userId);
  }
  if (params.event) {
    conditions.push(`event = $${idx++}`);
    values.push(params.event);
  }
  if (params.action) {
    conditions.push(`action = $${idx++}`);
    values.push(params.action);
  }
  if (params.resource) {
    conditions.push(`resource = $${idx++}`);
    values.push(params.resource);
  }
  if (params.from) {
    conditions.push(`timestamp >= $${idx++}`);
    values.push(params.from);
  }
  if (params.to) {
    conditions.push(`timestamp <= $${idx++}`);
    values.push(params.to);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countSql = `SELECT COUNT(*) AS total FROM audit_logs ${whereClause}`;
  const countRes = await pool.query(countSql, values);
  const total = Number(countRes.rows[0]?.total ?? 0);

  const limit = params.limit ?? 50;
  const offset = params.offset ?? 0;

  const dataSql = `
    SELECT
      id::text,
      to_char(timestamp, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS timestamp,
      event,
      request_id,
      user_id,
      action,
      resource,
      resource_id,
      endpoint,
      method,
      status_code,
      ip_address,
      user_agent,
      details
    FROM audit_logs
    ${whereClause}
    ORDER BY timestamp DESC
    LIMIT $${idx++} OFFSET $${idx++}
  `;
  const { rows } = await pool.query(dataSql, [...values, limit, offset]);

  return {
    data: rows as AuditLogItem[],
    total,
  };
}

export const auditService = { logAudit, getAuditLogs };
