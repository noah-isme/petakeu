# Data Model Documentation

Complete reference for Petakeu's data models, entities, relationships, and API contracts.

---

## Conceptual Data Model

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           CONCEPTUAL DATA MODEL                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌──────────────┐         ┌──────────────┐         ┌──────────────┐       │
│   │   REGION     │         │   PAYMENT    │         │   UPLOAD     │       │
│   ├──────────────┤         ├──────────────┤         ├──────────────┤       │
│   │ id (PK)      │◄───────▶│ id (PK)      │         │ id (PK)      │       │
│   │ code_bps (UK)│         │ region_idFK  │         │ filename     │       │
│   │ name         │         │ period       │         │ mimetype     │       │
│   │ level        │         │ amount       │         │ size         │       │
│   │ parent_idFK  │         │ source       │         │ status       │       │
│   │ geom         │         │ meta (JSONB) │         │ hash (UK)    │       │
│   │ created_at   │         │ created_at   │         │ storage_path │       │
│   │ updated_at   │         │ updated_at   │         │ error_count  │       │
│   └──────────────┘         └──────────────┘         │ errors(JSONB)│       │
│          ▲                       ▲                   │ created_at   │       │
│          │                       │                   │ updated_at   │       │
│          │                       │                   └──────────────┘       │
│          │                       │                         ▲              │
│          │                       │                         │              │
│          │              ┌────────┴────────┐                 │              │
│          │              │                 │                 │              │
│          ▼              ▼                 ▼                 ▼              │
│   ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐     │
│   │  MV_PAYMENTS │ │   REPORT     │ │  USER/ROLE   │ │  AUDIT_LOG   │     │
│   │  _WITH_CUT   │ │              │ │  (Planned)   │ │  (Planned)   │     │
│   ├──────────────┤ ├──────────────┤ ├──────────────┤ ├──────────────┤     │
│   │ region_idFK  │ │ id (PK)      │ │ id (PK)      │ │ id (PK)      │     │
│   │ period       │ │ period       │ │ email (UK)   │ │ timestamp    │     │
│   │ amount       │ │ region_ids[] │ │ passwordHash │ │ user_idFK    │     │
│   │ cut_amount   │ │ format       │ │ roles[]      │ │ action       │     │
│   │ net_amount   │ │ status       │ │ regionScope[]│ │ resource     │     │
│   │ class_index  │ │ downloadUrl  │ │ created_at   │ │ resourceId   │     │
│   │ bins (JSONB) │ │ requestedAt  │ │ updated_at   │ │ detailsJSONB │     │
│   └──────────────┘ │ expiresAt    │ └──────────────┘ │ ip           │     │
│                    │ summaryJSONB │                  │ userAgent    │     │
│                    └──────────────┘                  └──────────────┘     │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Entity Definitions

### 1. Region

**Purpose**: Indonesian administrative regions with geospatial boundaries

**Table**: `regions`

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `id` | `UUID` | `PK` | Unique identifier (gen_random_uuid()) |
| `code_bps` | `TEXT` | `UNIQUE NOT NULL` | BPS statistical code (e.g., "3171", "3374") |
| `name` | `TEXT` | `NOT NULL` | Official region name |
| `level` | `SMALLINT` | `NOT NULL CHECK (1-4)` | 1=Province, 2=Regency/City, 3=District, 4=Village |
| `parent_id` | `UUID` | `FK → regions.id` | Parent region (NULL for provinces) |
| `geom` | `GEOMETRY(MultiPolygon, 4326)` | `NOT NULL` | PostGIS geometry in WGS84 |
| `created_at` | `TIMESTAMPTZ` | `DEFAULT NOW()` | Creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | `DEFAULT NOW()` | Last update timestamp |

**Indexes**:
- `regions_level_idx` ON `level`
- `regions_geom_idx` ON `geom USING GIST`

**Hierarchy Example**:
```
Province (level=1)
  └── Regency (level=2, parent_id=province)
       └── District (level=3, parent_id=regency)
            └── Village (level=4, parent_id=district)
```

**API Representation**:
```typescript
interface Region {
  id: string;           // UUID
  code: string;         // code_bps
  name: string;
  level: "province" | "regency" | "district" | "village";
  parentId: string | null;
}
```

---

### 2. Payment

**Purpose**: Individual payment records from Excel uploads

