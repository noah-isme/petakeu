# Analysis: Milestone M2 — Comprehensive Readiness Health Checks (`GET /healthz`)

## 1. Overview & Objectives

Milestone M2 extends the backend health check utility (`apps/server/src/utils/health.ts`) and Express route handlers (`apps/server/src/server.ts`) to provide active probing of system dependencies:
1. **Database Probe**: Query execution with PostGIS version detection.
2. **Redis Probe**: Ping/pong connection verification.
3. **Storage Probe**: MinIO/S3 bucket accessibility checks for `uploads` and `reports`.
4. **Queue Probe**: BullMQ job metrics (`active`, `waiting`, `completed`, `failed`) for `uploadQueue` and `reportQueue`.
5. **HTTP Status Code Mapping & Readiness Rules**:
   - HTTP **503 Service Unavailable** if critical dependencies (PostgreSQL/PostGIS or Redis) are down (`status: "unhealthy"`).
   - HTTP **200 OK** if critical dependencies are healthy, even if secondary services (Storage or Queue) are degraded (`status: "degraded"` or `"healthy"`).
6. **Structured JSON Schema**: Unified payload structure with per-component latency, metadata details, and error diagnostics.

---

## 2. Codebase Investigation & Current State

### 2.1 File Map & Dependency Points
- **`apps/server/src/utils/health.ts`**: Contains `performHealthChecks()`, `checkDatabase()`, `checkRedis()`, `checkStorage()`, `performReadinessChecks()`, `performLivenessCheck()`.
- **`apps/server/src/server.ts`**: Routes `/health`, `/healthz`, `/ready`, `/live`. Currently returns HTTP 200 for `healthy` and `degraded`, and HTTP 503 for `unhealthy`.
- **`apps/server/src/db/postgres.ts`**: Exports `getPgPool()`, returning a `pg.Pool` instance connected via `DATABASE_URL`.
- **`apps/server/src/db/redis.ts`**: Exports `getRedisClient()`, returning a node-redis `RedisClientType` connected via `REDIS_URL`.
- **`apps/server/src/db/minio.ts`**: Exports `getS3Client()`, returning `@aws-sdk/client-s3` `S3Client`.
- **`apps/server/src/services/storage-service.ts`**: Exports `checkStorageHealth()` which sends `ListBucketsCommand({})`. Uses buckets `uploads` (`STORAGE_BUCKET`) and `reports` (`STORAGE_REPORTS_BUCKET`).
- **`apps/server/src/jobs/upload-worker.ts`**: Exports `getUploadQueue()` returning `upload-processing` BullMQ `Queue`.
- **`apps/server/src/jobs/report-worker.ts`**: Exports `getReportQueue()` returning `report-generation` BullMQ `Queue`.
- **`apps/server/src/config/env.ts`**: Defines `EnvConfig` with `storageBucket` ('uploads') and `storageReportsBucket` ('reports').

---

## 3. Component Probe Specification & Requirements

### 3.1 Database Probe (`checkDatabase`)
- **Query**: `SELECT 1 AS alive, PostGIS_Version() AS postgis_version`
- **Pool Source**: `getPgPool()` from `../db/postgres`
- **Execution Flow**:
  1. `const start = Date.now();`
  2. `const pool = getPgPool();`
  3. `const res = await pool.query('SELECT 1 AS alive, PostGIS_Version() AS postgis_version');`
  4. `const postgisVersion = res.rows[0]?.postgis_version || 'unknown';`
  5. `const latencyMs = Date.now() - start;`
- **Success Criteria**:
  - `status`: `'healthy'`
  - `latencyMs`: calculated duration in milliseconds.
  - `details`: `{ query: 'SELECT 1 AS alive, PostGIS_Version() AS postgis_version', postgisVersion: string }`
- **Failure Handling**:
  - Catches any error during pool access or query execution.
  - `status`: `'unhealthy'`
  - `error`: `error instanceof Error ? error.message : 'Unknown error'`

### 3.2 Redis Probe (`checkRedis`)
- **Command**: `redis.ping()`
- **Client Source**: `getRedisClient()` from `../db/redis`
- **Execution Flow**:
  1. `const start = Date.now();`
  2. `const redis = getRedisClient();`
  3. `const pong = await redis.ping();`
  4. If `pong !== 'PONG'`, throw `new Error('Redis ping response was not PONG')`.
- **Success Criteria**:
  - `status`: `'healthy'`
  - `latencyMs`: calculated duration in milliseconds.
  - `details`: `{ command: 'PING' }`
- **Failure Handling**:
  - Catches connection errors or ping timeouts.
  - `status`: `'unhealthy'`
  - `error`: `error instanceof Error ? error.message : 'Unknown error'`

