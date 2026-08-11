# Environment Variables Reference

Complete reference for all environment variables in the Petakeu monorepo.

---

## Server (`apps/server`)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | `4000` | HTTP port for the Express server |
| `NODE_ENV` | No | `development` | Runtime environment (`development`, `production`, `test`) |
| `DATABASE_URL` | **Yes** (prod) | `postgresql://petakeu:petakeu@localhost:5432/petakeu` | PostgreSQL connection string with PostGIS. Format: `postgresql://user:pass@host:port/db` |
| `PGSSLMODE` | No | — | PostgreSQL SSL mode. Set to `require` for managed DBs (RDS, Cloud SQL) |
| `REDIS_URL` | **Yes** (prod) | `redis://localhost:6379` | Redis connection string. Format: `redis://host:port` |
| `STORAGE_BUCKET` | **Yes** (prod) | `uploads` | MinIO/S3 bucket name for file uploads |
| `STORAGE_REPORTS_BUCKET` | No | `reports` | MinIO/S3 bucket name for generated reports (PDF/Excel) |
| `STORAGE_ENDPOINT` | **Yes** (prod) | `http://localhost:9000` | MinIO/S3 endpoint URL |
| `STORAGE_ACCESS_KEY` | **Yes** (prod) | `admin` | MinIO/S3 access key |
| `STORAGE_SECRET_KEY` | **Yes** (prod) | `password123` | MinIO/S3 secret key |
| `STORAGE_REGION` | No | `us-east-1` | S3 region (required for AWS S3) |
| `AUTH_SECRET` | **Yes** (prod) | — | JWT signing secret (min 32 chars). Generate: `openssl rand -base64 32` |
| `AUTH_DISABLED` | No | `true` | Set to `true` to bypass JWT auth entirely (dev only). Must be `false` in production. |
| `AUTH_ISSUER` | No | `petakeu` | JWT issuer claim |
| `AUTH_AUDIENCE` | No | `petakeu-api` | JWT audience claim |
| `MAP_TILE_KEY` | No | — | Mapbox/Carto API key for custom map tiles |
| `LOG_LEVEL` | No | `debug` | Log level (`debug`, `info`, `warn`, `error`) |
| `CORS_ORIGIN` | No | `*` | Allowed CORS origin(s) |
| `REPORT_SCHEDULE_ENABLED` | No | Enabled only with complete config | Set to `false` to disable automated report schedules. Missing schedule, SMTP, recipient, or region configuration also disables them safely. |
| `REPORT_SCHEDULE_WEEKLY_CRON` | No | — | Optional 5-field cron expression for weekly executive PDF reports |
| `REPORT_SCHEDULE_MONTHLY_CRON` | No | — | Optional 5-field cron expression for monthly executive PDF reports |
| `REPORT_SCHEDULE_TIMEZONE` | No | `Asia/Jakarta` | IANA timezone used to evaluate scheduled report cadence |
| `REPORT_SCHEDULE_REGION_IDS` | No | — | Comma/space-separated region UUIDs included in scheduled reports |
| `SMTP_HOST` | No | — | SMTP host; required with schedule settings to send email |
| `SMTP_PORT` | No | `587` | SMTP port (`465` implies secure transport by default) |
| `SMTP_SECURE` | No | Inferred from port | Set `true` for TLS SMTP transport |
| `SMTP_USER` / `SMTP_PASS` | No | — | Optional paired SMTP credentials |
| `REPORT_EMAIL_FROM` | No | — | Sender address for scheduled report emails |
| `REPORT_EMAIL_TO` | No | — | Comma/space-separated recipient addresses |
| `REPORT_EMAIL_SUBJECT` | No | `Petakeu Executive Revenue Summary` | Subject prefix for automated report emails |

---