**Table**: `payments`

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `id` | `UUID` | `PK` | Unique identifier |
| `region_id` | `UUID` | `NOT NULL FK → regions.id` | Region reference |
| `period` | `DATE` | `NOT NULL` | First day of month (e.g., 2025-08-01) |
| `amount` | `NUMERIC(18,2)` | `NOT NULL CHECK (>=0)` | Gross amount in IDR |
| `source` | `TEXT` | `NOT NULL` | "PAD", "DBH", "DAU", "DAK", "Lainnya" |
| `meta` | `JSONB` | `DEFAULT '{}'` | Sheet name, row number, original values |
| `created_at` | `TIMESTAMPTZ` | `DEFAULT NOW()` | Creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | `DEFAULT NOW()` | Last update timestamp |

**Indexes**:
- `payments_unique_period` ON `(region_id, period, source)` UNIQUE
- `payments_period_idx` ON `period`

**Upsert Logic**:
```sql
INSERT INTO payments (region_id, period, amount, source, meta)
VALUES ($1, $2, $3, $4, $5)
ON CONFLICT (region_id, period, source) DO UPDATE SET
  amount = EXCLUDED.amount,
  meta = EXCLUDED.meta,
  updated_at = NOW();
```

**API Representation**:
```typescript
interface Payment {
  id: string;
  regionId: string;
  period: string;        // YYYY-MM
  amount: number;
  source: string;
  meta: Record<string, unknown>;
}
```

---

### 3. Upload

**Purpose**: Track Excel file uploads, processing status, and validation errors

**Table**: `uploads`

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `id` | `UUID` | `PK` | Unique identifier (upload_id) |
| `filename` | `TEXT` | `NOT NULL` | Original filename |
| `mimetype` | `TEXT` | `NOT NULL` | MIME type |
| `size` | `BIGINT` | `NOT NULL` | File size in bytes |
| `status` | `TEXT` | `NOT NULL DEFAULT 'queued'` | `queued`, `processing`, `parsed`, `failed` |
| `hash` | `TEXT` | `UNIQUE NOT NULL` | SHA-256 for deduplication |
| `storage_path` | `TEXT` | `NOT NULL` | MinIO/S3 object path |
| `error_count` | `INTEGER` | `DEFAULT 0` | Number of validation errors |
| `errors` | `JSONB` | | Array of `{row, column, message}` |
| `created_at` | `TIMESTAMPTZ` | `DEFAULT NOW()` | Upload timestamp |
| `updated_at` | `TIMESTAMPTZ` | `DEFAULT NOW()` | Last status update |

**Status Transitions**:
```
queued ──(1.5s)──▶ processing ──(2s)──▶ parsed
                              │
                              └──(on error)──▶ failed
```

**Error JSON Structure**:
```json
[
  {"row": 12, "column": "nominal", "message": "Nilai negatif tidak diperbolehkan"},
  {"row": 25, "column": "periode", "message": "Format periode harus YYYY-MM"}
]
```

**API Representation**:
```typescript
interface UploadRecord {
  uploadId: string;
  filename: string;
  status: "queued" | "processing" | "parsed" | "failed";
  errorCount: number;
  createdAt: string;
  updatedAt: string;
  fileUrl: string | null;
  errors?: UploadErrorDetail[];
}

interface UploadErrorDetail {
  row: number;
  column: string;
  message: string;
}
```

---

### 4. Report

**Purpose**: Asynchronous report generation jobs

**Table**: `reports`

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `id` | `UUID` | `PK` | Unique identifier (job_id) |
| `period` | `TEXT` | `NOT NULL` | Report period (YYYY-MM) |
| `region_ids` | `UUID[]` | `NOT NULL` | Array of region IDs |
| `format` | `TEXT` | `NOT NULL CHECK IN ('pdf','excel')` | Output format |
| `status` | `TEXT` | `DEFAULT 'queued'` | `queued`, `processing`, `completed`, `failed` |
| `download_url` | `TEXT` | | Presigned URL (24h TTL) |
| `requested_at` | `TIMESTAMPTZ` | `DEFAULT NOW()` | Job creation time |
| `updated_at` | `TIMESTAMPTZ` | `DEFAULT NOW()` | Last status update |
| `expires_at` | `TIMESTAMPTZ` | | URL expiration timestamp |
| `summary` | `JSONB` | | Report summary data |

**Status Transitions**:
```
queued ──(2s)──▶ processing ──(3s)──▶ completed ──(24h)──▶ expired
                              │
                              └──(on error)──▶ failed
```

