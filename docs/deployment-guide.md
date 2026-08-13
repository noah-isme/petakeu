# Production Deployment Guide

Complete guide for deploying Petakeu to production environments.

---

## Architecture Overview

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Users     │────▶│   Nginx     │────▶│   Web App   │
│  (Browser)  │     │  (Port 80)  │     │  (Static)   │
└─────────────┘     └─────────────┘     └─────────────┘
                           │
                           ▼
                    ┌─────────────┐
                    │  API Server │
                    │ (Port 4000) │
                    └──────┬──────┘
           ┌──────────────┼──────────────┐
           ▼              ▼              ▼
    ┌────────────┐ ┌────────────┐ ┌────────────┐
    │ PostgreSQL │ │   Redis    │ │   MinIO    │
    │ + PostGIS  │ │  (Cache)   │ │  (Storage) │
    └────────────┘ └────────────┘ └────────────┘
```

---

## Server Startup Sequence

Pada startup, server melakukan langkah berikut secara berurutan (lihat `src/index.ts`):

1. **DB Migrations** — `src/db/migrate.ts` menjalankan file SQL yang belum diterapkan dari folder `migrations/`. Jika gagal, server berhenti (`process.exit(1)`).
2. **MinIO Bucket Init** — Membuat bucket `uploads` dan `reports` jika belum ada. Kegagalan non-fatal (server tetap berjalan).
3. **BullMQ Workers** — Menjalankan `upload-worker` (queue `upload-processing`, concurrency 2) dan `report-worker` (queue `report-generation`, concurrency 1), keduanya terhubung ke `REDIS_URL`.
4. **MV Refresh Cron** — Menjadwalkan refresh `mv_payments_with_cut` setiap 15 menit via `node-cron`.
5. **HTTP Server** — Express mendengarkan di port `PORT` (default 4000).

Graceful shutdown menangani `SIGTERM`/`SIGINT`: menutup workers BullMQ, koneksi PostgreSQL, dan Redis sebelum proses berakhir.

> [!IMPORTANT]
> Pastikan `AUTH_DISABLED=false` tidak di-set di production. Set `AUTH_SECRET` ke string acak minimal 32 karakter: `openssl rand -base64 32`

## R4 Staging Release Verification

Before enabling staged upload confirmation or promoting the R4 candidate, use
the [R4 staging release verification runbook](r4-staging-release-verification.md).
It covers the sequential migration runner (`007_staged_ingestion.sql` and
`008_report_filters.sql`), backup and isolated restore evidence, health and
readiness, Redis/BullMQ/MinIO checks, live integration/RBAC/performance suites,
the upload confirmation/cancellation workflow, and application rollback.

The read-only preflight can be run from the repository root after staging
variables are loaded:

```bash
R4_API_URL="https://api.staging.example" \
  node scripts/verify-r4-staging.mjs --phase baseline --json
```

The production Compose file passes `UPLOAD_REQUIRE_CONFIRMATION`,
`STORAGE_REPORTS_BUCKET`, and `AUTH_DISABLED` to the API service. Provide
non-empty staging/production values through the deployment secret or
configuration layer and verify them inside the API container before
proceeding.

---

## Inisialisasi Data (Seeding)

Setelah database pertama kali berjalan, seed data wilayah Indonesia:

```bash
cd apps/server
pnpm seed:regions
```

Script ini memasukkan:
- 34 provinsi dengan kode BPS resmi (level 1)
- 58+ kabupaten/kota dengan kode BPS resmi (level 2)
- Seluruh 24 kabupaten/kota Sulawesi Selatan (termasuk Kota Makassar, kode 7371)
- Geometri `MULTIPOLYGON` PostGIS dari bounding box untuk setiap wilayah

Script bersifat idempoten (`ON CONFLICT DO UPDATE`) — aman dijalankan berulang kali.

---

## Prerequisites

### Infrastructure Requirements

| Component | Minimum Specs | Recommended |
|-----------|---------------|-------------|
| CPU | 2 vCPU | 4 vCPU |
| RAM | 4 GB | 8 GB |
| Storage | 50 GB SSD | 100 GB SSD |
| Network | 1 Gbps | 10 Gbps |

### External Dependencies

- **Domain name** with SSL certificate (Let's Encrypt or purchased)
- **PostgreSQL 16+** with PostGIS 3.4+ (managed service recommended: RDS, Cloud SQL)
- **Redis 7+** (managed service recommended: ElastiCache, Memorystore)
- **Object Storage** (MinIO self-hosted, AWS S3, GCS, or compatible)

---

## Environment Setup

### 1. Prepare Environment Files

```bash
# Server
cp apps/server/.env.example apps/server/.env.production
# Edit with production values

