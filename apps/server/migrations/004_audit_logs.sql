-- Audit Logs Table
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  event TEXT NOT NULL,
  request_id TEXT,
  user_id TEXT,
  action TEXT NOT NULL,
  resource TEXT,
  resource_id TEXT,
  endpoint TEXT NOT NULL,
  method TEXT NOT NULL,
  status_code INTEGER,
  ip_address TEXT,
  user_agent TEXT,
  details JSONB
);

CREATE INDEX IF NOT EXISTS audit_logs_timestamp_idx ON audit_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS audit_logs_user_id_idx ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS audit_logs_event_idx ON audit_logs(event);
CREATE INDEX IF NOT EXISTS audit_logs_resource_idx ON audit_logs(resource, resource_id);
