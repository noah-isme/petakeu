# Migration & Upgrade Guide

Complete guide for migrating Petakeu between versions, upgrading infrastructure, and handling schema changes.

---

## Version History

| Version | Date | Type | Description |
|---------|------|------|-------------|
| 1.0.0 | 2025-10-16 | Initial | Base schema, MSW frontend, stub backend |
| 1.1.0 | 2026-08-03 | Minor | Real DB integration, BullMQ workers, MinIO storage, JWT auth, FiscalView/RankFin/DefisitWatch APIs, 34-province seed data |
| 1.2.0 | TBD | Minor | Users/roles table, audit log, Redis cache for choropleth |
| 2.0.0 | TBD | Major | Breaking API changes, district/village drill-down |

---

## Upgrade Procedures

### 1.0.0 → 1.1.0 (Adding Auth & Real Backend)

#### Pre-Upgrade Checklist
- [ ] Backup production database
- [ ] Backup MinIO/S3 data
- [ ] Verify SSO configuration ready
- [ ] Review new environment variables
- [ ] Test in staging environment

#### Database Migration

```bash
# 1. Apply new migration
psql "$DATABASE_URL" -f apps/server/migrations/002_auth_tables.sql

# 2. Verify migration
psql "$DATABASE_URL" -c "\dt"
psql "$DATABASE_URL" -c "SELECT * FROM users LIMIT 5;"
psql "$DATABASE_URL" -c "SELECT * FROM audit_log LIMIT 5;"

# 3. Create initial admin user
psql "$DATABASE_URL" -c "
INSERT INTO users (id, email, password_hash, full_name, roles, is_active)
VALUES (
  gen_random_uuid(),
  'admin@petakeu.go.id',
  '\$2b\$12\$...',  -- bcrypt hash of initial password
  'System Administrator',
  ARRAY['admin'],
  true
);
"
```

#### Code Deployment

```bash
# 1. Build new images
docker compose -f docker-compose.prod.yml build

# 2. Deploy with rolling update
docker compose -f docker-compose.prod.yml up -d --no-deps api
sleep 15
docker compose -f docker-compose.prod.yml up -d --no-deps web

# 3. Verify
curl https://api.petakeu.go.id/health
curl https://petakeu.go.id/health
```

#### Post-Upgrade Verification
- [ ] Login with SSO works
- [ ] Upload flow works end-to-end
- [ ] Report generation works
- [ ] Audit logs being created
- [ ] RBAC enforced correctly

---

### 1.1.0 → 1.2.0 (Payment Table Partitioning)

#### Background
As payment data grows, partitioning by period improves query performance and maintenance.

#### Migration Steps

```bash
# 1. Create partitioned table (run during maintenance window)
psql "$DATABASE_URL" -f apps/server/migrations/003_partition_payments.sql

# 2. Migration script (zero-downtime approach)
# See migration script below

# 3. Update application config if needed
# No code changes required - transparent to application

# 4. Verify partitioning
psql "$DATABASE_URL" -c "
SELECT schemaname, tablename, pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename))
FROM pg_tables
WHERE tablename LIKE 'payments%';
"
```

#### Partition Migration Script (003_partition_payments.sql)

```sql
-- Create partitioned table
CREATE TABLE payments_partitioned (
  LIKE payments INCLUDING ALL
) PARTITION BY RANGE (period);

-- Create partitions for each year
CREATE TABLE payments_2024 PARTITION OF payments_partitioned
  FOR VALUES FROM ('2024-01-01') TO ('2025-01-01');

CREATE TABLE payments_2025 PARTITION OF payments_partitioned
  FOR VALUES FROM ('2025-01-01') TO ('2026-01-01');

CREATE TABLE payments_2026 PARTITION OF payments_partitioned
  FOR VALUES FROM ('2026-01-01') TO ('2027-01-01');

-- Default partition for any unmatched data
CREATE TABLE payments_default PARTITION OF payments_partitioned DEFAULT;

-- Migrate data in batches (run during low traffic)
-- This can take time for large datasets
INSERT INTO payments_partitioned SELECT * FROM payments;

-- Swap tables (requires brief lock)
BEGIN;
  ALTER TABLE payments RENAME TO payments_old;
  ALTER TABLE payments_partitioned RENAME TO payments;
COMMIT;

-- Recreate indexes on partitioned table
CREATE UNIQUE INDEX payments_unique_period ON payments (region_id, period, source);
CREATE INDEX payments_period_idx ON payments (period);

-- Update materialized view to use new table
REFRESH MATERIALIZED VIEW CONCURRENTLY mv_payments_with_cut;

-- Verify
SELECT COUNT(*) FROM payments;
SELECT COUNT(*) FROM payments_old;
-- Counts should match

-- Drop old table after verification period (1 week)
-- DROP TABLE payments_old;
```