### 3.3 Storage Probe (`checkStorage`)
- **Action**: Check accessibility of both configured buckets (`uploads` and `reports`).
- **SDK Call**: `@aws-sdk/client-s3` `HeadBucketCommand({ Bucket: bucketName })` using `getS3Client()` from `../db/minio`.
- **Execution Flow**:
  1. `const start = Date.now();`
  2. Access `uploadsBucket = env.storageBucket || process.env.STORAGE_BUCKET || 'uploads'` and `reportsBucket = env.storageReportsBucket || process.env.STORAGE_REPORTS_BUCKET || 'reports'`.
  3. Perform `HeadBucketCommand` on both buckets (e.g. `Promise.all([s3.send(new HeadBucketCommand({ Bucket: uploadsBucket })), s3.send(new HeadBucketCommand({ Bucket: reportsBucket }))])`).
- **Status Classification**:
  - **Healthy**: Both buckets return HTTP 200 OK via `HeadBucketCommand`.
    - `status`: `'healthy'`
    - `details`: `{ provider: 'MinIO/S3', buckets: [uploadsBucket, reportsBucket] }`
  - **Degraded**: Either bucket is inaccessible or S3 client throws error.
    - Storage is not a critical blocker for API liveness; thus storage failures set component status to `'degraded'` (or `'unhealthy'` internally if caught, mapping to `'degraded'` overall status).
    - `status`: `'degraded'`
    - `error`: error message describing missing bucket or S3 connection failure.

### 3.4 Worker Queue Probe (`checkQueue`)
- **Queues**: `uploadQueue` (`upload-processing`) and `reportQueue` (`report-generation`).
- **Queue Instance Sources**:
  - `getUploadQueue()` from `../jobs/upload-worker`
  - `getReportQueue()` from `../jobs/report-worker`
- **Execution Flow**:
  1. `const start = Date.now();`
  2. `const uploadQ = getUploadQueue();`
  3. `const reportQ = getReportQueue();`
  4. Execute `const [uploadCounts, reportCounts] = await Promise.all([ uploadQ.getJobCounts('active', 'waiting', 'completed', 'failed'), reportQ.getJobCounts('active', 'waiting', 'completed', 'failed') ]);`
- **Success Criteria**:
  - `status`: `'healthy'`
  - `details`:
    ```ts
    {
      uploadQueue: {
        active: uploadCounts.active || 0,
        waiting: uploadCounts.waiting || 0,
        completed: uploadCounts.completed || 0,
        failed: uploadCounts.failed || 0
      },
      reportQueue: {
        active: reportCounts.active || 0,
        waiting: reportCounts.waiting || 0,
        completed: reportCounts.completed || 0,
        failed: reportCounts.failed || 0
      }
    }
    ```
- **Failure Handling**:
  - If Redis connection for queues fails or `getJobCounts` throws an error:
  - `status`: `'degraded'`
  - `error`: error message.

---

## 4. HTTP Status Code Logic & Readiness Mapping

### 4.1 Dependency Criticality Rules
| Component | Classification | Unhealthy Result |
|-----------|----------------|------------------|
| Database (`PostgreSQL/PostGIS`) | **Critical** | Overall `unhealthy` -> **HTTP 503** |
| Cache (`Redis`) | **Critical** | Overall `unhealthy` -> **HTTP 503** |
| Storage (`MinIO`) | **Non-Critical** | Overall `degraded` -> **HTTP 200** |
| Queue (`BullMQ`) | **Non-Critical** | Overall `degraded` -> **HTTP 200** |

### 4.2 Overall Status Rule Algorithm
```ts
const dbStatus = checks.database?.status;
const redisStatus = checks.redis?.status;
const storageStatus = checks.storage?.status;
const queueStatus = checks.queue?.status;

let overallStatus: 'healthy' | 'degraded' | 'unhealthy';

if (dbStatus === 'unhealthy' || redisStatus === 'unhealthy') {
  overallStatus = 'unhealthy';
} else if (storageStatus === 'degraded' || queueStatus === 'degraded' || storageStatus === 'unhealthy' || queueStatus === 'unhealthy') {
  overallStatus = 'degraded';
} else {
  overallStatus = 'healthy';
}
```

### 4.3 HTTP Status Code Mapping
- `overallStatus === 'unhealthy'` => **HTTP 503 Service Unavailable**
- `overallStatus === 'degraded'` => **HTTP 200 OK**
- `overallStatus === 'healthy'` => **HTTP 200 OK**

---

## 5. JSON Response Schema Specification

```ts
export interface ComponentHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  latencyMs?: number;
  details?: Record<string, unknown>;
  error?: string;
}

export interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  checks: {
    database: ComponentHealth;
    redis: ComponentHealth;
    storage: ComponentHealth;
    queue: ComponentHealth;
  };
  timestamp: string;
  uptime: number;
}
```

