# Scope: Milestone M1 (R1 - Future Period Warning Flag)

## Architecture
- Backend Service & Worker (`apps/server/src/jobs/upload-worker.ts`).
- Requirement R1: Data validation logic checks period dates against `CURRENT_DATE`. Future period payments are tagged with warning metadata (`forecast=false`) while maintaining valid data ingestion.
- SQL UPSERT: `payments` table insertion includes `meta` JSONB parameter ($5::jsonb) and updates `meta` on conflict.

## Features Owned
1. `isFuturePeriod(period: string, referenceDate: Date = new Date()): boolean` exported validator.
2. Row validation loop tagging future periods with `meta: { forecast: false }`.
3. Payment SQL bulk UPSERT updating `meta` column.
4. Unit/integration tests in `apps/server/src/jobs/upload-worker.test.ts`.

## File Write Boundaries
- Exclusive ownership:
  - `apps/server/src/jobs/upload-worker.ts`
  - `apps/server/src/jobs/upload-worker.test.ts`
  - `apps/server/src/types/upload.ts` (if needed)

## Verification
- Build: `pnpm --filter @petakeu/server build`
- Typecheck: `pnpm --filter @petakeu/server typecheck`
- Test: `pnpm --filter @petakeu/server test`