# Web
cp apps/web/.env.example apps/web/.env.production
# Edit with production values
```

### 2. Required Production Variables

**Server (`.env.production`):**
```env
NODE_ENV=production
PORT=4000
DATABASE_URL=postgresql://user:pass@host:5432/petakeu?sslmode=require
REDIS_URL=redis://host:6379
STORAGE_BUCKET=petakeu-uploads
STORAGE_ENDPOINT=https://s3.region.amazonaws.com
STORAGE_ACCESS_KEY=your-access-key
STORAGE_SECRET_KEY=your-secret-key
STORAGE_REGION=us-east-1
AUTH_SECRET=your-32-char-secret-from-openssl
CORS_ORIGIN=https://petakeu.go.id
LOG_LEVEL=info
```

**Web (`.env.production`):**
```env
VITE_API_BASE_URL=https://api.petakeu.go.id/api
VITE_PUBLIC_MODE=false
```

### 3. Generate Secure Secrets

```bash
# JWT secret (32+ chars)
openssl rand -base64 32

# Database password
openssl rand -base64 24

# MinIO credentials
openssl rand -base64 24
```

---

## Deployment Methods

### Method 1: Docker Compose (Single VM)

Best for: Small deployments, staging, simple production

```bash
# 1. Copy production env
cp .env.example .env.prod

# 2. Edit with your values
vim .env.prod

# 3. Deploy
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build

# 4. Verify
docker compose -f docker-compose.prod.yml ps
curl http://localhost/health
curl http://localhost:4000/health
```

### Method 2: Kubernetes (Production Scale)

Best for: High availability, auto-scaling, enterprise

**Key manifests needed:**
- `Deployment` for api, web
- `Service` for internal load balancing
- `Ingress` for external access with TLS
- `ConfigMap` / `Secret` for configuration
- `PersistentVolumeClaim` for PostgreSQL, Redis, MinIO
- `HorizontalPodAutoscaler` for api/web

Example `api-deployment.yaml`:
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: petakeu-api
spec:
  replicas: 3
  selector:
    matchLabels:
      app: petakeu-api
  template:
    metadata:
      labels:
        app: petakeu-api
    spec:
      containers:
      - name: api
        image: petakeu/api:latest
        ports:
        - containerPort: 4000
        envFrom:
        - secretRef:
            name: petakeu-secrets
        - configMapRef:
            name: petakeu-config
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /health
            port: 4000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health
            port: 4000
          initialDelaySeconds: 5
          periodSeconds: 5
```

### Method 3: Managed Services (Recommended)

Best for: Production with minimal ops overhead

| Component | AWS | GCP | Azure |
|-----------|-----|-----|-------|
| PostgreSQL | RDS for PostgreSQL + PostGIS | Cloud SQL for PostgreSQL | Azure Database for PostgreSQL |
| Redis | ElastiCache | Memorystore | Azure Cache for Redis |
| Storage | S3 | Cloud Storage | Blob Storage |
| Containers | ECS Fargate / EKS | Cloud Run / GKE | Container Apps / AKS |
| CDN | CloudFront | Cloud CDN | Azure CDN |

---

## Database Migration

### Initial Setup

```bash
# Run migrations on fresh database
docker compose -f docker-compose.prod.yml exec api npx ts-node apps/server/migrations/001_init.sql

# Or using psql directly
psql "$DATABASE_URL" -f apps/server/migrations/001_init.sql
```

### Ongoing Migrations

```bash
# Create new migration
# 1. Create SQL file: apps/server/migrations/002_description.sql
# 2. Test locally
# 3. Apply in production
psql "$DATABASE_URL" -f apps/server/migrations/002_description.sql
```

### Materialized View Refresh

