# Analysis Report: Choropleth Query Parameters Wiring & Redis Caching Standardization (Features 1 & 2)

**Author**: teamwork_preview_explorer_m1_1  
**Date**: 2026-08-11  
**Target Scope**: Milestone M1 — Features 1 & 2  

---

## Executive Summary

This report provides a comprehensive analysis for implementing Feature 1 (**Choropleth Query Parameters Wiring**) and Feature 2 (**Choropleth Cache Key & Configurable TTL Standardization**) in `@petakeu/server`.

- **Feature 1**: `req.query.level` and `req.query.parent` are currently ignored in `geoController.getChoropleth` (`apps/server/src/controllers/geo-controller.ts`). The controller must extract these parameters, perform type conversion/sanitization, and pass them down into `geoService.buildChoropleth(period, options)`.
- **Feature 2**: `geoService.buildChoropleth` (`apps/server/src/services/geo-service.ts`) currently uses non-standard cache keys (`choropleth:{period}[:public][:level{N}][:parent{P}]`), a hardcoded TTL of 300 seconds, and keyPrefix `'geo'`, which produces a key prefix mismatch with `invalidateCacheByPrefix('geo:choropleth')`. The cache key format must be standardized to `choropleth:{period}:{level}:{parent}` (with `:public` modifier when public mode is enabled), keyPrefix updated to `'petakeu:geo'`, and TTL driven by `CHOROPLETH_CACHE_TTL` (default `300`) configured in `apps/server/src/config/env.ts`.

---

## 1. Feature 1 Analysis: Wiring Query Parameters in `geo-controller.ts`

### 1.1 Current Implementation Observation

**File**: `apps/server/src/controllers/geo-controller.ts` (Lines 1–16)

```typescript
import { Request, Response } from "express";

import { geoService } from "../services/geo-service";
import { asyncHandler } from "../utils/async-handler";

const getChoropleth = asyncHandler(async (req: Request, res: Response) => {
  const period = (req.query.period as string) ?? "2025-08";
  const publicMode = req.query.public === "1" || req.query.public === "true";
  const payload = await geoService.buildChoropleth(period, { publicMode });
  res.json(payload);
});

export const geoController = {
  getChoropleth
};
```

### 1.2 Deficiencies Identified
1. **Ignored Query Parameters**: Express `req.query` may contain `level` (e.g. `?level=2`) and `parent` (e.g. `?parent=1100-uuid`). Neither parameter is read or parsed.
2. **Incomplete Options Object**: Line 9 calls `geoService.buildChoropleth(period, { publicMode })`. Even though `geoService.buildChoropleth` already supports `level?: number; parent?: string` in its type signature, `geo-controller` fails to forward them.

### 1.3 Proposed Controller Changes

```typescript
import { Request, Response } from "express";

import { geoService } from "../services/geo-service";
import { asyncHandler } from "../utils/async-handler";

const getChoropleth = asyncHandler(async (req: Request, res: Response) => {
  const period = (req.query.period as string) ?? "2025-08";
  const publicMode = req.query.public === "1" || req.query.public === "true";

  // Feature 1: Extract level and parent query parameters
  const rawLevel = req.query.level ? Number(req.query.level) : undefined;
  const level = rawLevel !== undefined && !isNaN(rawLevel) ? rawLevel : undefined;
  const parent = req.query.parent ? String(req.query.parent) : undefined;

  const payload = await geoService.buildChoropleth(period, {
    publicMode,
    level,
    parent,
  });

  res.json(payload);
});

export const geoController = {
  getChoropleth
};
```

---

## 2. Feature 2 Analysis: Cache Key Standardization & Configurable TTL

### 2.1 Current Implementation Observation

**File**: `apps/server/src/services/geo-service.ts` (Lines 47–64, 178–188)

```typescript
function buildCacheKey(period: string, options: { publicMode?: boolean; level?: number; parent?: string } = {}): string {
  const parts = ['choropleth', period];
  if (options.publicMode) parts.push('public');
  if (options.level) parts.push(`level${options.level}`);
  if (options.parent) parts.push(`parent${options.parent}`);
  return parts.join(':');
}

export async function buildChoropleth(
  period: string,
  options: { publicMode?: boolean; level?: number; parent?: string } = {}
): Promise<ChoroplethResponse> {
  const cacheKey = buildCacheKey(period, options);
  ...
  return getCached<ChoroplethResponse>(
    cacheKey,
    async () => { ... },
    { ttl: 300, keyPrefix: 'geo' }
  );
}

export async function invalidateChoroplethCache(): Promise<void> {
  await invalidateCacheByPrefix('geo:choropleth');
  logger.info('Choropleth cache invalidated');
}
```

### 2.2 Deficiencies & Discrepancies Identified

1. **Non-Standard Cache Key Format**:
   - Existing: `choropleth:{period}[:public][:level{level}][:parent{parent}]` (e.g. `choropleth:2025-08:level2:parent1100`).
   - Contract Specification: `choropleth:{period}:{level}:{parent}` (prefixed with `petakeu:geo:` in Redis).
   - Position-based default values (e.g., `'all'`) should be used when `level` or `parent` is omitted to maintain contract consistency: `choropleth:{period}:{level|all}:{parent|all}`.
   - When `publicMode` is true, `:public` is appended to prevent private/public mode data leak in cached payloads.

