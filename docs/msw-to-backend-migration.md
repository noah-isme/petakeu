# MSW to Backend Migration Guide

Guide untuk transisi dari Mock Service Worker (MSW) ke backend Petakeu yang nyata. **Migrasi backend telah selesai dilakukan** — dokumen ini dipertahankan sebagai referensi dan panduan untuk pengembangan lanjutan.

---

## Status Migrasi

| Komponen | Status |
|----------|--------|
| Frontend (Web) | ✅ Selesai — Terhubung ke backend nyata |
| Backend (API) | ✅ Selesai — PostgreSQL, Redis, MinIO, BullMQ |
| Database | ✅ Selesai — Migrasi berjalan otomatis saat startup |
| Redis | ✅ Selesai — Digunakan BullMQ untuk job queue |
| MinIO/S3 | ✅ Selesai — Upload file & laporan disimpan ke MinIO |
| Authentication | ✅ Selesai — JWT Bearer middleware (`AUTH_DISABLED=true` untuk dev) |
| FiscalView API | ✅ Selesai — `/rank`, `/surplus-defisit` |
| RankFin API | ✅ Selesai — `/rankfin/league` |
| DefisitWatch API | ✅ Selesai — `/defisitwatch/watchlist`, `/daerah/:id/penjelasan` |
| Upload Pipeline | ✅ Selesai — Parse → Validate → DB persist → MV refresh |
| Report Generation | ✅ Selesai — PDF (pdfkit) + Excel (exceljs) → MinIO presigned URL |
| Region Data | ✅ Selesai — 34 provinsi + 58 kab/kota dengan geometri PostGIS |

---

## Migration Overview

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Phase 1       │────▶│   Phase 2       │────▶│   Phase 3       │
│  Infrastructure │     │  Backend Core   │     │  Frontend Switchover │
│  (DB, Redis,    │     │  (Persistence,  │     │  (Remove MSW,   │
│   MinIO, Auth)  │     │   Auth, Workers)│     │   Connect API)  │
└─────────────────┘     └─────────────────┘     └─────────────────┘
      Week 1-2              Week 2-4                Week 4-5
```

---

## Phase 1: Infrastructure Setup (Week 1-2)

### 1.1 Provision Production Database

**Option A: Managed PostgreSQL (Recommended)**
- AWS RDS / GCP Cloud SQL / Azure Database for PostgreSQL
- Enable PostGIS extension
- Configure SSL/TLS
- Set up read replicas for query scaling

**Option B: Self-Hosted**
```bash
# Using Docker
docker run -d \
  --name petakeu-postgres \
  -e POSTGRES_DB=petakeu \
  -e POSTGRES_USER=petakeu \
  -e POSTGRES_PASSWORD=<secure-password> \
  -p 5432:5432 \
  -v petakeu-pgdata:/var/lib/postgresql/data \
  postgis/postgis:16-3.4
```

### 1.2 Run Migrations

```bash
# Apply initial schema
psql "$DATABASE_URL" -f apps/server/migrations/001_init.sql

# Verify
psql "$DATABASE_URL" -c "\dt"
psql "$DATABASE_URL" -c "SELECT * FROM regions LIMIT 5;"
```

### 1.3 Provision Redis

**Managed (Recommended):** AWS ElastiCache, GCP Memorystore, Azure Cache for Redis

**Self-Hosted:**
```bash
docker run -d \
  --name petakeu-redis \
  -p 6379:6379 \
  -v petakeu-redis-data:/data \
  redis:7-alpine \
  redis-server --appendonly yes --maxmemory 256mb --maxmemory-policy allkeys-lru
```

### 1.4 Provision Object Storage

**Option A: AWS S3 (Recommended)**
```bash
aws s3api create-bucket --bucket petakeu-uploads --region us-east-1
aws s3api put-bucket-versioning --bucket petakeu-uploads --versioning-configuration Status=Enabled
aws s3api put-bucket-encryption --bucket petakeu-uploads --server-side-encryption-configuration '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'
```

**Option B: MinIO (Self-Hosted)**
```bash
docker run -d \
  --name petakeu-minio \
  -p 9000:9000 -p 9001:9001 \
  -e MINIO_ROOT_USER=admin \
  -e MINIO_ROOT_PASSWORD=<secure-password> \
  -v petakeu-minio-data:/data \
  quay.io/minio/minio:RELEASE.2024-05-10T01-41-38Z \
  server /data --console-address ":9001"
