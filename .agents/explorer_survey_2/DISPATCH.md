## 2026-08-11T17:04:46Z
You are Survey Explorer 2 for Petakeu.
Your working directory is: /home/noah/project/petakeu/.agents/explorer_survey_2
The repository directory is: /home/noah/project/petakeu
The original user request is located at: /home/noah/project/petakeu/.agents/ORIGINAL_REQUEST.md

MUST READ: Read /home/noah/project/petakeu/.agents/ORIGINAL_REQUEST.md before starting.

Your task:
Investigate Requirement R2 (Performance Benchmarking Script):
1. Locate and examine the choropleth API routes and controllers (e.g., `apps/server/src/routes/v1/geo.ts` or similar `/api/geo/choropleth` endpoints).
2. Examine how Redis caching works for choropleth (`choropleth:{period}:{level}:{parent}`) and how cache hits vs cold DB queries can be triggered or differentiated by a benchmark script.
3. Check if there are any existing benchmarking scripts, helpers, or performance utilities in `scripts/` or `apps/server/scripts/`.
4. Determine the exact requirements for a self-contained TypeScript benchmarking script (e.g., `scripts/benchmark-perf.ts` executed via `npx tsx scripts/benchmark-perf.ts`):
   - Concurrency handling (≥ 10 req/sec load generation in Node/TS without external dependencies like k6).
   - Measuring p95 latency accurately for cache-hit and cold-miss scenarios.
   - SLA verification (hit < 300ms, cold < 2000ms) with PASS/FAIL verdict.
   - Command-line arguments / `--help` flag handling (e.g. using `util.parseArgs` or standard CLI parser).
   - Machine-parseable JSON output option.
5. Write a comprehensive report to `/home/noah/project/petakeu/.agents/explorer_survey_2/handoff.md` with your findings, evidence, and recommended design for R2.
