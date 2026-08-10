## 2026-08-10T18:22:25Z
Investigate `apps/server/src/controllers/geo-controller.ts` and `apps/server/src/services/geo-service.ts` for Features 1 & 2:
1. Feature 1: Wire `req.query.level` and `req.query.parent` in `geoController.getChoropleth` and pass them to `geoService.buildChoropleth(period, options)`.
2. Feature 2: Standardize key format in `geo-service.ts` to `choropleth:{period}:{level}:{parent}` (prefixed with `petakeu:geo:` via `redis.ts`), and add `CHOROPLETH_CACHE_TTL` (default 300) in `apps/server/src/config/env.ts`.