---

### 1.2.0 → 2.0.0 (Major Version - Breaking Changes)

#### Planned Breaking Changes
- API v2 with new endpoint structure
- WebSocket support for real-time updates
- New report formats
- Changed authentication flow

#### Migration Strategy
1. Run v1 and v2 APIs in parallel
2. Feature flag for frontend to switch
3. Gradual traffic migration
4. Deprecate v1 after 3 months

---

## Infrastructure Upgrades

### PostgreSQL Version Upgrade

```bash
# For managed services (RDS, Cloud SQL)
# Use provider's upgrade procedure

# For self-hosted
# 1. pg_dump
pg_dump -h old-host -U petakeu petakeu > backup.sql

# 2. Provision new PostgreSQL 17 with PostGIS 3.5
# 3. Restore
psql -h new-host -U petakeu petakeu < backup.sql

# 4. Update DATABASE_URL
# 5. Test thoroughly
# 6. Switch traffic
```

### Redis Version Upgrade

```bash
# Redis upgrade is typically backward compatible
# 1. Provision new Redis 8 instance
# 2. Configure replication from old to new
# 3. Promote new instance
# 4. Update REDIS_URL
# 5. Verify queues work
```

### MinIO Version Upgrade

```bash
# 1. Deploy new MinIO version alongside
# 2. Use mc mirror to replicate
mc mirror old-minio/petakeu-uploads new-minio/petakeu-uploads

# 3. Update STORAGE_ENDPOINT
# 4. Verify uploads/downloads
```

---

## Data Migration Patterns

### Adding a New Column (Non-Breaking)

```sql
-- 1. Add column with default (fast in PG 11+)
ALTER TABLE regions ADD COLUMN is_active BOOLEAN DEFAULT true;

-- 2. Backfill if needed (for non-default values)
UPDATE regions SET is_active = false WHERE level = 4;

-- 3. Add constraint if needed
ALTER TABLE regions ALTER COLUMN is_active SET NOT NULL;
```

### Changing Column Type

```sql
-- For type changes requiring rewrite
-- 1. Add new column
ALTER TABLE payments ADD COLUMN amount_new NUMERIC(20,4);

-- 2. Backfill in batches
UPDATE payments SET amount_new = amount::NUMERIC(20,4);

-- 3. Swap (requires lock)
BEGIN;
  ALTER TABLE payments RENAME COLUMN amount TO amount_old;
  ALTER TABLE payments RENAME COLUMN amount_new TO amount;
COMMIT;

-- 4. Drop old column after verification
ALTER TABLE payments DROP COLUMN amount_old;
```

### Renaming a Table/Column

```sql
-- Use migration script with transaction
BEGIN;
  ALTER TABLE uploads RENAME TO upload_records;
  ALTER INDEX uploads_pkey RENAME TO upload_records_pkey;
  -- Update foreign keys if any
  -- Update application code references
COMMIT;
```

### Data Backfill Pattern

```sql
-- For large backfills, use batches to avoid locks
DO $$
DECLARE
  batch_size INTEGER := 10000;
  last_id UUID := '00000000-0000-0000-0000-000000000000';
  affected INTEGER;
BEGIN
  LOOP
    UPDATE payments
    SET meta = meta || jsonb_build_object('backfilled', true)
    WHERE id > last_id
    AND meta ? 'backfilled' IS FALSE
    ORDER BY id
    LIMIT batch_size;
    
    GET DIAGNOSTICS affected = ROW_COUNT;
    EXIT WHEN affected = 0;
    
    SELECT max(id) INTO last_id FROM payments WHERE id > last_id;
    
    -- Small delay to reduce load
    PERFORM pg_sleep(0.1);
  END LOOP;
END $$;
```

---

## Rollback Procedures

### Database Rollback

```bash
# For failed migration
# 1. Stop application
docker compose -f docker-compose.prod.yml stop api

# 2. Restore from backup
psql "$DATABASE_URL" < backup_before_migration.sql

# 3. Refresh materialized view
psql "$DATABASE_URL" -c "SELECT refresh_mv_payments_with_cut();"

# 4. Restart application
docker compose -f docker-compose.prod.yml start api
```

### Application Rollback

```bash
# Quick rollback to previous image
docker compose -f docker-compose.prod.yml pull petakeu/server:v1.1.0
docker compose -f docker-compose.prod.yml up -d --no-deps api

# Or via GitHub Actions
gh workflow run deploy-production.yml -f version=v1.1.0 -f confirm=DEPLOY
```

### Full System Rollback