```bash
# Manual refresh
psql "$DATABASE_URL" -c "SELECT refresh_mv_payments_with_cut();"

# Automated (add to cron/systemd timer)
# Daily at 02:00 WIB
0 2 * * * psql "$DATABASE_URL" -c "SELECT refresh_mv_payments_with_cut();"
```

---

## SSL/TLS Configuration

### Using Let's Encrypt with Nginx (Certbot)

```bash
# Install certbot
sudo apt-get install certbot python3-certbot-nginx

# Obtain certificate
sudo certbot --nginx -d petakeu.go.id -d api.petakeu.go.id

# Auto-renewal (already added by certbot)
sudo certbot renew --dry-run
```

### Using External Load Balancer (AWS ALB, GCP Load Balancer)

Terminate SSL at load balancer, forward HTTP to containers:
- Configure listener on 443 with ACM certificate
- Target group on port 80 (web) / 4000 (api)
- Health check path: `/health`

---

## Monitoring & Observability

### Health Checks

| Service | Endpoint | Expected Response |
|---------|----------|-------------------|
| Web | `GET /health` | `200 OK` with "healthy" |
| API | `GET /health` | `200 {"status":"ok","service":"petakeu-api"}` |
| PostgreSQL | `pg_isready` | `accepting connections` |
| Redis | `PING` | `PONG` |
| MinIO | `GET /minio/health/live` | `200 OK` |

### Key Metrics to Monitor

**API Server:**
- Request latency (p50, p95, p99)
- Error rate (5xx %)
- Request throughput (req/s)
- Memory/CPU usage
- Active connections

**Database:**
- Connection pool usage
- Query latency
- Cache hit ratio
- Disk usage
- Replication lag (if replica)

**Redis:**
- Memory usage
- Hit/miss ratio
- Eviction rate
- Connected clients

**Business Metrics:**
- Upload success/failure rate
- Report generation time
- Choropleth query latency
- Active users

### Logging

```bash
# View API logs
docker compose -f docker-compose.prod.yml logs -f api

# Structured logging (JSON) - configure in app
LOG_LEVEL=info
# Output: {"timestamp":"...","level":"info","message":"...","requestId":"...","userId":"..."}
```

---

## Backup & Disaster Recovery

### Automated Backups

```bash
# PostgreSQL (daily, retain 30 days)
# Using pg_dump in cron or managed service automated backups

# Redis (RDB snapshots)
# Configure in redis.conf: save 900 1, save 300 10, save 60 10000

# MinIO (versioning + replication)
# Enable bucket versioning, cross-region replication
```

### Recovery Procedures

**Database Restore:**
```bash
# 1. Stop API to prevent writes
docker compose -f docker-compose.prod.yml stop api

# 2. Restore from backup
psql "$DATABASE_URL" < backup_20250803.sql

# 3. Refresh materialized view
psql "$DATABASE_URL" -c "SELECT refresh_mv_payments_with_cut();"

# 4. Restart API
docker compose -f docker-compose.prod.yml start api
```

**Point-in-Time Recovery (Managed DB):**
Use provider's PITR feature (RDS, Cloud SQL support this).

---

## Scaling Guidelines

### Horizontal Scaling (API)

```yaml
# Kubernetes HPA
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: petakeu-api-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: petakeu-api
  minReplicas: 3
  maxReplicas: 20
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
```

### Database Scaling

| Scale Stage | Approach |
|-------------|----------|
| < 100K regions | Single primary |
| 100K - 1M | Read replicas for queries |
| 1M+ | Partition `payments` by period, consider Citus |

### Redis Scaling

- Use Redis Cluster for >256MB dataset
- Separate cache (Redis) from sessions (if used)

---

## Security Checklist

### Pre-Deployment

- [ ] All secrets generated and stored securely (Vault, SealedSecrets, etc.)
- [ ] Database SSL enforced (`sslmode=require`)
- [ ] Redis AUTH enabled
- [ ] MinIO TLS enabled
- [ ] API CORS restricted to frontend domain
- [ ] JWT secrets rotated from development values
- [ ] Non-root containers (verified in Dockerfile)
- [ ] Security headers in Nginx (verified)

### Network Security

