import { createHash } from 'node:crypto';

import { getPgPool } from '../db/postgres';
import { reportQueue } from '../jobs/report-worker';
import { logger } from '../utils/logger';

import type {
  ScheduledReportCadence,
  ScheduledReportConfig,
  ScheduledReportJobData,
  ScheduledReportRecord,
} from '../types/scheduled-report';
import type { ReportStatus } from '../types/report';

export interface ScheduledReportQueryResult {
  rows: Array<Record<string, unknown>>;
}

export interface ScheduledReportDatabase {
  query(text: string, values?: unknown[]): Promise<ScheduledReportQueryResult>;
}

export interface ScheduledReportQueueOptions {
  jobId: string;
  attempts: number;
  backoff: { type: 'exponential'; delay: number };
}

export interface ScheduledReportQueue {
  add(
    name: string,
    data: ScheduledReportJobData,
    options: ScheduledReportQueueOptions
  ): Promise<unknown>;
}

export interface ScheduledReportServiceDependencies {
  db?: ScheduledReportDatabase;
  queue?: ScheduledReportQueue;
  now?: () => Date;
}

export interface EnqueueScheduledReportResult {
  record: ScheduledReportRecord;
  runKey: string;
  queueJobId: string;
  duplicate: boolean;
}

interface CalendarParts {
  year: number;
  month: number;
  day: number;
}

const REPORT_STATUS_VALUES: ReportStatus[] = ['queued', 'processing', 'completed', 'failed'];

function defaultDatabase(): ScheduledReportDatabase {
  return getPgPool() as unknown as ScheduledReportDatabase;
}

function defaultQueue(): ScheduledReportQueue {
  return reportQueue as unknown as ScheduledReportQueue;
}

function rowToRecord(row: Record<string, unknown>): ScheduledReportRecord {
  const status = REPORT_STATUS_VALUES.includes(row.status as ReportStatus)
    ? (row.status as ReportStatus)
    : 'queued';

  return {
    jobId: String(row.id),
    period: String(row.period),
    regionIds: Array.isArray(row.region_ids) ? row.region_ids.map(String) : [],
    format: row.format === 'excel' ? 'excel' : 'pdf',
    status,
    downloadUrl: typeof row.download_url === 'string' ? row.download_url : undefined,
    error: typeof row.error === 'string' ? row.error : undefined,
    requestedAt: typeof row.requested_at === 'string' ? row.requested_at : undefined,
    updatedAt: typeof row.updated_at === 'string' ? row.updated_at : undefined,
    expiresAt: typeof row.expires_at === 'string' ? row.expires_at : undefined,
  };
}

export function getCalendarParts(date: Date, timezone: string): CalendarParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
  };
}