### 5.1 JSON Payload Examples

#### Example A: All Healthy (HTTP 200)
```json
{
  "status": "healthy",
  "checks": {
    "database": {
      "status": "healthy",
      "latencyMs": 4,
      "details": {
        "query": "SELECT 1 AS alive, PostGIS_Version() AS postgis_version",
        "postgisVersion": "3.4.0 USE_GEOS=1 USE_PROJ=1 USE_STATS=1"
      }
    },
    "redis": {
      "status": "healthy",
      "latencyMs": 2,
      "details": {
        "command": "PING"
      }
    },
    "storage": {
      "status": "healthy",
      "latencyMs": 15,
      "details": {
        "provider": "MinIO/S3",
        "buckets": ["uploads", "reports"]
      }
    },
    "queue": {
      "status": "healthy",
      "latencyMs": 8,
      "details": {
        "uploadQueue": { "active": 0, "waiting": 0, "completed": 12, "failed": 0 },
        "reportQueue": { "active": 0, "waiting": 0, "completed": 5, "failed": 0 }
      }
    }
  },
  "timestamp": "2026-08-11T01:00:00.000Z",
  "uptime": 342.15
}
```

#### Example B: Storage Degraded (HTTP 200)
```json
{
  "status": "degraded",
  "checks": {
    "database": {
      "status": "healthy",
      "latencyMs": 3,
      "details": {
        "query": "SELECT 1 AS alive, PostGIS_Version() AS postgis_version",
        "postgisVersion": "3.4.0 USE_GEOS=1 USE_PROJ=1 USE_STATS=1"
      }
    },
    "redis": {
      "status": "healthy",
      "latencyMs": 1,
      "details": { "command": "PING" }
    },
    "storage": {
      "status": "degraded",
      "latencyMs": 50,
      "details": { "provider": "MinIO/S3", "buckets": ["uploads", "reports"] },
      "error": "Bucket 'reports' does not exist or is unreachable"
    },
    "queue": {
      "status": "healthy",
      "latencyMs": 7,
      "details": {
        "uploadQueue": { "active": 0, "waiting": 0, "completed": 12, "failed": 0 },
        "reportQueue": { "active": 0, "waiting": 0, "completed": 5, "failed": 0 }
      }
    }
  },
  "timestamp": "2026-08-11T01:00:00.000Z",
  "uptime": 342.15
}
```

#### Example C: Database Unhealthy (HTTP 503)
```json
{
  "status": "unhealthy",
  "checks": {
    "database": {
      "status": "unhealthy",
      "latencyMs": 1005,
      "error": "connect ECONNREFUSED 127.0.0.1:5432"
    },
    "redis": {
      "status": "healthy",
      "latencyMs": 2,
      "details": { "command": "PING" }
    },
    "storage": {
      "status": "healthy",
      "latencyMs": 12,
      "details": { "provider": "MinIO/S3", "buckets": ["uploads", "reports"] }
    },
    "queue": {
      "status": "healthy",
      "latencyMs": 6,
      "details": {
        "uploadQueue": { "active": 0, "waiting": 0, "completed": 0, "failed": 0 },
        "reportQueue": { "active": 0, "waiting": 0, "completed": 0, "failed": 0 }
      }
    }
  },
  "timestamp": "2026-08-11T01:00:00.000Z",
  "uptime": 342.15
}
```

---

## 6. Implementation Blueprint for Implementer

### 6.1 Refactoring `apps/server/src/utils/health.ts`
1. Import `getPgPool` from `../db/postgres`.
2. Import `getRedisClient` from `../db/redis`.
3. Import `getS3Client` and `HeadBucketCommand` from `@aws-sdk/client-s3` (or storage helper).
4. Import `getUploadQueue` from `../jobs/upload-worker`.
5. Import `getReportQueue` from `../jobs/report-worker`.
6. Implement `checkDatabase()`, `checkRedis()`, `checkStorage()`, and `checkQueue()`.
7. Update `performHealthChecks(env)` to invoke all four probes concurrently via `Promise.all` or sequential checks, compute overall status, and return `HealthCheckResult`.

### 6.2 Unit Testing Blueprint (`apps/server/src/utils/health.test.ts`)
Create mock-based vitest test suite covering:
1. All checks passing -> returns `status: "healthy"` and HTTP 200.
2. DB query throwing error -> returns `database.status: "unhealthy"`, overall `status: "unhealthy"`, HTTP 503.
3. Redis ping throwing error -> returns `redis.status: "unhealthy"`, overall `status: "unhealthy"`, HTTP 503.
4. Storage HeadBucket throwing error -> returns `storage.status: "degraded"`, overall `status: "degraded"`, HTTP 200.
5. Queue getJobCounts throwing error -> returns `queue.status: "degraded"`, overall `status: "degraded"`, HTTP 200.
