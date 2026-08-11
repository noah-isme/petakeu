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

export interface AuditLogFilters {
  userId?: string;
  event?: string;
  action?: string;
  resource?: string;
  from?: string;
  to?: string;
}

export interface AuditLogQuery extends AuditLogFilters {
  limit: number;
  offset: number;
}

export interface AuditLogResponse {
  data: AuditLogItem[];
  total: number;
}
