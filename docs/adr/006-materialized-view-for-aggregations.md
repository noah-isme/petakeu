# ADR-006: Materialized View for Payment Aggregations

## Status
Accepted

## Context
The choropleth map API (`GET /api/geo/choropleth`) needs to return aggregated payment data per region per period with quantile classification. Computing this on-the-fly from the raw `payments` table would be too slow for interactive map rendering, especially as data grows.

## Decision
Use a PostgreSQL materialized view (`mv_payments_with_cut`) that pre-computes:
- Monthly aggregates per region (`SUM(amount) GROUP BY region_id, period`)
- 15% cut and net amounts
- Quantile class index (0-4) per period
- Quantile bin boundaries for legend

Refresh the materialized view:
- **Concurrently** after successful upload parsing
- **Scheduled daily** at 02:00 WIB via cron
- **On-demand** via admin API for immediate updates

## Consequences

### Positive
- **Fast reads**: Choropleth query becomes simple indexed lookup (~10ms)
- **Consistent classification**: Quantiles computed once per period, same for all requests
- **Reduced DB load**: No aggregation at query time
- **Separation of concerns**: Write path (uploads) separate from read path (map)

### Negative
- **Stale data window**: Between upload and MV refresh, map shows old data
- **Refresh locking**: `REFRESH MATERIALIZED VIEW CONCURRENTLY` requires unique index, brief lock
- **Storage overhead**: Duplicate data (raw + aggregated)
- **Complexity**: Additional maintenance, monitoring

### Neutral
- MV refreshed via `refresh_mv_payments_with_cut()` function
- Unique index on `(region_id, period)` enables concurrent refresh
- Quantile bins stored as JSONB for legend API

## Alternatives Considered

### 1. On-the-fly Aggregation with Redis Cache
- **Pros**: Fresh data, flexible grouping
- **Cons**: Cache invalidation complexity, cold cache latency, Redis memory

### 2. Trigger-based Real-time Aggregation
- **Pros**: Always fresh
- **Cons**: Write overhead, trigger complexity, locking on payments table

### 3. Application-level Caching (Redis)
- **Pros**: Flexible, can cache full API responses
- **Cons**: Cache invalidation, memory usage, consistency issues

### 4. TimescaleDB Continuous Aggregates
- **Pros**: Automatic, real-time, built-in
- **Cons**: Additional extension, less control, PostgreSQL-only

## Related Decisions
- ADR-002: Quantile Classification (quantiles computed in MV)
- ADR-005: PostGIS (MV uses same DB)
- ADR-008: BullMQ (upload worker triggers refresh)

## Implementation Notes
```sql
-- Materialized view definition (from 001_init.sql)
CREATE MATERIALIZED VIEW mv_payments_with_cut AS
WITH aggregated AS (
  SELECT region_id, date_trunc('month', period)::date AS period, SUM(amount) AS amount
  FROM payments GROUP BY region_id, date_trunc('month', period)
),
quantiles AS (
  SELECT period, percentile_cont(ARRAY[0.2,0.4,0.6,0.8]) WITHIN GROUP (ORDER BY amount) AS buckets,
         MIN(amount) AS min_amount, MAX(amount) AS max_amount
  FROM aggregated GROUP BY period
),
classified AS (
  SELECT a.region_id, a.period, a.amount,
         NTILE(5) OVER (PARTITION BY a.period ORDER BY a.amount) - 1 AS class_index,
         COALESCE(q.buckets, ARRAY[0,0,0,0]) AS buckets, q.min_amount, q.max_amount
  FROM aggregated a LEFT JOIN quantiles q ON q.period = a.period
)
SELECT region_id, period, amount,
       amount * 0.15 AS cut_amount,
       amount - amount * 0.15 AS net_amount,
       class_index,
       jsonb_build_array(
         jsonb_build_object('index', 0, 'min', COALESCE(min_amount,0), 'max', (buckets)[1]),
         jsonb_build_object('index', 1, 'min', (buckets)[1], 'max', (buckets)[2]),
         jsonb_build_object('index', 2, 'min', (buckets)[2], 'max', (buckets)[3]),
         jsonb_build_object('index', 3, 'min', (buckets)[3], 'max', (buckets)[4]),
         jsonb_build_object('index', 4, 'min', (buckets)[4], 'max', COALESCE(max_amount,0))
       ) AS bins
FROM classified;

-- Unique index for concurrent refresh
CREATE UNIQUE INDEX mv_payments_with_cut_idx ON mv_payments_with_cut(region_id, period);

-- Refresh function
CREATE OR REPLACE FUNCTION refresh_mv_payments_with_cut() RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN REFRESH MATERIALIZED VIEW CONCURRENTLY mv_payments_with_cut; END; $$;
```

```typescript
// Trigger in upload worker after successful parse
await pgPool.query("SELECT refresh_mv_payments_with_cut()");
```