**Summary JSON Structure**:
```json
{
  "totalsByRegion": [
    {"regionId": "...", "regionName": "Jakarta", "total": 1000000000, "changePercentage": 5.2}
  ],
  "topGainers": [...],
  "topDecliners": [...],
  "lastTwelveMonths": [
    {"period": "2024-09", "total": 950000000},
    {"period": "2024-10", "total": 1000000000}
  ]
}
```

**API Representation**:
```typescript
interface ReportJob {
  jobId: string;
  period: string;
  regionIds: string[];
  format: "pdf" | "excel";
  status: "queued" | "processing" | "completed" | "failed";
  downloadUrl: string | null;
  requestedAt: string;
  updatedAt: string;
  expiresAt: string | null;
  expired: boolean;
  summary: ReportSummary;
}
```

---

### 5. Materialized View: mv_payments_with_cut

**Purpose**: Pre-aggregated payments with 15% cut and quantile classification for fast choropleth queries

**View**: `mv_payments_with_cut`

| Field | Type | Description |
|-------|------|-------------|
| `region_id` | `UUID` | Region identifier |
| `period` | `DATE` | Month (first day) |
| `amount` | `NUMERIC(18,2)` | Total gross amount |
| `cut_amount` | `NUMERIC(18,2)` | 15% of amount |
| `net_amount` | `NUMERIC(18,2)` | Amount after 15% cut |
| `class_index` | `INTEGER` | Quantile class (0-4) |
| `bins` | `JSONB` | Quantile boundaries for legend |

**Bin Structure**:
```json
[
  {"index": 0, "min": 0, "max": 50000000},
  {"index": 1, "min": 50000000, "max": 150000000},
  {"index": 2, "min": 150000000, "max": 300000000},
  {"index": 3, "min": 300000000, "max": 600000000},
  {"index": 4, "min": 600000000, "max": 2000000000}
]
```

**Refresh Strategy**:
- `REFRESH MATERIALIZED VIEW CONCURRENTLY mv_payments_with_cut;`
- After successful upload parsing
- Daily cron at 02:00 WIB
- On-demand via admin API

**Unique Index**: `(region_id, period)` - required for concurrent refresh

---

### 6. User & Role (Planned)

**Table**: `users`

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `id` | `UUID` | `PK` | Unique identifier |
| `email` | `TEXT` | `UNIQUE NOT NULL` | Login email |
| `password_hash` | `TEXT` | `NOT NULL` | Bcrypt hash |
| `full_name` | `TEXT` | `NOT NULL` | Display name |
| `roles` | `TEXT[]` | `NOT NULL DEFAULT '{}'` | `['admin']`, `['operator']`, `['viewer']` |
| `region_scope` | `UUID[]` | | Region IDs (for operator scoping) |
| `is_active` | `BOOLEAN` | `DEFAULT true` | Account status |
| `last_login` | `TIMESTAMPTZ` | | Last successful login |
| `created_at` | `TIMESTAMPTZ` | `DEFAULT NOW()` | Creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | `DEFAULT NOW()` | Last update timestamp |

**Role Definitions**:
| Role | Description | Permissions |
|------|-------------|-------------|
| `admin` | Pemprov Administrator | Full system access, user management |
| `operator` | BPKAD/Bappeda Staff | Upload, reports, scoped regions |
| `viewer` | Read-only stakeholder | Choropleth, summaries, public reports |

---

### 7. Audit Log (Planned)

**Table**: `audit_log`

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| `id` | `UUID` | `PK` | Unique identifier |
| `timestamp` | `TIMESTAMPTZ` | `NOT NULL DEFAULT NOW()` | Event timestamp |
| `user_id` | `UUID` | `FK → users.id` | Acting user (NULL for system) |
| `action` | `TEXT` | `NOT NULL` | `create`, `read`, `update`, `delete`, `login`, `logout`, `upload`, `report` |
| `resource` | `TEXT` | `NOT NULL` | `region`, `payment`, `upload`, `report`, `user`, `config` |
| `resource_id` | `UUID` | | Affected resource ID |
| `details` | `JSONB` | | Before/after values, metadata |
| `ip_address` | `INET` | | Client IP |
| `user_agent` | `TEXT` | | Client user agent |

---

## API Data Contracts

### Request/Response Types

