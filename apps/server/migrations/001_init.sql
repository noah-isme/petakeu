-- Enable PostGIS extension
CREATE EXTENSION IF NOT EXISTS postgis;

-- Regions table stores administrative boundaries
CREATE TABLE IF NOT EXISTS regions (
  id UUID PRIMARY KEY,
  code_bps TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  level SMALLINT NOT NULL CHECK (level BETWEEN 1 AND 4),
  parent_id UUID NULL REFERENCES regions(id) ON DELETE SET NULL,
  geom GEOMETRY(MultiPolygon, 4326) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS regions_level_idx ON regions(level);
CREATE INDEX IF NOT EXISTS regions_geom_idx ON regions USING GIST(geom);

-- Payments table stores raw upload results
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY,
  region_id UUID NOT NULL REFERENCES regions(id) ON DELETE CASCADE,
  period DATE NOT NULL,
  amount NUMERIC(18,2) NOT NULL CHECK (amount >= 0),
  source TEXT NOT NULL,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS payments_unique_period ON payments(region_id, period, source);
CREATE INDEX IF NOT EXISTS payments_period_idx ON payments(period);

-- Materialized view containing aggregate and quantile classing
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_payments_with_cut AS
WITH aggregated AS (
  SELECT
    region_id,
    date_trunc('month', period)::date AS period,
    SUM(amount) AS amount
  FROM payments
  GROUP BY region_id, date_trunc('month', period)
),
quantiles AS (
  SELECT
    period,
    percentile_cont(ARRAY[0.2, 0.4, 0.6, 0.8]) WITHIN GROUP (ORDER BY amount) AS buckets,
    MIN(amount) AS min_amount,
    MAX(amount) AS max_amount
  FROM aggregated
  GROUP BY period
),
classified AS (
  SELECT
    a.region_id,
    a.period,
    a.amount,
    NTILE(5) OVER (PARTITION BY a.period ORDER BY a.amount) - 1 AS class_index,
    COALESCE(q.buckets, ARRAY[0,0,0,0]) AS buckets,
    q.min_amount,
    q.max_amount
  FROM aggregated a
  LEFT JOIN quantiles q ON q.period = a.period
)
SELECT
  region_id,
  period,
  amount,
  amount * 0.15 AS cut_amount,
  amount - amount * 0.15 AS net_amount,
  class_index,
  jsonb_build_array(
    jsonb_build_object('index', 0, 'min', COALESCE(min_amount, 0), 'max', (buckets)[1]),
    jsonb_build_object('index', 1, 'min', (buckets)[1], 'max', (buckets)[2]),
    jsonb_build_object('index', 2, 'min', (buckets)[2], 'max', (buckets)[3]),
    jsonb_build_object('index', 3, 'min', (buckets)[3], 'max', (buckets)[4]),
    jsonb_build_object('index', 4, 'min', (buckets)[4], 'max', COALESCE(max_amount, 0))
  ) AS bins
FROM classified;

CREATE UNIQUE INDEX IF NOT EXISTS mv_payments_with_cut_idx ON mv_payments_with_cut(region_id, period);

-- Helper function to refresh materialized view
CREATE OR REPLACE FUNCTION refresh_mv_payments_with_cut()
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_payments_with_cut;
END;
$$;
