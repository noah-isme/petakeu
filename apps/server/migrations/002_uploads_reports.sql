-- uploads table: tracks file uploads and their processing state
CREATE TABLE IF NOT EXISTS uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename TEXT NOT NULL,
  mimetype TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','processing','parsed','persisted','failed')),
  storage_path TEXT,
  file_url TEXT,
  error_count INTEGER NOT NULL DEFAULT 0,
  errors JSONB NOT NULL DEFAULT '[]'::jsonb,
  summary JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uploads_hash_idx ON uploads(hash);
CREATE INDEX IF NOT EXISTS uploads_status_idx ON uploads(status);
CREATE INDEX IF NOT EXISTS uploads_created_at_idx ON uploads(created_at DESC);

-- report_jobs table: tracks async report generation jobs
CREATE TABLE IF NOT EXISTS report_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period TEXT NOT NULL,
  region_ids TEXT[] NOT NULL,
  format TEXT NOT NULL CHECK (format IN ('pdf','excel')),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','processing','completed','failed')),
  download_url TEXT,
  error TEXT,
  summary JSONB,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '24 hours'
);

CREATE INDEX IF NOT EXISTS report_jobs_status_idx ON report_jobs(status);
CREATE INDEX IF NOT EXISTS report_jobs_requested_at_idx ON report_jobs(requested_at DESC);
