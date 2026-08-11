import { Job, Queue, QueueEvents, Worker } from 'bullmq';
import { schedule } from 'node-cron';

import {
  enqueueScheduledReport,
  getScheduledReport,
  getScheduledReportEmailJobId,
  getScheduledReportQueueJobId,
  type ScheduledReportDatabase,
  type ScheduledReportQueue,
  type ScheduledReportQueueOptions,
} from '../services/scheduled-report-service';
import {
  createReportEmailDispatcher,
  dispatchCompletedReportEmail,
  type ReportEmailDispatcher,
  type ReportEmailDispatcherDependencies,
} from '../services/report-email-service';
import { logger } from '../utils/logger';

import { getReportQueue } from './report-worker';

import type {
  ScheduledReportCadence,
  ScheduledReportConfig,
  ScheduledReportEmailJobData,
  ScheduledReportJobData,
} from '../types/scheduled-report';

const REPORT_QUEUE_NAME = 'report-generation';
const REPORT_EMAIL_QUEUE_NAME = 'report-email-dispatch';

export interface ScheduledTaskLike {
  stop(): void | Promise<void>;
  destroy?(): void | Promise<void>;
}

export type ScheduleFunction = (
  expression: string,
  handler: () => Promise<void>,
  options: { timezone: string; noOverlap: boolean }
) => ScheduledTaskLike;

export interface ReportGenerationLookupQueue extends ScheduledReportQueue {
  getJob(jobId: string): Promise<{ data?: Partial<ScheduledReportJobData> } | undefined>;
}

export interface ScheduledReportEmailQueue {
  add(
    name: string,
    data: ScheduledReportEmailJobData,
    options: ScheduledReportQueueOptions
  ): Promise<unknown>;
  close?(): Promise<void>;
}

export interface ReportQueueEventsLike {
  on(event: 'completed', handler: (event: { jobId: string }) => void): this;
  on(event: 'error', handler: (error: Error) => void): this;
  close(): Promise<void>;
}

export interface ReportEmailWorkerLike {
  on(event: 'failed', handler: (job: { id?: string } | undefined, error: Error) => void): this;
  on(event: 'error', handler: (error: Error) => void): this;
  close(): Promise<void>;
}

export interface ScheduleRegistration {
  tasks: ScheduledTaskLike[];
  close(): Promise<void>;
}

export interface ScheduledReportRuntimeDependencies {
  schedule?: ScheduleFunction;
  generationQueue?: ReportGenerationLookupQueue;
  emailQueue?: ScheduledReportEmailQueue;
  queueEvents?: ReportQueueEventsLike;
  emailWorker?: ReportEmailWorkerLike;
  db?: ScheduledReportDatabase;
  now?: () => Date;
  emailDispatcher?: ReportEmailDispatcher;
  emailDependencies?: ReportEmailDispatcherDependencies;
}

export type ScheduledReportTrigger = (
  cadence: ScheduledReportCadence
) => Promise<unknown>;

function redisConnection() {
  return { url: process.env.REDIS_URL ?? 'redis://localhost:6379' };
}

function defaultGenerationQueue(): ReportGenerationLookupQueue {
  return getReportQueue() as unknown as ReportGenerationLookupQueue;
}

function defaultEmailQueue(): ScheduledReportEmailQueue {
  return new Queue(REPORT_EMAIL_QUEUE_NAME, {
    connection: redisConnection(),
  }) as unknown as ScheduledReportEmailQueue;
}

function defaultQueueEvents(): ReportQueueEventsLike {
  return new QueueEvents(REPORT_QUEUE_NAME, {
    connection: redisConnection(),
  }) as unknown as ReportQueueEventsLike;
}

function defaultEmailWorker(
  processor: (job: Job<ScheduledReportEmailJobData>) => Promise<void>
): ReportEmailWorkerLike {
  return new Worker(REPORT_EMAIL_QUEUE_NAME, processor, {
    connection: redisConnection(),
    concurrency: 1,
  }) as unknown as ReportEmailWorkerLike;
}

