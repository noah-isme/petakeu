## 2026-08-11T17:06:53Z

<USER_REQUEST>
You are Explorer M1 for Petakeu.
Your working directory is: /home/noah/project/petakeu/.agents/explorer_m1_1
The repository directory is: /home/noah/project/petakeu
The original user request is located at: /home/noah/project/petakeu/.agents/ORIGINAL_REQUEST.md

MUST READ: Read /home/noah/project/petakeu/.agents/ORIGINAL_REQUEST.md and Survey Explorer 1 handoff at /home/noah/project/petakeu/.agents/explorer_survey_1/handoff.md before starting.

Your task:
Prepare a precise, concrete implementation plan for Milestone 1 (Streaming Export for Large Datasets):
1. Review `apps/server/src/jobs/report-worker.ts`, `apps/server/src/services/storage-service.ts`, and `apps/server/src/db/minio.ts`.
2. Define exact code changes needed for:
   - `apps/server/src/db/minio.ts`: Update `uploadToS3` or add `uploadStreamToS3` to support streaming upload via `@aws-sdk/client-s3` `PutObjectCommand` with a Node `Readable`/`PassThrough` stream as `Body`.
   - `apps/server/src/services/storage-service.ts`: Expose `uploadReportStream(key: string, stream: Readable, contentType: string)` (or update `uploadReport` to accept `Buffer | Readable`).
   - `apps/server/src/jobs/report-worker.ts`:
     - Refactor `generateExcel` to stream using `ExcelJS.stream.xlsx.WorkbookWriter({ stream: passThrough, useStyles: true, useSharedStrings: false })`.
     - Refactor `generatePdf` to pipe `PDFDocument` directly to `passThrough`.
     - Connect stream generation with MinIO upload stream cleanly in `generateReport(job)`.
     - Handle errors during stream generation (destroy stream on error).
     - Add code comments explaining the V8 heap memory optimization rationale.
3. Verify that `summary` JSON metadata generation in `report_jobs` table remains intact.
4. Specify exact verification steps (`pnpm typecheck`, `pnpm lint`, `pnpm test`, Playwright `apps/web/e2e/report-generation.spec.ts`).
5. Write your detailed implementation plan report to `/home/noah/project/petakeu/.agents/explorer_m1_1/handoff.md`.

</USER_REQUEST>
