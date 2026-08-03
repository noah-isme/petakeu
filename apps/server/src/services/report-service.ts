import { getPgPool } from '../db/postgres';
import { reportQueue } from '../jobs/report-worker';

import type {
  ReportJob,
  ReportRequest,
} from '../types/report';

function rowToJob(row: Record<string, unknown>): ReportJob {
  return {
    jobId: row.id as string,
    period: row.period as string,
    regionIds: row.region_ids as string[],
    format: row.format as ReportJob['format'],
    status: row.status as ReportJob['status'],
    downloadUrl: (row.download_url as string) ?? undefined,
    requestedAt: row.requested_at as string,
    updatedAt: row.updated_at as string,
    expiresAt: row.expires_at as string,
    summary: (row.summary as ReportJob['summary']) ?? undefined,
  };
}

export async function enqueueReport(request: ReportRequest): Promise<ReportJob> {
  const pool = getPgPool();

  const { rows } = await pool.query(
    `INSERT INTO report_jobs(period, region_ids, format, status)
     VALUES($1, $2, $3, 'queued')
     RETURNING *`,
    [request.period, request.regionIds, request.format]
  );
  const job = rowToJob(rows[0]);

  // Enqueue generation job
  await reportQueue.add('generate-report', {
    jobId: job.jobId,
    period: request.period,
    regionIds: request.regionIds,
    format: request.format,
  }, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 3000 },
  });

  return job;
}

export async function listReports(): Promise<ReportJob[]> {
  const pool = getPgPool();
  const { rows } = await pool.query(
    'SELECT * FROM report_jobs ORDER BY requested_at DESC LIMIT 100'
  );
  return rows.map(rowToJob);
}

export async function getReport(jobId: string): Promise<ReportJob | undefined> {
  const pool = getPgPool();
  const { rows } = await pool.query(
    'SELECT * FROM report_jobs WHERE id = $1',
    [jobId]
  );
  return rows.length ? rowToJob(rows[0]) : undefined;
}

export const reportService = { enqueueReport, listReports, getReport };