function getIsoWeek(parts: CalendarParts): { year: number; week: number } {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);

  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(
    (((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7
  );

  return { year: date.getUTCFullYear(), week };
}

/**
 * The report worker currently aggregates a calendar month. Weekly schedules
 * therefore produce a current-month snapshot, while monthly schedules run for
 * the previous closed month.
 */
export function resolveScheduledReportPeriod(
  cadence: ScheduledReportCadence,
  now: Date,
  timezone: string
): string {
  const parts = getCalendarParts(now, timezone);
  if (cadence === 'weekly') {
    return `${parts.year}-${String(parts.month).padStart(2, '0')}`;
  }

  const previousMonth = new Date(Date.UTC(parts.year, parts.month - 2, 1));
  return `${previousMonth.getUTCFullYear()}-${String(previousMonth.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function getScheduledReportRunKey(
  cadence: ScheduledReportCadence,
  now: Date,
  timezone: string
): string {
  const parts = getCalendarParts(now, timezone);
  const bucket =
    cadence === 'weekly'
      ? (() => {
          const week = getIsoWeek(parts);
          return `${week.year}-W${String(week.week).padStart(2, '0')}`;
        })()
      : `${parts.year}-${String(parts.month).padStart(2, '0')}`;

  return `scheduled:${cadence}:${bucket}`;
}

/** Create a stable UUID-shaped identifier without adding a UUID dependency. */
export function getScheduledReportId(runKey: string): string {
  const digest = createHash('sha256').update(`petakeu:${runKey}`).digest();
  digest[6] = (digest[6] & 0x0f) | 0x50;
  digest[8] = (digest[8] & 0x3f) | 0x80;
  const hex = digest.toString('hex').slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function safeJobIdPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '-');
}

export function getScheduledReportQueueJobId(runKey: string): string {
  return `scheduled-report-${safeJobIdPart(runKey)}`;
}

export function getScheduledReportEmailJobId(runKey: string): string {
  return `scheduled-report-email-${safeJobIdPart(runKey)}`;
}

export async function getScheduledReport(
  jobId: string,
  dependencies: ScheduledReportServiceDependencies = {}
): Promise<ScheduledReportRecord | undefined> {
  const db = dependencies.db ?? defaultDatabase();
  const result = await db.query('SELECT * FROM report_jobs WHERE id = $1', [jobId]);
  return result.rows.length > 0 ? rowToRecord(result.rows[0]) : undefined;
}

export async function enqueueScheduledReport(
  cadence: ScheduledReportCadence,
  config: Pick<ScheduledReportConfig, 'regionIds' | 'timezone'>,
  dependencies: ScheduledReportServiceDependencies = {}
): Promise<EnqueueScheduledReportResult> {
  if (config.regionIds.length === 0) {
    throw new Error('Scheduled reports require at least one configured region ID');
  }

  const now = dependencies.now?.() ?? new Date();
  const runKey = getScheduledReportRunKey(cadence, now, config.timezone);
  const period = resolveScheduledReportPeriod(cadence, now, config.timezone);
  const jobId = getScheduledReportId(runKey);
  const queueJobId = getScheduledReportQueueJobId(runKey);
  const db = dependencies.db ?? defaultDatabase();
  const queue = dependencies.queue ?? defaultQueue();

  const inserted = await db.query(
    `INSERT INTO report_jobs(id, period, region_ids, format, status)
     VALUES($1, $2, $3, 'pdf', 'queued')
     ON CONFLICT (id) DO NOTHING
     RETURNING *`,
    [jobId, period, config.regionIds,]
  );

  let row = inserted.rows[0];
  const duplicate = !row;
  if (!row) {
    const existing = await db.query('SELECT * FROM report_jobs WHERE id = $1', [jobId]);
    row = existing.rows[0];
  }

  if (!row) {
    throw new Error(`Scheduled report row ${jobId} was not found after insert`);
  }

  const record = rowToRecord(row);
  if (duplicate) {
    logger.info(
      { jobId, runKey, status: record.status },
      '[scheduled-reports] Duplicate run suppressed'
    );
    return { record, runKey, queueJobId, duplicate: true };
  }

  const data: ScheduledReportJobData = {
    jobId,
    period,
    regionIds: config.regionIds,
    format: 'pdf',
    cadence,
    runKey,
  };

  try {
    await queue.add('generate-report', data, {
      jobId: queueJobId,
      attempts: 3,
      backoff: { type: 'exponential', delay: 3000 },
    });
  } catch (error) {
    try {
      await db.query(
        `UPDATE report_jobs
         SET status = 'failed', error = $2, updated_at = NOW()
         WHERE id = $1`,
        [jobId, error instanceof Error ? error.message : String(error)]
      );
    } catch (updateError) {
      logger.error(
        { jobId, err: updateError },
        '[scheduled-reports] Failed to mark enqueue failure'
      );
    }
    throw error;
  }

  logger.info({ jobId, runKey, cadence, period }, '[scheduled-reports] Report queued');
  return { record, runKey, queueJobId, duplicate: false };
}