```bash
# 1. Database
psql "$DATABASE_URL" < backup_$(date -d '1 day ago' +%Y%m%d).sql

# 2. Application
# Deploy known good version
gh workflow run deploy-production.yml -f version=v1.0.0 -f confirm=DEPLOY

# 3. Verify
curl https://api.petakeu.go.id/health
curl https://petakeu.go.id/health
```

---

## Zero-Downtime Deployment Checklist

### Pre-Deployment
- [ ] All migrations are backward compatible
- [ ] No breaking API changes in this release
- [ ] Feature flags for new functionality
- [ ] Database migration tested in staging
- [ ] Load test passed with new version

### During Deployment
- [ ] Use rolling updates (not recreate)
- [ ] Health checks passing before traffic switch
- [ ] Monitor error rates during rollout
- [ ] Keep old version running for 10 min after switch

### Post-Deployment
- [ ] Verify all endpoints functional
- [ ] Check error rates < 0.1%
- [ ] Verify choropleth loads
- [ ] Test upload flow
- [ ] Test report generation
- [ ] Monitor for 30 minutes

---

## Disaster Recovery

### Recovery Point Objectives (RPO)

| Data Type | RPO | Backup Frequency |
|-----------|-----|------------------|
| PostgreSQL | 1 hour | Continuous (WAL) + Daily pg_dump |
| Redis | 5 min | AOF every 1 sec |
| MinIO | 0 (versioned) | Cross-region replication |
| Application Code | N/A | Git (every commit) |

### Recovery Time Objectives (RTO)

| Scenario | RTO | Procedure |
|----------|-----|-----------|
| Single service down | 5 min | Auto-restart / health check |
| Database primary down | 15 min | Failover to replica |
| Region outage | 1 hour | DNS failover to DR region |
| Data corruption | 4 hours | Restore from backup |
| Complete loss | 8 hours | Full rebuild from backups |

### Backup Verification

```bash
# Weekly backup verification (automated)
#!/bin/bash
# verify-backup.sh

BACKUP_FILE="s3://petakeu-backups/postgres/backup_$(date -d '1 day ago' +%Y%m%d).sql"

# 1. Download backup
aws s3 cp "$BACKUP_FILE" /tmp/verify_backup.sql

# 2. Create test database
psql -c "CREATE DATABASE petakeu_verify;"

# 3. Restore
psql petakeu_verify < /tmp/verify_backup.sql

# 4. Verify key tables
psql petakeu_verify -c "SELECT COUNT(*) FROM regions;"
psql petakeu_verify -c "SELECT COUNT(*) FROM payments WHERE period >= '2025-01-01';"
psql petakeu_verify -c "SELECT refresh_mv_payments_with_cut();"

# 5. Cleanup
psql -c "DROP DATABASE petakeu_verify;"
```

---

## Upgrade Checklist Template

```
# Upgrade Checklist: vX.Y.Z → vX.Y.(Z+1)

## Pre-Upgrade
- [ ] Review release notes and breaking changes
- [ ] Update dependencies (check for vulnerabilities)
- [ ] Run full test suite locally
- [ ] Deploy to staging environment
- [ ] Run integration tests in staging
- [ ] Run E2E tests in staging
- [ ] Performance test in staging
- [ ] Backup production database
- [ ] Backup MinIO data
- [ ] Notify stakeholders of maintenance window

## Migration
- [ ] Apply database migrations
- [ ] Verify migration success
- [ ] Seed any required reference data
- [ ] Update environment variables
- [ ] Deploy application (rolling update)
- [ ] Run smoke tests

## Post-Upgrade
- [ ] Verify all endpoints functional
- [ ] Check error rates (< 0.1%)
- [ ] Verify choropleth loads correctly
- [ ] Test upload flow end-to-end
- [ ] Test report generation
- [ ] Verify authentication/authorization
- [ ] Check monitoring dashboards
- [ ] Verify audit logs being created
- [ ] Update documentation if needed
- [ ] Close maintenance window

## Rollback Plan
- [ ] Database rollback tested
- [ ] Application rollback tested
- [ ] Rollback decision criteria defined
- [ ] Communication plan for rollback

## Sign-off
- [ ] Developer: _______________
- [ ] QA: _______________
- [ ] Operations: _______________
- [ ] Product Owner: _______________
```

---

## References

- [Database Schema](./database-schema.md)
- [Deployment Guide](./deployment-guide.md)
- [MSW to Backend Migration](./msw-to-backend-migration.md)
- [PostgreSQL Partitioning](https://www.postgresql.org/docs/current/ddl-partitioning.html)
- [Zero-Downtime Migrations](https://www.percona.com/blog/zero-downtime-schema-changes-in-postgresql/)