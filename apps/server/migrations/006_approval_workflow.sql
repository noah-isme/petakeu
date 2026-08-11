-- Phase 3 governance: upload approvals and fiscal-period locks.

CREATE TABLE IF NOT EXISTS approval_workflows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_id UUID NOT NULL REFERENCES uploads(id) ON DELETE RESTRICT,
  period DATE NULL CHECK (period IS NULL OR period = date_trunc('month', period)::date),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'under_review', 'approved', 'published')),
  submitted_by TEXT,
  submitted_at TIMESTAMPTZ,
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  review_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  published_by TEXT,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS approval_workflows_upload_idx
  ON approval_workflows(upload_id);
CREATE INDEX IF NOT EXISTS approval_workflows_status_idx
  ON approval_workflows(status);
CREATE INDEX IF NOT EXISTS approval_workflows_period_idx
  ON approval_workflows(period);

-- Append-only transition history preserves who changed a workflow and why.
CREATE TABLE IF NOT EXISTS approval_workflow_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES approval_workflows(id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL CHECK (event_type IN ('submit', 'review', 'approve', 'publish')),
  from_status TEXT CHECK (
    from_status IS NULL OR from_status IN ('draft', 'under_review', 'approved', 'published')
  ),
  to_status TEXT NOT NULL CHECK (to_status IN ('draft', 'under_review', 'approved', 'published')),
  actor_id TEXT NOT NULL,
  actor_role TEXT NOT NULL CHECK (actor_role IN ('public', 'viewer', 'operator', 'admin')),
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS approval_workflow_events_workflow_idx
  ON approval_workflow_events(workflow_id, created_at);
CREATE INDEX IF NOT EXISTS approval_workflow_events_actor_idx
  ON approval_workflow_events(actor_id, created_at DESC);

-- Active locks live here. Unlocking removes the active row but retains an
-- append-only event below, so the lock history remains auditable.
CREATE TABLE IF NOT EXISTS fiscal_period_locks (
  period DATE PRIMARY KEY CHECK (period = date_trunc('month', period)::date),
  locked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_by TEXT NOT NULL,
  reason TEXT
);

CREATE INDEX IF NOT EXISTS fiscal_period_locks_locked_at_idx
  ON fiscal_period_locks(locked_at DESC);

CREATE TABLE IF NOT EXISTS fiscal_period_lock_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period DATE NOT NULL CHECK (period = date_trunc('month', period)::date),
  event_type TEXT NOT NULL CHECK (event_type IN ('locked', 'unlocked')),
  actor_id TEXT NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS fiscal_period_lock_events_period_idx
  ON fiscal_period_lock_events(period, created_at DESC);

CREATE OR REPLACE FUNCTION assert_fiscal_period_unlocked(p_period DATE)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_period IS NULL THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM fiscal_period_locks
     WHERE period = date_trunc('month', p_period)::date
  ) THEN
    RAISE EXCEPTION 'Fiscal period % is locked', to_char(p_period, 'YYYY-MM')
      USING ERRCODE = 'check_violation';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION prevent_locked_payment_write()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM assert_fiscal_period_unlocked(NEW.period);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS payments_fiscal_period_lock ON payments;
CREATE TRIGGER payments_fiscal_period_lock
  BEFORE INSERT OR UPDATE OF region_id, period, amount, source, meta ON payments
  FOR EACH ROW EXECUTE FUNCTION prevent_locked_payment_write();

CREATE OR REPLACE FUNCTION prevent_locked_report_write()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM assert_fiscal_period_unlocked((NEW.period || '-01')::date);
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'report_jobs_period_format_006'
  ) THEN
    ALTER TABLE report_jobs
      ADD CONSTRAINT report_jobs_period_format_006
      CHECK (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS report_jobs_fiscal_period_lock ON report_jobs;
CREATE TRIGGER report_jobs_fiscal_period_lock
  BEFORE INSERT OR UPDATE OF period, region_ids, format ON report_jobs
  FOR EACH ROW EXECUTE FUNCTION prevent_locked_report_write();

CREATE OR REPLACE FUNCTION prevent_locked_approval_write()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM assert_fiscal_period_unlocked(NEW.period);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION prevent_locked_target_write()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM assert_fiscal_period_unlocked(NEW.period);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS revenue_targets_fiscal_period_lock ON revenue_targets;
CREATE TRIGGER revenue_targets_fiscal_period_lock
  BEFORE INSERT OR UPDATE OF region_id, period, target ON revenue_targets
  FOR EACH ROW EXECUTE FUNCTION prevent_locked_target_write();

DROP TRIGGER IF EXISTS approval_workflows_fiscal_period_lock ON approval_workflows;
CREATE TRIGGER approval_workflows_fiscal_period_lock
  BEFORE INSERT OR UPDATE OF upload_id, period, status, submitted_by, submitted_at,
    reviewed_by, reviewed_at, review_notes, review_metadata, approved_by, approved_at,
    published_by, published_at ON approval_workflows
  FOR EACH ROW EXECUTE FUNCTION prevent_locked_approval_write();

CREATE OR REPLACE FUNCTION enforce_approval_status_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
    (OLD.status = 'draft' AND NEW.status = 'under_review') OR
    (OLD.status = 'under_review' AND NEW.status = 'approved') OR
    (OLD.status = 'approved' AND NEW.status = 'published')
  ) THEN
    RAISE EXCEPTION 'Invalid approval transition from % to %', OLD.status, NEW.status
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS approval_workflows_status_transition ON approval_workflows;
CREATE TRIGGER approval_workflows_status_transition
  BEFORE UPDATE OF status ON approval_workflows
  FOR EACH ROW EXECUTE FUNCTION enforce_approval_status_transition();

CREATE OR REPLACE FUNCTION prevent_approval_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Approval workflow events are immutable'
    USING ERRCODE = 'triggered_data_change_violation';
END;
$$;

DROP TRIGGER IF EXISTS approval_workflow_events_immutable ON approval_workflow_events;
CREATE TRIGGER approval_workflow_events_immutable
  BEFORE UPDATE OR DELETE ON approval_workflow_events
  FOR EACH ROW EXECUTE FUNCTION prevent_approval_event_mutation();

DROP TRIGGER IF EXISTS fiscal_period_lock_events_immutable ON fiscal_period_lock_events;
CREATE TRIGGER fiscal_period_lock_events_immutable
  BEFORE UPDATE OR DELETE ON fiscal_period_lock_events
  FOR EACH ROW EXECUTE FUNCTION prevent_approval_event_mutation();