2. **Prefix Discrepancy & Invalidation Bug**:
   - In `redis.ts` (Line 44), `getCached` constructs `fullKey = `${options.keyPrefix || 'petakeu'}:${key}`;`.
   - Passing `keyPrefix: 'geo'` results in Redis key `geo:choropleth:...` (without `petakeu:` namespace).
   - In `redis.ts` (Line 71), `invalidateCache` constructs `fullPattern = `petakeu:${pattern}*`;`.
   - Calling `invalidateCacheByPrefix('geo:choropleth')` searches for pattern `petakeu:geo:choropleth*`.
   - **Critical Bug**: `geo:choropleth:...` does NOT match pattern `petakeu:geo:choropleth*`! As a result, `invalidateChoroplethCache()` fails to delete cached entries.
   - **Resolution**: `keyPrefix` passed to `getCached` must be `'petakeu:geo'`.

3. **Hardcoded TTL**:
   - `buildChoropleth` hardcodes `{ ttl: 300 }`.
   - `apps/server/src/config/env.ts` lacks `CHOROPLETH_CACHE_TTL` configuration.

### 2.3 Proposed `env.ts` Changes

**File**: `apps/server/src/config/env.ts`

```typescript
export interface EnvConfig {
  port: number;
  nodeEnv: string;
  databaseUrl?: string;
  redisUrl?: string;
  authSecret?: string;
  authDisabled: boolean;
  storageEndpoint: string;
  storageAccessKey: string;
  storageSecretKey: string;
  storageRegion: string;
  storageBucket: string;
  storageReportsBucket: string;
  choroplethCacheTtl: number; // Added for Feature 2
}

export function loadEnv(): EnvConfig {
  return {
    ...
    choroplethCacheTtl: Number(process.env.CHOROPLETH_CACHE_TTL ?? 300),
  };
}
```

### 2.4 Proposed `geo-service.ts` Changes

```typescript
import { loadEnv } from '../config/env';

const env = loadEnv();

function buildCacheKey(period: string, options: { publicMode?: boolean; level?: number; parent?: string } = {}): string {
  const levelStr = options.level !== undefined ? options.level : 'all';
  const parentStr = options.parent || 'all';
  const baseKey = `choropleth:${period}:${levelStr}:${parentStr}`;
  return options.publicMode ? `${baseKey}:public` : baseKey;
}

export async function buildChoropleth(
  period: string,
  options: { publicMode?: boolean; level?: number; parent?: string } = {}
): Promise<ChoroplethResponse> {
  const cacheKey = buildCacheKey(period, options);
  const startTime = Date.now();

  return getCached<ChoroplethResponse>(
    cacheKey,
    async () => {
      ...
    },
    { ttl: env.choroplethCacheTtl, keyPrefix: 'petakeu:geo' }
  );
}
```

---

## 3. Swagger Route Documentation Update

**File**: `apps/server/src/routes/v1/geo.ts`

Update Swagger JSDoc comments to document `level` and `parent` query parameters:

```typescript
*       - name: level
*         in: query
*         schema:
*           type: integer
*         description: Region level filter (1=province, 2=regency/city, 3=district, 4=village)
*       - name: parent
*         in: query
*         schema:
*           type: string
*         description: Parent region ID filter
```

---

## 4. Summary of Key Specifications & Contracts

| Parameter / Field | Source / Setting | Default / Value | Resulting Key / Effect |
|---|---|---|---|
| Query `level` | `req.query.level` | `undefined` | Filter regions by administrative level in SQL query |
| Query `parent` | `req.query.parent` | `undefined` | Filter regions by parent ID in SQL query |
| Cache Key Format | `geo-service.ts` `buildCacheKey()` | `choropleth:{period}:{level}:{parent}` | e.g. `choropleth:2025-08:2:all` |
| Redis Full Key | `redis.ts` `getCached()` | Prefix: `petakeu:geo` | `petakeu:geo:choropleth:2025-08:2:all` |
| Cache TTL | `env.ts` `CHOROPLETH_CACHE_TTL` | 300 seconds | Sets Redis EX expiration time |
| Invalidation Pattern | `invalidateChoroplethCache()` | `petakeu:geo:choropleth*` | Matches and deletes all choropleth keys on upload/cron |

---

## 5. Verification Plan & Test Strategy

1. **Unit Test Verification**:
   - Update/extend `apps/server/src/services/geo-service.test.ts` to test parameter passing (`level`, `parent`), public mode flag, and cache key generation.
   - Verify `env.choroplethCacheTtl` is respected.
2. **Integration Verification**:
   - Run `pnpm --filter @petakeu/server test` using Vitest.
3. **Redis Key Invalidation Check**:
   - Ensure keys generated match pattern `petakeu:geo:choropleth*` so `invalidateChoroplethCache()` successfully removes them when triggered by background workers or cron jobs.
