## 2026-08-10T18:28:13Z
You are teamwork_preview_auditor (Forensic Integrity Auditor) for the Petakeu E2E Test Suite.
Your working directory is: /home/noah/project/petakeu/.agents/teamwork_preview_auditor_e2e_1

MANDATORY READ:
- Original Request: /home/noah/project/petakeu/.agents/ORIGINAL_REQUEST.md
- Global Project Architecture: /home/noah/project/petakeu/PROJECT.md
- Scope Document: /home/noah/project/petakeu/.agents/teamwork_preview_suborch_e2e/SCOPE.md
- Test Infra: /home/noah/project/petakeu/TEST_INFRA.md
- Worker Handoff: /home/noah/project/petakeu/.agents/teamwork_preview_test_writer_e2e_1/handoff.md

Target Files:
- `apps/web/e2e/choropleth-caching.spec.ts`
- `apps/web/e2e/region-summary-caching.spec.ts`
- `apps/web/e2e/report-generation.spec.ts`
- `apps/web/e2e/real-world-flow.spec.ts`

Responsibilities:
Perform rigorous forensic integrity audit on the written Playwright test suites:
1. Verify no hardcoded test shortcuts, fake passes, empty tests, or false positive assertions.
2. Verify all tests actually check real API contracts and UI states.
3. Check for any integrity violations or deceptive implementation patterns.
4. Issue a clear verdict: CLEAN or INTEGRITY VIOLATION.

Write your full forensic audit report to `/home/noah/project/petakeu/.agents/teamwork_preview_auditor_e2e_1/handoff.md` and report back via send_message.
