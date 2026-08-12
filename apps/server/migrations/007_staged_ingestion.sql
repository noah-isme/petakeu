-- Multi-stage ingestion, canonical region aliases, and source financial values.
-- This migration is additive.  The legacy `amount` column remains the gross
-- amount used by existing read models and clients.

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS gross_amount NUMERIC(18,2),
  ADD COLUMN IF NOT EXISTS share_amount NUMERIC(18,2),
  ADD COLUMN IF NOT EXISTS net_amount NUMERIC(18,2),
  ADD COLUMN IF NOT EXISTS target_amount NUMERIC(18,2),
  ADD COLUMN IF NOT EXISTS upload_id UUID NULL REFERENCES uploads(id) ON DELETE SET NULL;

UPDATE payments
   SET gross_amount = amount
 WHERE gross_amount IS NULL;

UPDATE payments
   SET share_amount = ROUND(amount * 0.15, 2)
 WHERE share_amount IS NULL;

UPDATE payments
   SET net_amount = ROUND(amount - COALESCE(share_amount, ROUND(amount * 0.15, 2)), 2)
 WHERE net_amount IS NULL;

ALTER TABLE payments
  ALTER COLUMN gross_amount SET NOT NULL,
  ALTER COLUMN share_amount SET NOT NULL,
  ALTER COLUMN net_amount SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_gross_amount_nonnegative_007') THEN
    ALTER TABLE payments ADD CONSTRAINT payments_gross_amount_nonnegative_007 CHECK (gross_amount >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_share_amount_nonnegative_007') THEN
    ALTER TABLE payments ADD CONSTRAINT payments_share_amount_nonnegative_007 CHECK (share_amount >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_net_amount_nonnegative_007') THEN
    ALTER TABLE payments ADD CONSTRAINT payments_net_amount_nonnegative_007 CHECK (net_amount >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_target_amount_nonnegative_007') THEN
    ALTER TABLE payments ADD CONSTRAINT payments_target_amount_nonnegative_007 CHECK (target_amount IS NULL OR target_amount >= 0);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS payments_upload_idx ON payments(upload_id);

DO $$
BEGIN
  ALTER TABLE uploads DROP CONSTRAINT IF EXISTS uploads_status_check;
EXCEPTION WHEN undefined_object THEN
  NULL;
END $$;

ALTER TABLE uploads
  ADD COLUMN IF NOT EXISTS created_by TEXT,
  ADD COLUMN IF NOT EXISTS confirmed_by TEXT,
  ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_by TEXT,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS committed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS row_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valid_row_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS warning_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE uploads
  ADD CONSTRAINT uploads_status_check_007
  CHECK (status IN (
    'queued', 'processing', 'parsing', 'parsed', 'awaiting_confirmation',
    'committing', 'persisted', 'failed', 'cancelled'
  ));

CREATE TABLE IF NOT EXISTS region_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alias TEXT NOT NULL,
  normalized_alias TEXT NOT NULL,
  region_id UUID NOT NULL REFERENCES regions(id) ON DELETE CASCADE,
  level SMALLINT NOT NULL CHECK (level BETWEEN 1 AND 4),
  parent_id UUID NULL REFERENCES regions(id) ON DELETE CASCADE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS region_aliases_scope_idx
  ON region_aliases(normalized_alias, level, COALESCE(parent_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE active;
CREATE INDEX IF NOT EXISTS region_aliases_region_idx ON region_aliases(region_id);
CREATE INDEX IF NOT EXISTS region_aliases_lookup_idx ON region_aliases(normalized_alias, level, parent_id) WHERE active;

CREATE TABLE IF NOT EXISTS staged_upload_rows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_id UUID NOT NULL REFERENCES uploads(id) ON DELETE CASCADE,
  row_number INTEGER NOT NULL CHECK (row_number > 0),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  raw_values JSONB NOT NULL DEFAULT '{}'::jsonb,
  province_raw TEXT,
  region_raw TEXT,
  code_bps_raw TEXT,
  source_raw TEXT,
  region_id UUID NULL REFERENCES regions(id) ON DELETE SET NULL,
  region_level SMALLINT,
  region_code TEXT,
  region_name TEXT,
  province_region_id UUID NULL REFERENCES regions(id) ON DELETE SET NULL,
  period DATE,
  gross_amount NUMERIC(18,2),
  share_amount NUMERIC(18,2),
  net_amount NUMERIC(18,2),
  target_amount NUMERIC(18,2),
  status TEXT NOT NULL DEFAULT 'invalid' CHECK (status IN ('valid', 'invalid', 'pending')),
  error_count INTEGER NOT NULL DEFAULT 0,
  warning_count INTEGER NOT NULL DEFAULT 0,
  acknowledged_warning_ids UUID[] NOT NULL DEFAULT ARRAY[]::uuid[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT staged_upload_rows_upload_row_unique UNIQUE(upload_id, row_number)
);

CREATE INDEX IF NOT EXISTS staged_upload_rows_upload_idx
  ON staged_upload_rows(upload_id, row_number);
CREATE INDEX IF NOT EXISTS staged_upload_rows_region_period_idx
  ON staged_upload_rows(region_id, period);

CREATE TABLE IF NOT EXISTS upload_validation_findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_id UUID NOT NULL REFERENCES uploads(id) ON DELETE RESTRICT,
  staged_row_id UUID NOT NULL REFERENCES staged_upload_rows(id) ON DELETE RESTRICT,
  revision INTEGER NOT NULL CHECK (revision > 0),
  severity TEXT NOT NULL CHECK (severity IN ('error', 'warning')),
  code TEXT NOT NULL,
  column_name TEXT,
  message TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS upload_validation_findings_row_idx
  ON upload_validation_findings(staged_row_id, revision, created_at);
CREATE INDEX IF NOT EXISTS upload_validation_findings_upload_idx
  ON upload_validation_findings(upload_id, severity);

CREATE OR REPLACE FUNCTION prevent_upload_validation_finding_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Upload validation findings are immutable'
    USING ERRCODE = 'triggered_data_change_violation';
END;
$$;

DROP TRIGGER IF EXISTS upload_validation_findings_immutable ON upload_validation_findings;
CREATE TRIGGER upload_validation_findings_immutable
  BEFORE UPDATE OR DELETE ON upload_validation_findings
  FOR EACH ROW EXECUTE FUNCTION prevent_upload_validation_finding_mutation();

-- A compatibility view makes the staged rows discoverable under the concise
-- `upload_rows` name used by API clients and operational SQL tooling.
CREATE OR REPLACE VIEW upload_rows AS SELECT * FROM staged_upload_rows;
