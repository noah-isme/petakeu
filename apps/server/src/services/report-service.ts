import { getPgPool } from '../db/postgres';
import { reportQueue } from '../jobs/report-worker';
import type {
  ReportJob,
  ReportRequest,
} from '../types/report';

function rowToJob(row: any): ReportJob {
  return {
    jobId: row.id,
    period: row.period,
    regionIds: row.region_ids,
    format: row.format,
    status: row.status,
    downloadUrl: row.download_url ?? undefined,
    requestedAt: row.requested_at,
    updatedAt: row.updated_at,
    expiresAt: row.expires_at,
    summary: row.summary ?? undefined,
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