```

### 1.5 Configure Infrastructure Secrets

Create `.env.production` for server:
```env
NODE_ENV=production
PORT=4000
DATABASE_URL=postgresql://petakeu:<password>@<host>:5432/petakeu?sslmode=require
REDIS_URL=redis://:<password>@<host>:6379
STORAGE_BUCKET=petakeu-uploads
STORAGE_ENDPOINT=https://s3.us-east-1.amazonaws.com
STORAGE_ACCESS_KEY=<access-key>
STORAGE_SECRET_KEY=<secret-key>
STORAGE_REGION=us-east-1
AUTH_SECRET=<openssl rand -base64 32>
AUTH_ISSUER=petakeu
AUTH_AUDIENCE=petakeu-api
LOG_LEVEL=info
CORS_ORIGIN=https://petakeu.go.id
```

---

## Phase 2: Backend Core Implementation (Week 2-4)

### 2.1 Replace In-Memory Stores with Database

**Files to modify:**
- `apps/server/src/services/region-service.ts` → Use `pg` pool
- `apps/server/src/services/geo-service.ts` → Query `mv_payments_with_cut`
- `apps/server/src/services/upload-service.ts` → Persist to `uploads` table, process via worker
- `apps/server/src/services/report-service.ts` → Persist to `reports` table, process via worker

**Example: Region Service with Database**
```typescript
// apps/server/src/services/region-service.ts
import { pgPool } from "../db/postgres";

export async function listRegions(params: RegionListParams): Promise<Region[]> {
  let query = "SELECT id, code_bps AS code, name, level, parent_id FROM regions WHERE 1=1";
  const values: any[] = [];
  let paramIndex = 1;

  if (params.level) {
    query += ` AND level = $${paramIndex++}`;
    values.push(params.level);
  }
  if (params.parent) {
    query += ` AND parent_id = $${paramIndex++}`;
    values.push(params.parent);
  }

  query += " ORDER BY code_bps";
  const result = await pgPool.query(query, values);
  return result.rows.map(row => ({
    id: row.id,
    code: row.code,
    name: row.name,
    level: row.level,
    parentId: row.parent_id,
  }));
}
```

### 2.2 Implement Authentication Middleware

**New files needed:**
- `apps/server/src/middleware/auth.ts` - JWT verification
- `apps/server/src/middleware/rbac.ts` - Role-based access control
- `apps/server/src/utils/jwt.ts` - Token generation/validation

**Implementation:**
```typescript
// apps/server/src/middleware/auth.ts
import { Request, Response, NextFunction } from "express";
import { verifyToken } from "../utils/jwt";

export interface AuthRequest extends Request {
  user?: JWTPayload;
}

export async function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid authorization header" });
  }

  const token = authHeader.slice(7);
  try {
    const payload = await verifyToken(token);
    req.user = payload;
    next();
  } catch (error) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}
```

### 2.3 Implement Background Workers

**Upload Worker (BullMQ):**
```typescript
// apps/server/src/workers/upload-worker.ts
import { Queue, Worker } from "bullmq";
import { uploadService } from "../services/upload-service";

const uploadQueue = new Queue("upload-processing", { connection: redis });

uploadQueue.process(async (job) => {
  const { uploadId, buffer } = job.data;
  await uploadService.processUpload(uploadId, buffer);
});

// In upload-service.ts: enqueueUpload adds job to queue instead of setTimeout
```

**Report Worker:**
```typescript
// apps/server/src/workers/report-worker.ts
import { Queue } from "bullmq";
import { generatePDF, generateExcel } from "../utils/report-generator";

const reportQueue = new Queue("report-generation", { connection: redis });

