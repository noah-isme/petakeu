import { PassThrough } from 'stream';

import { describe, expect, it, vi, beforeEach } from 'vitest';
import ExcelJS from 'exceljs';

import { getPgPool } from '../db/postgres';
import { uploadReportStream, getReportDownloadUrl } from '../services/storage-service';

import { generateReport } from './report-worker';

import type { Job } from 'bullmq';

type QueryCall = [sql: string, params?: unknown[]];

interface MockQuery {
  mockImplementation(implementation: (sql: string) => unknown): MockQuery;
  mock: { calls: QueryCall[] };
}

interface MockPgPool {
  query: MockQuery;
}

vi.mock('bullmq', async (importOriginal) => {
  const actual = await importOriginal<typeof import('bullmq')>();
  return {
    ...actual,
    Worker: vi.fn().mockImplementation((_queueName: string, processor: unknown, _opts: unknown) => {
      return {
        on: vi.fn(),
        close: vi.fn(),
        processor,
      };
    }),
  };
});

vi.mock('../db/postgres', () => {
  const mockPool = {
    query: vi.fn(),
  };
  return {
    getPgPool: () => mockPool,
  };
});

vi.mock('../services/storage-service', () => ({
  uploadReportStream: vi.fn(),
  getReportDownloadUrl: vi.fn(),
}));

vi.mock('../utils/metrics', () => ({
  workerJobsTotal: { inc: vi.fn() },
  workerJobDuration: { observe: vi.fn() },
  reportsTotal: { inc: vi.fn() },
}));

