## 2026-08-12T00:07:52Z

<USER_REQUEST>
You are Worker M1 for Petakeu.
Your working directory is: /home/noah/project/petakeu/.agents/worker_m1_1
The repository directory is: /home/noah/project/petakeu
The original user request is located at: /home/noah/project/petakeu/.agents/ORIGINAL_REQUEST.md

MUST READ: Read /home/noah/project/petakeu/.agents/ORIGINAL_REQUEST.md and Explorer M1 implementation plan at /home/noah/project/petakeu/.agents/explorer_m1_1/handoff.md before starting work.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Your file write scope (Exclusive Ownership for M1):
- `apps/server/src/db/minio.ts`
- `apps/server/src/services/storage-service.ts`
- `apps/server/src/jobs/report-worker.ts`

Your task:
Implement Requirement R1 (Streaming Export for Large Datasets):
1. In `apps/server/src/db/minio.ts`:
   - Update `uploadToS3` to accept `body: Buffer | Readable` (import `Readable` from `'stream'`).
   - Export `uploadStreamToS3(bucket: string, key: string, stream: Readable, contentType: string): Promise<string>`.
2. In `apps/server/src/services/storage-service.ts`:
   - Expose `uploadReportStream(key: string, stream: Readable, contentType: string): Promise<string>`.
   - Update `uploadReport` to accept `buffer: Buffer | Readable`.
   - Add `uploadReportStream` to `storageService` export object.
3. In `apps/server/src/jobs/report-worker.ts`:
   - Import `PassThrough`, `Writable` from `'stream'`.
   - Refactor `generateExcel` to `generateExcelStream` using `ExcelJS.stream.xlsx.WorkbookWriter({ stream, useStyles: true, useSharedStrings: false })`. Add rows and commit rows (`r.commit()`, `sheet.commit()`, `await workbook.commit()`).
   - Refactor `generatePdf` to `generatePdfStream` piping `PDFDocument` directly to `stream` (`doc.pipe(stream)`).
   - In `generateReport(job: Job)`:
     - Instantiate `passThrough = new PassThrough()`.
     - Launch stream generation and `uploadReportStream` in parallel via `Promise.all([generationPromise, uploadPromise])`.
     - If error occurs during generation, destroy stream with error (`passThrough.destroy(err)`).
     - Add code comment documenting the V8 heap memory optimization rationale.
     - Ensure summary JSON metadata (`totalsByRegion`, `top10Rankings`) and database update to `report_jobs` remain intact.
4. Run verification:
   - Run `pnpm typecheck` to confirm 0 TypeScript errors.
   - Run `pnpm lint` (ensure touched files pass ESLint cleanly).
   - Run `pnpm test` (verify unit tests pass).
   - If server and dependencies are available, run `pnpm --filter @petakeu/web test:e2e --grep "report-generation"` or verify tests pass.
5. Write your handoff report to `/home/noah/project/petakeu/.agents/worker_m1_1/handoff.md` detailing all modified files, code logic, commands executed, and verification output.

</USER_REQUEST>