reportQueue.process(async (job) => {
  const { jobId, regionIds, periodFrom, periodTo, format } = job.data;
  // Generate report, upload to S3, update job status
});
```

### 2.4 Seed Reference Data

```sql
-- Insert Indonesian provinces and regencies
-- Run after migration
INSERT INTO regions (id, code_bps, name, level, geom) VALUES
  -- Provinces
  (gen_random_uuid(), '31', 'DKI Jakarta', 1, ST_GeomFromText('MULTIPOLYGON(...)', 4326)),
  (gen_random_uuid(), '32', 'Jawa Barat', 1, ST_GeomFromText('MULTIPOLYGON(...)', 4326)),
  -- ... all 38 provinces
  -- Regencies (500+)
  -- Use shapefile import: shp2pgsql -s 4326 -I indonesia_regencies.shp regions | psql
```

### 2.5 Implement Materialized View Refresh

```typescript
// apps/server/src/services/geo-service.ts
import { pgPool } from "../db/postgres";

export async function refreshMaterializedView(): Promise<void> {
  await pgPool.query("SELECT refresh_mv_payments_with_cut()");
}

// Call after successful upload processing
// Also schedule via cron: 0 2 * * * (daily 02:00 WIB)
```

---

## Phase 3: Frontend Switchover (Week 4-5)

### 3.1 Update Environment Configuration

**Web `.env.production`:**
```env
VITE_API_BASE_URL=https://api.petakeu.go.id/api
VITE_PUBLIC_MODE=false
```

**Remove MSW from production build:**
```typescript
// apps/web/src/main.tsx - Conditional MSW loading
async function bootstrap() {
  // Only enable MSW in development
  if (import.meta.env.DEV && import.meta.env.VITE_USE_MSW === "true") {
    await enableMocking();
  }
  
  // ... rest of bootstrap
}
```

### 3.2 Update API Client for Authentication

```typescript
// apps/web/src/api/client.ts
import { appConfig } from "../config/app";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api";

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE_URL}${path}`;
  
  // Add auth token
  const token = getAuthToken(); // From auth context/cookies
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...options.headers,
  };
  
  if (token) {
    (headers as Record<string, string>)["Authorization"] = `Bearer ${token}`;
  }

  // Add public/scenario params
  const params = new URLSearchParams();
  if (appConfig.publicMode) params.set("public", "1");
  if (appConfig.scenario) params.set("scenario", appConfig.scenario);
  
  const finalUrl = params.toString() ? `${url}?${params}` : url;

  const response = await fetch(finalUrl, { ...options, headers, credentials: "include" });
  
  if (!response.ok) {
    if (response.status === 401) {
      // Trigger logout/refresh
      handleAuthError();
    }
    throw new Error(await response.text());
  }
  
  return response.json();
}
```

### 3.3 Add Authentication Context

```typescript
// apps/web/src/context/AuthContext.tsx
import { createContext, useContext, useState, useEffect, ReactNode } from "react";

interface User {
  id: string;
  email: string;
  roles: string[];
  regionScope?: string[];
}

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check for existing session
    checkSession().then(setUser).finally(() => setIsLoading(false));
  }, []);

  const login = async (email: string, password: string) => {
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
      credentials: "include",
    });
    const data = await response.json();
    setUser(data.user);
    return data;
  };

  const logout = async () => {
    await fetch(`${API_BASE_URL}/auth/logout`, { method: "POST", credentials: "include" });
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
```

### 3.4 Update Protected Routes

```typescript
// apps/web/src/App.tsx - Wrap with AuthProvider
import { AuthProvider } from "./context/AuthContext";
import { PrivateRoute, PublicRoute } from "./components/auth/Routes";

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
            <Route path="/" element={
              <PrivateRoute>
                <MainLayout />
              </PrivateRoute>
            } />
          </Routes>
        </BrowserRouter>
      </QueryClientProvider>
    </AuthProvider>
  );
}
```

---

## Migration Checklist

### Pre-Migration (Phase 1 Complete)
- [ ] PostgreSQL with PostGIS provisioned and accessible
- [ ] Migrations applied successfully
- [ ] Redis provisioned and accessible
- [ ] MinIO/S3 bucket created with encryption
- [ ] `.env.production` configured with all secrets
- [ ] SSL certificates for API domain
- [ ] DNS records pointing to load balancer