- [ ] Database not publicly accessible (VPC only)
- [ ] Redis not publicly accessible
- [ ] MinIO not publicly accessible (or signed URLs only)
- [ ] API only accessible via load balancer/ingress
- [ ] Rate limiting on API endpoints
- [ ] WAF rules for common attacks

### Ongoing

- [ ] Dependency scanning in CI/CD (`pnpm audit`, `trivy`)
- [ ] Container image scanning
- [ ] Regular secret rotation (quarterly)
- [ ] Security patch schedule (monthly)

---

## Rollback Procedures

### Docker Compose

```bash
# Quick rollback to previous image
docker compose -f docker-compose.prod.yml pull api:previous-tag
docker compose -f docker-compose.prod.yml up -d --no-deps api

# Or using git tags
git checkout v1.2.3
docker compose -f docker-compose.prod.yml build api
docker compose -f docker-compose.prod.yml up -d --no-deps api
```

### Kubernetes

```bash
# Rollback deployment
kubectl rollout undo deployment/petakeu-api

# Rollback to specific revision
kubectl rollout undo deployment/petakeu-api --to-revision=5
```

---

## Maintenance Windows

### Scheduled Maintenance

| Task | Frequency | Window | Duration |
|------|-----------|--------|----------|
| OS patches | Monthly | Sun 02:00-04:00 WIB | 30 min |
| Dependency updates | Monthly | Sun 02:00-04:00 WIB | 1 hour |
| DB vacuum/analyze | Weekly | Sun 03:00 WIB | 15 min |
| MV refresh | Daily | 02:00 WIB | 5 min |
| Log rotation | Daily | 00:00 WIB | - |
| Backup verification | Weekly | Mon 09:00 WIB | 30 min |

### Zero-Downtime Deployments

- Use rolling updates (Kubernetes) or blue-green (Docker Compose)
- Maintain backward-compatible API changes
- Run migrations before deploying new code
- Health checks must pass before traffic switch

---

## Troubleshooting

### Common Issues

| Symptom | Cause | Solution |
|---------|-------|----------|
| API 503 | DB connection pool exhausted | Increase pool size, check long queries |
| Slow choropleth | MV stale | Refresh MV, check indexes |
| Upload timeout | File too large | Increase nginx `client_max_body_size` |
| CORS errors | Wrong origin in config | Update `CORS_ORIGIN` env var |
| Map not loading | Tile service blocked | Check `MAP_TILE_KEY`, firewall |

### Debug Commands

```bash
# API logs
docker compose -f docker-compose.prod.yml logs -f api --tail=100

# Database queries
psql "$DATABASE_URL" -c "SELECT * FROM pg_stat_activity;"

# Redis memory
docker compose -f docker-compose.prod.yml exec redis redis-cli INFO memory

# MinIO health
curl -f http://localhost:9000/minio/health/live
```

---

## Support Contacts

| Role | Contact | Escalation |
|------|---------|------------|
| Platform Team | platform@petakeu.go.id | Level 1 |
| Database Admin | dba@petakeu.go.id | Level 2 |
| Security Team | security@petakeu.go.id | Level 3 |
| On-call | +62-XXX-XXXXXXX | 24/7 |

---

## Appendix: Production Checklist

### Pre-Launch
- [ ] All environment variables set in production
- [ ] SSL certificates valid and auto-renewing
- [ ] Database migrations applied
- [ ] Materialized view refreshed
- [ ] Health checks passing
- [ ] Load test completed (target: 100 req/s, p95 < 300ms)
- [ ] Security scan passed
- [ ] Backup verified restorable
- [ ] Monitoring alerts configured
- [ ] Runbooks documented
- [ ] On-call schedule published

### Post-Launch (Day 1)
- [ ] Verify all endpoints functional
- [ ] Check error rates < 0.1%
- [ ] Verify choropleth loads correctly
- [ ] Test upload flow end-to-end
- [ ] Test report generation
- [ ] Monitor resource utilization
- [ ] Confirm log aggregation working

### Post-Launch (Week 1)
- [ ] Review performance metrics
- [ ] Tune database indexes if needed
- [ ] Adjust autoscaling thresholds
- [ ] Document any incidents
- [ ] Update runbooks with learnings
