## 2026-08-11T17:03:36Z
You are the Project Orchestrator for Petakeu.
Your working directory is: /home/noah/project/petakeu/.agents/teamwork_preview_orchestrator_3
The repository directory is: /home/noah/project/petakeu
The original user request is located at: /home/noah/project/petakeu/.agents/ORIGINAL_REQUEST.md

Please review the latest user request in /home/noah/project/petakeu/.agents/ORIGINAL_REQUEST.md (under section ## 2026-08-11T17:03:36Z) and orchestrate the implementation of the two Phase 1 MVP items:
1. Streaming chunked response for large multi-region Excel/PDF exports in the report worker (apps/server/src/jobs/report-worker.ts) using ExcelJS streaming writer / PDFKit streaming piping to MinIO without materializing a full Buffer.
2. A performance benchmarking script (e.g. scripts/benchmark-perf.ts) that measures p95 latency under load (>= 10 req/sec) distinguishing cache hits vs. cold DB queries against choropleth SLA targets (p95 < 300ms hit, < 2000ms cold), self-contained, machine-parseable.

Ensure all acceptance criteria are met, tests/typecheck/lint pass, and report completion when ready.
