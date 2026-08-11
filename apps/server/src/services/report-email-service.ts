import * as nodemailer from 'nodemailer';

import { logger as defaultLogger } from '../utils/logger';

import type { SendMailOptions } from 'nodemailer';
import type {
  ScheduledReportEmailConfig,
  ScheduledReportRecord,
} from '../types/scheduled-report';

export interface ReportEmailTransport {
  sendMail(options: SendMailOptions): Promise<unknown>;
}

export interface ReportEmailLogger {
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

export interface ReportEmailDispatcherDependencies {
  transport?: ReportEmailTransport;
  fetcher?: (downloadUrl: string) => Promise<Buffer>;
  logger?: ReportEmailLogger;
  skipSending?: boolean;
}

export type ReportEmailDispatcher = (
  report: ScheduledReportRecord
) => Promise<boolean>;

async function fetchReportPdf(downloadUrl: string): Promise<Buffer> {
  const response = await fetch(downloadUrl);
  if (!response.ok) {
    throw new Error(`Report download failed with HTTP ${response.status}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;',
    };
    return entities[character];
  });
}

function createTransport(config: ScheduledReportEmailConfig): ReportEmailTransport {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.user && config.pass ? { user: config.user, pass: config.pass } : undefined,
  });
}

export function createReportEmailDispatcher(
  config: ScheduledReportEmailConfig | undefined,
  dependencies: ReportEmailDispatcherDependencies = {}
): ReportEmailDispatcher {
  if (!config) {
    return async () => false;
  }

  const transport = dependencies.transport ?? createTransport(config);
  const fetcher = dependencies.fetcher ?? fetchReportPdf;
  const emailLogger = dependencies.logger ?? (defaultLogger as unknown as ReportEmailLogger);
  const skipSending = dependencies.skipSending ?? process.env.NODE_ENV === 'test';

  return async (report) => {
    if (skipSending) {
      emailLogger.info(
        { jobId: report.jobId },
        '[scheduled-reports] Email dispatch skipped in test mode'
      );
      return false;
    }

    if (report.status !== 'completed' || !report.downloadUrl) {
      emailLogger.warn(
        { jobId: report.jobId, status: report.status },
        '[scheduled-reports] Completed report has no downloadable output'
      );
      return false;
    }

    try {
      const pdf = await fetcher(report.downloadUrl);
      const period = escapeHtml(report.period);
      const downloadUrl = escapeHtml(report.downloadUrl);
      const filename = `petakeu-executive-summary-${report.period}.pdf`;

      await transport.sendMail({
        from: config.from,
        to: config.recipients.join(', '),
        subject: `${config.subjectPrefix} - ${report.period}`,
        text: [
          `Petakeu executive revenue summary for ${report.period}.`,
          `Download URL: ${report.downloadUrl}`,
        ].join('\n'),
        html: [
          `<p>Petakeu executive revenue summary for <strong>${period}</strong>.</p>`,
          `<p>The PDF is attached. A temporary download link is also available: <a href="${downloadUrl}">${downloadUrl}</a></p>`,
        ].join(''),
        attachments: [
          {
            filename,
            content: pdf,
            contentType: 'application/pdf',
          },
        ],
      });

      emailLogger.info(
        { jobId: report.jobId, recipients: config.recipients, period: report.period },
        '[scheduled-reports] Report email dispatched'
      );
      return true;
    } catch (error) {
      emailLogger.error(
        { jobId: report.jobId, period: report.period, err: error },
        '[scheduled-reports] Report email dispatch failed'
      );
      return false;
    }
  };
}

export async function dispatchCompletedReportEmail(
  report: ScheduledReportRecord,
  dispatcher: ReportEmailDispatcher
): Promise<boolean> {
  return dispatcher(report);
}