## Web (`apps/web`)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `VITE_API_BASE_URL` | No | `/api` | Base URL for API calls. Use full URL in production (e.g., `https://api.petakeu.go.id/api`), relative path with MSW |
| `VITE_PUBLIC_MODE` | No | `false` | Enable public mode (hides detailed numbers, shows only quantile classes). Can also use `?public=1` |
| `VITE_SCENARIO` | No | `normal` | MSW mock data scenario. Options: `normal`, `spike`, `missing-geometry`, `high-income`, `deficit-crisis`. Can also use `?scenario=` |
| `VITE_MAP_TILE_URL` | No | CartoDB Dark | Custom map tile URL template |
| `VITE_MAP_TILE_ATTRIBUTION` | No | CartoDB/OSM | Map tile attribution HTML |
| `VITE_ENABLE_ADMIN_DASHBOARD` | No | `true` | Show admin navigation items |
| `VITE_ENABLE_REPORTS` | No | `true` | Enable reports feature |

---

## Docker Compose Development (`docker-compose.dev.yml`)

The following are set automatically in the development Docker Compose:

| Service | Variable | Value |
|---------|----------|-------|
| `postgres` | `POSTGRES_DB` | `petakeu` |
| `postgres` | `POSTGRES_USER` | `petakeu` |
| `postgres` | `POSTGRES_PASSWORD` | `petakeu` |
| `redis` | — | — |
| `minio` | `MINIO_ROOT_USER` | `admin` |
| `minio` | `MINIO_ROOT_PASSWORD` | `password123` |
| `api` | `DATABASE_URL` | `postgresql://petakeu:petakeu@postgres:5432/petakeu` |
| `api` | `REDIS_URL` | `redis://redis:6379` |
| `api` | `STORAGE_BUCKET` | `uploads` |
| `api` | `STORAGE_REPORTS_BUCKET` | `reports` |
| `api` | `STORAGE_ENDPOINT` | `http://minio:9000` |
| `api` | `STORAGE_ACCESS_KEY` | `admin` |
| `api` | `STORAGE_SECRET_KEY` | `password123` |
| `api` | `AUTH_DISABLED` | `true` |
| `web` | `VITE_API_BASE_URL` | `http://api:4000/api` |

---

## Production Checklist

Before deploying to production, ensure all **required** variables are set:

### Server (Required for Production)
- [ ] `DATABASE_URL` - Production PostgreSQL with PostGIS
- [ ] `REDIS_URL` - Production Redis
- [ ] `STORAGE_BUCKET` - Production MinIO/S3 bucket
- [ ] `STORAGE_ENDPOINT` - Production storage endpoint
- [ ] `STORAGE_ACCESS_KEY` - Production access key
- [ ] `STORAGE_SECRET_KEY` - Production secret key
- [ ] `AUTH_SECRET` - Strong JWT secret (generate with `openssl rand -base64 32`)
- [ ] `NODE_ENV=production`
- [ ] `LOG_LEVEL=info` or `warn`
- [ ] `CORS_ORIGIN` - Restrict to your frontend domain

### Web (Required for Production)
- [ ] `VITE_API_BASE_URL` - Full production API URL
- [ ] `VITE_PUBLIC_MODE` - Set based on deployment type
- [ ] `VITE_MAP_TILE_KEY` - If using paid map tiles

---

## Quick Setup

### Development (with Docker)
```bash
docker compose -f docker-compose.dev.yml up --build
```

### Development (Local)
```bash
# Server
cd apps/server
cp .env.example .env
# Edit .env with your local DB/Redis if not using Docker
pnpm dev

# Web
cd apps/web
cp .env.example .env.local
pnpm dev
```

### Production
```bash
# Server
cd apps/server
cp .env.example .env
# Fill in all production values
pnpm build && pnpm start

# Web
cd apps/web
cp .env.example .env.production
# Fill in production API URL
pnpm build && pnpm preview
```

---

## Variable Precedence

1. **System environment variables** (highest priority)
2. **`.env` / `.env.local` files**
3. **Docker Compose `environment` section**
4. **Hardcoded defaults in code** (lowest priority)

For Vite (web), only variables prefixed with `VITE_` are exposed to the client bundle.