export function registerScheduledReportSchedules(
  config: ScheduledReportConfig,
  trigger: ScheduledReportTrigger,
  dependencies: Pick<ScheduledReportRuntimeDependencies, 'schedule'> = {}
): ScheduleRegistration {
  if (!config.enabled) {
    return { tasks: [], close: async () => undefined };
  }

  const scheduleFunction = dependencies.schedule ?? (schedule as unknown as ScheduleFunction);
  const tasks: ScheduledTaskLike[] = [];

  for (const definition of config.schedules) {
    try {
      const task = scheduleFunction(
        definition.expression,
        async () => {
          try {
            await trigger(definition.cadence);
          } catch (error) {
            logger.error(
              { cadence: definition.cadence, err: error },
              '[scheduled-reports] Scheduled run failed'
            );
          }
        },
        { timezone: config.timezone, noOverlap: true }
      );
      tasks.push(task);
      logger.info(
        { cadence: definition.cadence, expression: definition.expression, timezone: config.timezone },
        '[scheduled-reports] Schedule registered'
      );
    } catch (error) {
      logger.error(
        { cadence: definition.cadence, expression: definition.expression, err: error },
        '[scheduled-reports] Could not register schedule'
      );
    }
  }

  return {
    tasks,
    close: async () => {
      for (const task of tasks) {
        await task.stop();
        if (task.destroy) await task.destroy();
      }
    },
  };
}

/**
 * Translate a completed report-generation event into a deterministic email
 * queue job. Manual report jobs do not carry cadence/runKey and are ignored.
 */
export async function enqueueEmailForCompletedReport(
  event: { jobId: string },
  dependencies: {
    generationQueue: ReportGenerationLookupQueue;
    emailQueue: ScheduledReportEmailQueue;
  }
): Promise<boolean> {
  const generationJob = await dependencies.generationQueue.getJob(event.jobId);
  const data = generationJob?.data;
  if (
    !data?.jobId ||
    !data.runKey ||
    (data.cadence !== 'weekly' && data.cadence !== 'monthly')
  ) {
    return false;
  }

  await dependencies.emailQueue.add(
    'dispatch-report-email',
    { jobId: data.jobId, runKey: data.runKey },
    {
      jobId: getScheduledReportEmailJobId(data.runKey),
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
    }
  );
  return true;
}

export async function processScheduledReportEmail(
  data: ScheduledReportEmailJobData,
  dependencies: {
    db?: ScheduledReportDatabase;
    dispatcher: ReportEmailDispatcher;
  }
): Promise<void> {
  const report = await getScheduledReport(data.jobId, { db: dependencies.db });
  if (!report) throw new Error(`Scheduled report ${data.jobId} was not found`);

  const sent = await dispatchCompletedReportEmail(report, dependencies.dispatcher);
  if (!sent) {
    throw new Error(`Scheduled report email was not sent for ${data.jobId}`);
  }
}

export function startScheduledReportJobs(
  config: ScheduledReportConfig,
  dependencies: ScheduledReportRuntimeDependencies = {}
): { close(): Promise<void> } {
  if (!config.enabled) {
    logger.info(
      { reasons: config.disabledReasons },
      '[scheduled-reports] Disabled; no schedules or email worker started'
    );
    return { close: async () => undefined };
  }

  const generationQueue = dependencies.generationQueue ?? defaultGenerationQueue();
  const emailQueue = dependencies.emailQueue ?? defaultEmailQueue();
  const dispatcher =
    dependencies.emailDispatcher ??
    createReportEmailDispatcher(config.email, dependencies.emailDependencies);
  const queueEvents = dependencies.queueEvents ?? defaultQueueEvents();
  const emailWorker =
    dependencies.emailWorker ??
    defaultEmailWorker((job) =>
      processScheduledReportEmail(job.data, {
        db: dependencies.db,
        dispatcher,
      })
    );

  queueEvents.on('completed', (event) => {
    void enqueueEmailForCompletedReport(event, { generationQueue, emailQueue }).catch((error) => {
      logger.error(
        { reportQueueJobId: event.jobId, err: error },
        '[scheduled-reports] Could not enqueue report email'
      );
    });
  });
  queueEvents.on('error', (error) => {
    logger.error({ err: error }, '[scheduled-reports] Report queue event listener failed');
  });
  emailWorker.on('failed', (job, error) => {
    logger.error(
      { emailJobId: job?.id, err: error },
      '[scheduled-reports] Email job failed'
    );
  });
  emailWorker.on('error', (error) => {
    logger.error({ err: error }, '[scheduled-reports] Email worker failed');
  });

  const registration = registerScheduledReportSchedules(
    config,
    (cadence) =>
      enqueueScheduledReport(cadence, config, {
        db: dependencies.db,
        now: dependencies.now,
        queue: generationQueue,
      }),
    { schedule: dependencies.schedule }
  );

  return {
    close: async () => {
      await registration.close();
      await queueEvents.close();
      await emailWorker.close();
      if (emailQueue.close) await emailQueue.close();
    },
  };
}

export { getScheduledReportQueueJobId };
