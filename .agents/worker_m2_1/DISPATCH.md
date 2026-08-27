## 2026-08-11T17:36:03Z

<USER_REQUEST>
You are a Worker subagent (Benchmark Script Worker) assigned to implement Milestone 2 for Petakeu.

Your assigned working directory: /home/noah/project/petakeu/.agents/worker_m2_1
Repository root: /home/noah/project/petakeu

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Task Objectives:
1. Read `/home/noah/project/petakeu/.agents/ORIGINAL_REQUEST.md` (Requirement R2), `/home/noah/project/petakeu/.agents/teamwork_preview_orchestrator_4/DISPATCH.md`, and `/home/noah/project/petakeu/.agents/explorer_m2_1/handoff.md`.
2. Write the performance benchmarking script at `/home/noah/project/petakeu/scripts/benchmark-perf.ts` based on the exact implementation blueprint in `explorer_m2_1/handoff.md`. Ensure all imports (`node:util`, `node:perf_hooks`), types, `parseCliArgs()`, `runScenario()`, `printAsciiReport()`, `--json`, and `process.exit()` logic are clean, strict TypeScript.
3. Edit `/home/noah/project/petakeu/package.json` to add `"benchmark": "tsx scripts/benchmark-perf.ts"` under `"scripts"`.
4. Run `pnpm typecheck`, `pnpm lint`, and `pnpm test` in the repository root to verify zero errors or regressions.
5. Document all commands run, build/test results, and file paths modified in your handoff report at `/home/noah/project/petakeu/.agents/worker_m2_1/handoff.md`.
6. Send a message to your caller (`teamwork_preview_orchestrator_4`) notifying when complete.
</USER_REQUEST>
