# ADR-008: BullMQ for Background Job Processing

## Status
Proposed

## Context
Petakeu has several long-running operations that should not block HTTP requests:
- Excel file parsing and validation (upload processing)
- PDF/Excel report generation
- Materialized view refresh
- Email/WhatsApp notifications
- Scheduled tasks (daily MV refresh)

## Decision
Use BullMQ (Redis-based queue) for background job processing with separate workers.

## Consequences

### Positive
- **Reliability**: Retries, exponential backoff, dead letter queues
- **Observability**: Job status, progress, metrics via Bull Board
- **Scalability**: Horizontal worker scaling, priority queues
- **Redis-based**: Leverages existing Redis infrastructure
- **TypeScript**: First-class TS support, typed jobs

### Negative
- **Additional infrastructure**: Requires Redis (already planned)
- **Operational complexity**: Worker monitoring, queue management
- **At-least-once delivery**: Idempotency required for jobs
- **Debugging**: Distributed tracing harder than synchronous

### Neutral
- Queues: `upload-processing`, `report-generation`, `notifications`, `maintenance`
- Workers: Separate processes, can run on different machines
- Job data: Minimal payload, reference IDs to DB records

## Alternatives Considered

### 1. Simple setTimeout / setInterval
- **Pros**: No dependencies
- **Cons**: No persistence, no retries, no scaling, lost on restart

### 2. Node-cron + Direct Function Calls
- **Pros**: Simple scheduling
- **Cons**: No queue semantics, no retries, blocks event loop

### 3. PostgreSQL-based Queue (pg-boss, graphile-worker)
- **Pros**: ACID, no extra infrastructure
- **Cons**: Polling overhead, less mature ecosystem

### 4. Kafka / RabbitMQ
- **Pros**: Enterprise features, high throughput
- **Cons**: Overkill, additional infrastructure, operational burden

### 5. AWS SQS / GCP Cloud Tasks
- **Pros**: Managed, serverless
- **Cons**: Vendor lock-in, cost, latency

## Related Decisions
- ADR-004: Technology Stack (Redis already selected)
- ADR-006: Materialized View (upload worker triggers refresh)
- ADR-007: JWT Auth (notification worker sends alerts)

## Implementation Notes
```typescript
// Queue setup
import { Queue, Worker } from "bullmq";
import { redis } from "./db/redis";

export const uploadQueue = new Queue("upload-processing", { connection: redis });
export const reportQueue = new Queue("report-generation", { connection: redis });
export const notificationQueue = new Queue("notifications", { connection: redis });

// Upload worker
new Worker("upload-processing", async (job) => {
  const { uploadId } = job.data;
  await uploadService.processUpload(uploadId);
  await pgPool.query("SELECT refresh_mv_payments_with_cut()");
}, { connection: redis, concurrency: 2 });

// Report worker
new Worker("report-generation", async (job) => {
  const { jobId } = job.data;
  await reportService.generateReport(jobId);
}, { connection: redis, concurrency: 1 });

// Scheduled job for daily MV refresh
import { CronJob } from "cron";
new CronJob("0 2 * * *", async () => {
  await pgPool.query("SELECT refresh_mv_payments_with_cut()");
}, null, true, "Asia/Jakarta");
```