# Dispatch — Worker 4 (Milestone M2 Iteration 2.3 Exact Replace)

## 2026-08-11T01:02:05Z

You are `teamwork_preview_worker_m2_4`.
Working directory: `/home/noah/project/petakeu/.agents/teamwork_preview_worker_m2_4`

## Mandatory Integrity Warning
DO NOT CHEAT. All implementations must be genuine.

## Exact Tool Call Request
Call `replace_file_content` with:
- TargetFile: `/home/noah/project/petakeu/apps/server/src/utils/health.ts`
- StartLine: 136
- EndLine: 162
- TargetContent:
```ts
export async function performHealthChecks(env?: EnvConfig): Promise<HealthCheckResult> {
  const checks: Record<string, ComponentHealth> = {};

  checks.database = await checkDatabase();
  checks.redis = await checkRedis();
  checks.storage = await checkStorage();
  checks.queue = await checkQueue();

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
- ReplacementContent:
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

Run build & test:
`pnpm --filter @petakeu/server build && pnpm --filter @petakeu/server test src/utils/health.test.ts`
Write report to `/home/noah/project/petakeu/.agents/teamwork_preview_worker_m2_4/handoff.md`.