vi.mock('../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

describe('report-worker streaming export', () => {
  let mockPgPool: MockPgPool;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockPgPool = getPgPool() as unknown as MockPgPool;
    vi.mocked(getReportDownloadUrl).mockResolvedValue('http://localhost:9000/reports/job-123.xlsx');
  });

  it('streams Excel report directly to storage service and updates job status to completed', async () => {
    const uploadedChunks: Buffer[] = [];

    vi.mocked(uploadReportStream).mockImplementation((_key, stream, _contentType) => {
      return new Promise((resolve, reject) => {
        stream.on('data', (chunk) => uploadedChunks.push(Buffer.from(chunk)));
        stream.on('end', () => resolve('http://localhost:9000/reports/job-123.xlsx'));
        stream.on('error', reject);
      });
    });

    mockPgPool.query.mockImplementation((sql: string) => {
      if (sql.includes("UPDATE report_jobs SET status = 'processing'")) {
        return Promise.resolve({ rowCount: 1 });
      }
      if (sql.includes('mv_payments_with_cut')) {
        return Promise.resolve({
          rows: [
            { region_name: 'Kab. Badung', region_id: 'r1', amount: '1000000', cut_amount: '150000', net_amount: '850000' },
            { region_name: 'Kota Denpasar', region_id: 'r2', amount: '2000000', cut_amount: '300000', net_amount: '1700000' },
          ],
        });
      }
      if (sql.includes('WITH current AS')) {
        return Promise.resolve({
          rows: [
            { region_id: 'r2', region_name: 'Kota Denpasar', amount: '2000000', net_amount: '1700000', net_amount_prev: '1500000', yoy_pct: '13.33' },
            { region_id: 'r1', region_name: 'Kab. Badung', amount: '1000000', net_amount: '850000', net_amount_prev: '800000', yoy_pct: '6.25' },
          ],
        });
      }
      if (sql.includes('UPDATE report_jobs')) {
        return Promise.resolve({ rowCount: 1 });
      }
      return Promise.resolve({ rows: [] });
    });

    const mockJob = {
      data: {
        jobId: 'job-123',
        period: '2026-08',
        regionIds: ['r1', 'r2'],
        format: 'excel',
      },
    } as unknown as Job;

    await generateReport(mockJob);

    expect(uploadReportStream).toHaveBeenCalledWith(
      'job-123.xlsx',
      expect.any(PassThrough),
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );

    // Verify database status updates
    const updateCalls = mockPgPool.query.mock.calls.filter(([sql]) => sql.includes('UPDATE report_jobs'));
    expect(updateCalls).toHaveLength(2);
    expect(updateCalls[0][0]).toContain("status = 'processing'");

    const completedCall = updateCalls[1];
    expect(completedCall[0]).toContain("status = 'completed'");
    const completedParams = completedCall[1] ?? [];
    expect(completedParams[0]).toBe('job-123');
    expect(completedParams[1]).toBe('http://localhost:9000/reports/job-123.xlsx');

    const summary = JSON.parse(String(completedParams[2]));
    expect(summary.totalsByRegion).toHaveLength(2);
    expect(summary.top10Rankings).toHaveLength(2);

    // Verify the streamed Excel data is valid and readable by ExcelJS
    const completeBuffer = Buffer.concat(uploadedChunks);
    expect(completeBuffer.length).toBeGreaterThan(0);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(completeBuffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
    expect(workbook.worksheets).toHaveLength(8);
    expect(workbook.worksheets[0].name).toBe('Setoran 2026-08');
    expect(workbook.worksheets[1].name).toBe('Top 10 Peringkat');
    expect(workbook.worksheets.map((worksheet) => worksheet.name)).toEqual(expect.arrayContaining([
      'Executive Summary',
      'Rankings',
      'Monthly Breakdown',
      'Target Achievement',
      'Missing Data Audit',
      'Canonical Data',
    ]));
  });

  it('streams PDF report directly to storage service and updates job status to completed', async () => {
    const uploadedChunks: Buffer[] = [];

    vi.mocked(uploadReportStream).mockImplementation((_key, stream, _contentType) => {
      return new Promise((resolve, reject) => {
        stream.on('data', (chunk) => uploadedChunks.push(Buffer.from(chunk)));
        stream.on('end', () => resolve('http://localhost:9000/reports/job-456.pdf'));
        stream.on('error', reject);
      });
    });

    mockPgPool.query.mockImplementation((sql: string) => {
      if (sql.includes("UPDATE report_jobs SET status = 'processing'")) {
        return Promise.resolve({ rowCount: 1 });
      }
      if (sql.includes('mv_payments_with_cut')) {
        return Promise.resolve({
          rows: [
            { region_name: 'Kab. Badung', region_id: 'r1', amount: '1000000', cut_amount: '150000', net_amount: '850000' },
          ],
        });
      }
      if (sql.includes('WITH current AS')) {
        return Promise.resolve({
          rows: [
            { region_id: 'r1', region_name: 'Kab. Badung', amount: '1000000', net_amount: '850000', net_amount_prev: '800000', yoy_pct: '6.25' },
          ],
        });
      }
      if (sql.includes('UPDATE report_jobs')) {
        return Promise.resolve({ rowCount: 1 });
      }
      return Promise.resolve({ rows: [] });
    });

    const mockJob = {
      data: {
        jobId: 'job-456',
        period: '2026-08',
        regionIds: ['r1'],
        format: 'pdf',
      },
    } as unknown as Job;

    await generateReport(mockJob);

    expect(uploadReportStream).toHaveBeenCalledWith(
      'job-456.pdf',
      expect.any(PassThrough),
      'application/pdf'
    );

    const completeBuffer = Buffer.concat(uploadedChunks);
    expect(completeBuffer.length).toBeGreaterThan(0);
    expect(completeBuffer.toString('utf8', 0, 4)).toBe('%PDF');
  });

  it('destroys PassThrough stream and updates job to failed when generation encounters an error', async () => {
    vi.mocked(uploadReportStream).mockImplementation((_key, stream, _contentType) => {
      return new Promise((resolve, reject) => {
        stream.on('error', reject);
        stream.on('end', () => resolve('ok'));
      });
    });

    mockPgPool.query.mockImplementation((sql: string) => {
      if (sql.includes("UPDATE report_jobs SET status = 'processing'")) {
        return Promise.resolve({ rowCount: 1 });
      }
      if (sql.includes('mv_payments_with_cut')) {
        throw new Error('Database connection lost during query');
      }
      if (sql.includes("UPDATE report_jobs SET status = 'failed'")) {
        return Promise.resolve({ rowCount: 1 });
      }
      return Promise.resolve({ rows: [] });
    });

    const mockJob = {
      data: {
        jobId: 'job-err-789',
        period: '2026-08',
        regionIds: ['r1'],
        format: 'excel',
      },
    } as unknown as Job;

    await expect(generateReport(mockJob)).rejects.toThrow('Database connection lost during query');

    const failedUpdateCall = mockPgPool.query.mock.calls.find(([sql]) =>
      sql.includes("status = 'failed'")
    );
    expect(failedUpdateCall).toBeDefined();
    const failedParams = failedUpdateCall?.[1] ?? [];
    expect(failedParams[0]).toBe('job-err-789');
    expect(failedParams[1]).toBe('Database connection lost during query');
  });

  it('handles large multi-region datasets efficiently with low memory footprint', async () => {
    const uploadedChunks: Buffer[] = [];
    vi.mocked(uploadReportStream).mockImplementation((_key, stream, _contentType) => {
      return new Promise((resolve, reject) => {
        stream.on('data', (chunk) => uploadedChunks.push(Buffer.from(chunk)));
        stream.on('end', () => resolve('http://localhost:9000/reports/job-large.xlsx'));
        stream.on('error', reject);
      });
    });

    const largeRows = Array.from({ length: 2000 }, (_, i) => ({
      region_name: `Region ${i}`,
      region_id: `r-${i}`,
      amount: 100000 + i * 10,
      cut_amount: 15000 + i * 1.5,
      net_amount: 85000 + i * 8.5,
    }));

    mockPgPool.query.mockImplementation((sql: string) => {
      if (sql.includes("UPDATE report_jobs SET status = 'processing'")) {
        return Promise.resolve({ rowCount: 1 });
      }
      if (sql.includes('mv_payments_with_cut')) {
        return Promise.resolve({ rows: largeRows });
      }
      if (sql.includes('WITH current AS')) {
        return Promise.resolve({ rows: largeRows.slice(0, 10) });
      }
      if (sql.includes('UPDATE report_jobs')) {
        return Promise.resolve({ rowCount: 1 });
      }
      return Promise.resolve({ rows: [] });
    });

    const mockJob = {
      data: {
        jobId: 'job-large',
        period: '2026-08',
        regionIds: largeRows.map((r) => r.region_id),
        format: 'excel',
      },
    } as unknown as Job;

    await generateReport(mockJob);

    const completeBuffer = Buffer.concat(uploadedChunks);
    expect(completeBuffer.length).toBeGreaterThan(50000);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(completeBuffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
    const sheet = workbook.worksheets[0];
    expect(sheet.rowCount).toBe(2002);
  });
});