### Backend Implementation (Phase 2 Complete)
- [ ] All services use database instead of in-memory stores
- [ ] Authentication middleware implemented
- [ ] RBAC middleware implemented
- [ ] Upload worker processes files asynchronously
- [ ] Report worker generates PDF/Excel
- [ ] Materialized view refreshes after uploads
- [ ] Reference data (regions) seeded
- [ ] API passes all integration tests
- [ ] Load testing completed (target: 100 req/s)

### Frontend Switchover (Phase 3 Complete)
- [ ] MSW disabled in production build
- [ ] API client uses real backend URL
- [ ] Authentication context implemented
- [ ] Login/logout flows working
- [ ] Protected routes configured
- [ ] Token refresh handled
- [ ] Public mode works with real API
- [ ] All scenarios work with real data
- [ ] Error boundaries handle API errors
- [ ] E2E tests pass against real backend

---

## Rollback Plan

If issues arise during switchover:

### Quick Rollback (Frontend)
```bash
# Re-enable MSW temporarily
VITE_USE_MSW=true pnpm build
docker compose up -d --no-deps web
```

### Database Rollback
```bash
# Restore from backup
psql "$DATABASE_URL" < backup_pre_migration.sql
# Re-refresh MV
psql "$DATABASE_URL" -c "SELECT refresh_mv_payments_with_cut();"
```

### Full Rollback (Both)
```bash
# 1. Frontend: revert to MSW version
git checkout v0.1.0-msw

# 2. Backend: stop new version, start MSW-compatible stub
docker compose -f docker-compose.dev.yml up -d

# 3. Verify MSW works
curl http://localhost:5173
```

---

## Validation Tests

Run after each phase:

### Phase 1 Validation
```bash
# Test DB connectivity
psql "$DATABASE_URL" -c "SELECT version();"

# Test Redis
redis-cli -u "$REDIS_URL" PING

# Test MinIO
mc alias set petakeu "$STORAGE_ENDPOINT" "$STORAGE_ACCESS_KEY" "$STORAGE_SECRET_KEY"
mc ls petakeu/petakeu-uploads
```

### Phase 2 Validation
```bash
# API health
curl https://api.petakeu.go.id/health

# Auth flow
curl -X POST https://api.petakeu.go.id/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@petakeu.go.id","password":"..."}'

# Regions
curl -H "Authorization: Bearer $TOKEN" https://api.petakeu.go.id/api/regions

# Choropleth
curl -H "Authorization: Bearer $TOKEN" "https://api.petakeu.go.id/api/geo/choropleth?period=2025-08"

# Upload
curl -H "Authorization: Bearer $TOKEN" \
  -F "file=@test_data.xlsx" \
  https://api.petakeu.go.id/api/uploads
```

### Phase 3 Validation
```bash
# Frontend loads
curl -I https://petakeu.go.id

# Login flow
# 1. Navigate to https://petakeu.go.id
# 2. Redirect to login
# 3. Login with SSO
# 4. Redirect to dashboard
# 5. Verify choropleth loads
# 6. Verify upload works
# 7. Verify report generation
```

---

## Timeline Summary

| Week | Focus | Deliverable |
|------|-------|-------------|
| 1 | Infrastructure | DB, Redis, MinIO provisioned; migrations applied |
| 2 | Backend Core | Services use DB; Auth/RBAC implemented |
| 3 | Workers & Data | Upload/Report workers; Reference data seeded |
| 4 | Frontend Switchover | MSW removed; Auth context; Real API connected |
| 5 | Testing & Hardening | E2E tests; Load tests; Security validation; Go-live |

---

## Post-Migration

### Monitoring Setup
- [ ] API latency alerts (p95 > 300ms)
- [ ] Error rate alerts (> 1%)
- [ ] Upload success rate alerts (< 99%)
- [ ] Report generation time alerts (> 60s)
- [ ] Database connection pool alerts (> 80%)
- [ ] Redis memory alerts (> 80%)

### Documentation Updates
- [ ] Update README with production URLs
- [ ] Update API docs with real endpoints
- [ ] Document SSO integration steps
- [ ] Create runbooks for common operations

### Knowledge Transfer
- [ ] Team walkthrough of new architecture
- [ ] Incident response procedures
- [ ] Deployment runbook
- [ ] Backup/restore procedures