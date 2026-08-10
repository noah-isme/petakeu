# Dispatch — Worker 2 (Milestone M2 Iteration 2.1 Timeout & Concurrency Fix)

## 2026-08-11T01:01:50Z

You are `teamwork_preview_worker_m2_2`.
Working directory: `/home/noah/project/petakeu/.agents/teamwork_preview_worker_m2_2`

## Mandatory Integrity Warning
DO NOT CHEAT. All implementations must be genuine.

## Required Implementation in `apps/server/src/utils/health.ts`

1. **Add `withTimeout` helper function**:
```ts
async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutErrorMsg: string): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new Error(timeoutErrorMsg)), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timer!);
  }
}
```

2. **Refactor `performHealthChecks` to execute probes concurrently via `Promise.all` with 5000ms timeouts**:
```ts
export async function performHealthChecks(env?: EnvConfig): Promise<HealthCheckResult> {
  const [database, redis, storage, queue] = await Promise.all([
    withTimeout(checkDatabase(), 5000, 'Database health check timed out after 5000ms').catch((err: Error) => ({
      status: 'unhealthy' as const,
      error: err.message
    })),
    withTimeout(checkRedis(), 5000, 'Redis health check timed out after 5000ms').catch((err: Error) => ({
      status: 'unhealthy' as const,
      error: err.message
    })),
    withTimeout(checkStorage(), 5000, 'Storage health check timed out after 5000ms').catch((err: Error) => ({
      status: 'degraded' as const,
      error: err.message
    })),
    withTimeout(checkQueue(), 5000, 'Queue health check timed out after 5000ms').catch((err: Error) => ({
      status: 'degraded' as const,
      error: err.message
    }))
  ]);

  const checks: Record<string, ComponentHealth> = { database, redis, storage, queue };

  const dbUnhealthy = checks.database.status === 'unhealthy';
  const redisUnhealthy = checks.redis.status === 'unhealthy';
  const storageDegraded = checks.storage.status === 'degraded' || checks.storage.status === 'unhealthy';
  const queueDegraded = checks.queue.status === 'degraded' || checks.queue.status === 'unhealthy';

  let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
  if (dbUnhealthy || redisUnhealthy) {
    status = 'unhealthy';
  } else if (storageDegraded || queueDegraded) {
    status = 'degraded';
  }

  return {
    status,
    checks,
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  };
}
```

3. **Verify Build & Tests**:
- `pnpm --filter @petakeu/server build`
- `pnpm --filter @petakeu/server test src/utils/health.test.ts`

Save handoff report to `/home/noah/project/petakeu/.agents/teamwork_preview_worker_m2_2/handoff.md` and send message to parent when finished.
