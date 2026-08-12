-- Persist the report-builder filters so queued/completed jobs retain the
-- same contract when they are listed after a process restart.

ALTER TABLE report_jobs
  ADD COLUMN IF NOT EXISTS period_from TEXT,
  ADD COLUMN IF NOT EXISTS period_to TEXT,
  ADD COLUMN IF NOT EXISTS province_ids TEXT[] NOT NULL DEFAULT ARRAY[]::text[],
  ADD COLUMN IF NOT EXISTS ranking_criterion TEXT NOT NULL DEFAULT 'total',
  ADD COLUMN IF NOT EXISTS amount_basis TEXT NOT NULL DEFAULT 'gross',
  ADD COLUMN IF NOT EXISTS report_type TEXT NOT NULL DEFAULT 'full';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'report_jobs_ranking_criterion_008') THEN
    ALTER TABLE report_jobs ADD CONSTRAINT report_jobs_ranking_criterion_008
      CHECK (ranking_criterion IN ('total', 'average_monthly', 'target_achievement', 'growth', 'surplus', 'deficit'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'report_jobs_amount_basis_008') THEN
    ALTER TABLE report_jobs ADD CONSTRAINT report_jobs_amount_basis_008
      CHECK (amount_basis IN ('gross', 'share', 'net'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'report_jobs_report_type_008') THEN
    ALTER TABLE report_jobs ADD CONSTRAINT report_jobs_report_type_008
      CHECK (report_type IN ('executive-summary', 'full', 'missing-data'));
  END IF;
END $$;
