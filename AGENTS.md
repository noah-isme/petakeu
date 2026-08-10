# Agent Guidelines — Petakeu

This document defines how AI coding agents should work within the Petakeu codebase.

## Project Context

Petakeu is a GovTech monorepo (Turborepo + pnpm workspaces) for monitoring Indonesian regional fiscal revenue. It consists of:
- `apps/web` — React 18 + Vite frontend (Leaflet maps, Recharts, React Query, Tailwind CSS v4)
- `apps/server` — Express 4 + TypeScript backend (PostgreSQL + PostGIS, Redis + BullMQ, MinIO)

## Conventions

### Code Style
- TypeScript strict mode throughout
- ESLint config at root `.eslintrc.cjs`
- Prettier for formatting (`.prettierrc`)
- Run `pnpm lint` and `pnpm typecheck` before committing

### Backend Patterns
- **Router → Controller → Service → DB** layering
- Routes defined under `apps/server/src/routes/v1/`
- Services in `apps/server/src/services/`
- Database queries use raw SQL via `pg` pool (`getPgPool()`), not an ORM
- Migrations are sequential `.sql` files in `apps/server/migrations/`
- Background jobs use BullMQ workers in `apps/server/src/jobs/`
- New endpoints must be behind `requireAuth` middleware

### Frontend Patterns
- Page routes in `apps/web/src/pages/` and UI components in `apps/web/src/components/`
- API client in `apps/web/src/api/client.ts` and React Query hooks in `apps/web/src/hooks/`
- Reusable UI components in `apps/web/src/components/`
- Pages (route-level) in `apps/web/src/pages/`
- Styling: Tailwind CSS v4 with design tokens in `global.css`

### Database
- PostgreSQL 16 + PostGIS 3.4
- Tables: `regions`, `payments`, `uploads`, `report_jobs`, `_migrations`
- Materialized view: `mv_payments_with_cut` (refreshed on upload + every 15min cron)
- Always create a new migration file for schema changes (never edit existing ones)
- Run `pnpm seed:regions` to populate region data

### Testing
- E2E tests: Playwright in `apps/web/e2e/`
- Unit tests: Vitest
- Run with `pnpm test` or workspace-specific commands

## Key Documentation

- [PRD](docs/PRD.md) — Product requirements
- [Architecture](docs/ARCHITECTURE.md) — System design
- [Design](docs/DESIGN.md) — UI/UX specification
- [ADRs](docs/adr/) — Architecture decision records
- [Roadmap](docs/ROADMAP.md) — Remaining work
- [Data Model](docs/data-model.md) — Entity definitions and relationships
- [Database Schema](docs/database-schema.md) — DDL reference

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, use the installed graphify skill or instructions before doing anything else.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
