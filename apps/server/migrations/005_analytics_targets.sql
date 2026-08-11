-- Monthly revenue targets used by the Phase 2 analytics read model.
CREATE TABLE IF NOT EXISTS revenue_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  region_id UUID NOT NULL REFERENCES regions(id) ON DELETE CASCADE,
  period DATE NOT NULL,
  target NUMERIC(18,2) NOT NULL CHECK (target >= 0),
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT revenue_targets_period_month_check CHECK (period = date_trunc('month', period)::date),
  CONSTRAINT revenue_targets_region_period_unique UNIQUE (region_id, period)
);

CREATE INDEX IF NOT EXISTS revenue_targets_period_idx ON revenue_targets(period);
CREATE INDEX IF NOT EXISTS revenue_targets_region_period_idx ON revenue_targets(region_id, period);