#### Regions API
```typescript
// GET /api/regions
interface RegionsResponse {
  data: Region[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

// GET /api/regions/:id/summary
interface RegionSummaryResponse {
  region: Region;
  totalAmount: number;
  cut15Amount: number;
  netAmount: number;
  trend: { period: string; amount: number }[];
  monthlyBreakdown: {
    period: string;
    amount: number;
    cut15Amount: number;
    netAmount: number;
  }[];
  lastUpdated: string;
  reportUrl: string;
}
```

#### Geography API
```typescript
// GET /api/geo/choropleth
interface ChoroplethResponse {
  type: "FeatureCollection";
  features: ChoroplethFeature[];
  metadata: {
    period: string;
    legend: LegendDefinition;
    public: boolean;
    warnings?: string[];
    scenario?: string;
  };
}

interface ChoroplethFeature {
  type: "Feature";
  id: string;
  geometry: GeoJSON.MultiPolygon | GeoJSON.Polygon;
  properties: {
    regionId: string;
    name: string;
    centroid: [number, number];
    classIndex: number;
    classLabel: string;
    value?: number;
    normalizedValue?: number;
    sparkline?: number[];
  };
}

interface LegendDefinition {
  method: "quantile";
  bins: number[];
  labels: string[];
  ranges: { min: number; max: number; label: string }[];
}
```

#### Upload API
```typescript
// POST /api/uploads
interface UploadResponse {
  uploadId: string;
  status: string;
  hash: string;
}

// GET /api/uploads
interface UploadsResponse {
  data: UploadRecord[];
}
```

#### Report API
```typescript
// POST /api/reports/export
interface ReportRequest {
  regionId: string;
  periodFrom: string;  // YYYY-MM
  periodTo: string;    // YYYY-MM
  format: "pdf" | "excel";
}

interface ReportJobResponse {
  jobId: string;
}

// GET /api/reports
interface ReportsResponse {
  data: ReportJob[];
}
```

#### Fiscal API (Extended)
```typescript
// GET /api/rank
interface RankingResponse {
  data: RankingItem[];
}

interface RankingItem {
  regionId: string;
  regionName: string;
  target: number;
  realization: number;
  percentage: number;
  yoy: number;
  rank: number;
}

// GET /api/surplus-defisit
interface SurplusDeficitResponse {
  data: SurplusDeficitItem[];
}

interface SurplusDeficitItem {
  regionId: string;
  regionName: string;
  surplus: number;
  deficit: number;
  ytd: number;
}
```

---

## Data Flow Summary

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────────┐
│   Excel     │────▶│   Upload    │────▶│  Payments   │────▶│ mv_payments_    │
│   File      │     │   Record    │     │   Table     │     │ with_cut (MV)   │
└─────────────┘     └─────────────┘     └─────────────┘     └────────┬────────┘
                                                                       │
                                              ┌────────────────────────┘
                                              ▼
                                    ┌─────────────────┐
                                    │  Choropleth API │
                                    │ /api/geo/...    │
                                    └────────┬────────┘
                                             │
                        ┌────────────────────┼────────────────────┐
                        ▼                    ▼                    ▼
                  ┌──────────┐         ┌──────────┐         ┌──────────┐
                  │  Map     │         │  Region  │         │  Legend  │
                  │  View    │         │  Detail  │         │  Component│
                  └──────────┘         └──────────┘         └──────────┘
```

---

## Validation Rules Summary

| Entity | Rule |
|--------|------|
| Region | `code_bps` unique, `level` 1-4, `geom` valid MultiPolygon |
| Payment | `amount` >= 0, `period` valid date, `source` non-empty, unique per region/period/source |
| Upload | `.xlsx` only, ≤10MB, SHA-256 unique, required headers |
| Report | `region_ids` exist, `periodFrom` <= `periodTo`, valid format |
| User | `email` unique, valid bcrypt hash, at least one role |

---

## Versioning & Migration Notes

| Version | Changes |
|---------|---------|
| 1.0 (v1) | Initial schema: regions, payments, uploads, reports, MV |
| 1.1 (planned) | Add users, roles, audit_log tables |
| 1.2 (planned) | Add partition to payments by period |
| 2.0 (future) | Historical boundary changes table |

---

## References

- [Database Schema Documentation](./database-schema.md) - Full SQL definitions
- [API Documentation](./api/openapi.yaml) - OpenAPI 3.1 specification
- [ADR-005](./adr/005-postgis-for-geospatial-data.md) - PostGIS decision
- [ADR-006](./adr/006-materialized-view-for-aggregations.md) - MV decision