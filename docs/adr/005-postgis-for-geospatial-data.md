# ADR-005: PostGIS for Geospatial Data

## Status
Accepted

## Context
Petakeu's core feature is an interactive choropleth map showing regional payment data. This requires storing, querying, and serving geospatial data (region boundaries) alongside tabular payment data.

## Decision
Use PostgreSQL with PostGIS extension as the primary database for all data, including geospatial.

## Consequences

### Positive
- **Single database**: No polyglot persistence, simpler operations
- **ACID transactions**: Consistency between spatial and tabular data
- **Rich spatial SQL**: `ST_Contains`, `ST_Intersects`, `ST_Distance`, `ST_AsGeoJSON`
- **Spatial indexes**: GiST indexes for fast spatial queries
- **Standard format**: GeoJSON output directly from SQL
- **Mature ecosystem**: 20+ years, used by OpenStreetMap, Carto, etc.
- **Managed service support**: AWS RDS, GCP Cloud SQL, Azure all support PostGIS

### Negative
- **Heavier than plain PostgreSQL**: More memory, CPU for spatial operations
- **Learning curve**: Spatial SQL differs from standard SQL
- **Migration complexity**: Schema changes with geometry columns
- **Backup size**: Geometry data increases backup size

### Neutral
- Geometry stored as `GEOMETRY(MultiPolygon, 4326)` (WGS84)
- GiST index on `regions.geom` for spatial queries
- `ST_AsGeoJSON()` used for API responses
- Shapefile import via `shp2pgsql` for initial data load

## Alternatives Considered

### 1. PostgreSQL + Separate GIS (GeoServer/MapServer)
- **Pros**: Specialized WMS/WFS, advanced cartography
- **Cons**: Additional infrastructure, sync complexity, overkill

### 2. MongoDB with Geospatial Indexes
- **Pros**: Document model, native GeoJSON
- **Cons**: No PostGIS equivalent, weaker spatial operations, no ACID

### 3. Elasticsearch with Geo Shapes
- **Pros**: Full-text + spatial, fast aggregation
- **Cons**: Not primary DB, eventual consistency, cost

### 4. Flat Files (GeoJSON) + CDN
- **Pros**: Simple, cacheable, no DB
- **Cons**: No spatial queries, no dynamic filtering, sync issues

### 5. BigQuery / Snowflake (Cloud Data Warehouse)
- **Pros**: Massive scale, SQL interface
- **Cons**: Latency, cost, not for transactional workloads

## Related Decisions
- ADR-004: Technology Stack Choices (database selection)
- ADR-006: Materialized View (aggregation strategy)

## Implementation Notes
```sql
-- Enable extension
CREATE EXTENSION IF NOT EXISTS postgis;

-- Regions table with geometry
CREATE TABLE regions (
  id UUID PRIMARY KEY,
  code_bps TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  level SMALLINT NOT NULL CHECK (level BETWEEN 1 AND 4),
  parent_id UUID REFERENCES regions(id),
  geom GEOMETRY(MultiPolygon, 4326) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Spatial index
CREATE INDEX regions_geom_idx ON regions USING GIST(geom);

-- GeoJSON output for API
SELECT ST_AsGeoJSON(geom) FROM regions WHERE id = $1;
```