import { getPgPool } from '../db/postgres';
import { reportQueue } from '../jobs/report-worker';

import type {
  ReportJob,
  ReportJobData,
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
    periodFrom: (row.period_from as string | null) ?? (row.period as string),
    periodTo: (row.period_to as string | null) ?? (row.period as string),
    provinceIds: Array.isArray(row.province_ids) ? row.province_ids as string[] : [],
    rankingCriterion: (row.ranking_criterion as ReportJob['rankingCriterion']) ?? 'total',
    amountBasis: (row.amount_basis as ReportJob['amountBasis']) ?? 'gross',
    reportType: (row.report_type as ReportJob['reportType']) ?? 'full',
  };
}

export async function enqueueReport(request: ReportRequest): Promise<ReportJob> {
  const pool = getPgPool();

  const { rows } = await pool.query(
    `INSERT INTO report_jobs(
       period, period_from, period_to, region_ids, province_ids, format,
       ranking_criterion, amount_basis, report_type, status
     )
     VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, 'queued')
     RETURNING *`,
    [
      request.period,
      request.periodFrom ?? request.period,
      request.periodTo ?? request.period,
      request.regionIds,
      request.provinceIds ?? [],
      request.format,
      request.rankingCriterion ?? 'total',
      request.amountBasis ?? 'gross',
      request.reportType ?? 'full',
    ]
  );
  const job = rowToJob(rows[0]);

  // Enqueue generation job
  const queueData: ReportJobData = {
    jobId: job.jobId,
    period: request.period,
    regionIds: request.regionIds,
    format: request.format,
    periodFrom: request.periodFrom,
    periodTo: request.periodTo,
    provinceIds: request.provinceIds,
    rankingCriterion: request.rankingCriterion,
    amountBasis: request.amountBasis,
    reportType: request.reportType,
  };
  if (request.format === 'pdf' && request.branding) {
    queueData.branding = request.branding;
  }

  await reportQueue.add('generate-report', queueData, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 3000 },
  });

  return {
    ...job,
    periodFrom: request.periodFrom,
    periodTo: request.periodTo,
    provinceIds: request.provinceIds,
    rankingCriterion: request.rankingCriterion,
    amountBasis: request.amountBasis,
    reportType: request.reportType,
  };
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
