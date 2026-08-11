import { validate as validateCronExpression } from 'node-cron';

import type { ReportStatus } from './report';

export type ScheduledReportCadence = 'weekly' | 'monthly';

export interface ScheduledReportSchedule {
  cadence: ScheduledReportCadence;
  expression: string;
}

export interface ScheduledReportEmailConfig {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
  from: string;
  recipients: string[];
  subjectPrefix: string;
}

export interface ScheduledReportConfig {
  enabled: boolean;
  timezone: string;
  regionIds: string[];
  schedules: ScheduledReportSchedule[];
  email?: ScheduledReportEmailConfig;
  disabledReasons: string[];
}

export interface ScheduledReportJobData {
  jobId: string;
  period: string;
  regionIds: string[];
  format: 'pdf';
  cadence: ScheduledReportCadence;
  runKey: string;
}

export interface ScheduledReportEmailJobData {
  jobId: string;
  runKey: string;
}

export interface ScheduledReportRecord {
  jobId: string;
  period: string;
  regionIds: string[];
  format: 'pdf' | 'excel';
  status: ReportStatus;
  downloadUrl?: string;
  error?: string;
  requestedAt?: string;
  updatedAt?: string;
  expiresAt?: string;
}

function readTrimmed(env: NodeJS.ProcessEnv, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = env[key]?.trim();
    if (value) return value;
  }
  return undefined;
}

function splitValues(value: string | undefined): string[] {
  return value
    ? value
        .split(/[\s,;]+/)
        .map((entry) => entry.trim())
        .filter(Boolean)
    : [];
}

function isValidTimeZone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format();
    return true;
  } catch {
    return false;
  }
}

function readSchedule(
  env: NodeJS.ProcessEnv,
  cadence: ScheduledReportCadence,
  disabledReasons: string[]
): ScheduledReportSchedule | undefined {
  const keySuffix = cadence === 'weekly' ? 'WEEKLY' : 'MONTHLY';
  const expression = readTrimmed(
    env,
    `REPORT_SCHEDULE_${keySuffix}_CRON`,
    `REPORT_${cadence.toUpperCase()}_CRON`
  );

  if (!expression) return undefined;

  try {
    if (validateCronExpression(expression)) {
      return { cadence, expression };
    }
  } catch {
    // Treat malformed expressions as disabled configuration rather than
    // allowing startup to fail because a schedule was mistyped.
  }

  disabledReasons.push(`invalid ${cadence} cron expression`);
  return undefined;
}

function parsePort(value: string | undefined, disabledReasons: string[]): number {
  if (!value) return 587;
  const port = Number(value);
  if (Number.isInteger(port) && port > 0 && port <= 65535) return port;
  disabledReasons.push('SMTP_PORT must be an integer between 1 and 65535');
  return 587;
}

export function parseScheduledReportConfig(
  env: NodeJS.ProcessEnv = process.env
): ScheduledReportConfig {
  const disabledReasons: string[] = [];
  const schedules = [
    readSchedule(env, 'weekly', disabledReasons),
    readSchedule(env, 'monthly', disabledReasons),
  ].filter((schedule): schedule is ScheduledReportSchedule => Boolean(schedule));

  const timezone = readTrimmed(env, 'REPORT_SCHEDULE_TIMEZONE', 'REPORT_TIMEZONE') ?? 'Asia/Jakarta';
  if (!isValidTimeZone(timezone)) {
    disabledReasons.push(`invalid report schedule timezone: ${timezone}`);
  }

  const regionIds = splitValues(
    readTrimmed(env, 'REPORT_SCHEDULE_REGION_IDS', 'REPORT_REGION_IDS')
  );
  if (regionIds.length === 0) {
    disabledReasons.push('REPORT_SCHEDULE_REGION_IDS is not configured');
  }

  const smtpHost = readTrimmed(env, 'SMTP_HOST');
  const recipients = splitValues(
    readTrimmed(env, 'REPORT_EMAIL_TO', 'REPORT_RECIPIENTS')
  );
  const from = readTrimmed(env, 'REPORT_EMAIL_FROM', 'EMAIL_FROM');
  const smtpUser = readTrimmed(env, 'SMTP_USER');
  const smtpPass = readTrimmed(env, 'SMTP_PASS');
  const smtpPort = parsePort(readTrimmed(env, 'SMTP_PORT'), disabledReasons);
  const secureValue = readTrimmed(env, 'SMTP_SECURE');
  const secure = secureValue ? secureValue.toLowerCase() === 'true' : smtpPort === 465;

  let email: ScheduledReportEmailConfig | undefined;
  if (!smtpHost) disabledReasons.push('SMTP_HOST is not configured');
  if (recipients.length === 0) disabledReasons.push('REPORT_EMAIL_TO is not configured');
  if (!from) disabledReasons.push('REPORT_EMAIL_FROM is not configured');
  if (Boolean(smtpUser) !== Boolean(smtpPass)) {
    disabledReasons.push('SMTP_USER and SMTP_PASS must be configured together');
  }

  if (
    smtpHost &&
    recipients.length > 0 &&
    from &&
    Boolean(smtpUser) === Boolean(smtpPass) &&
    !disabledReasons.includes('SMTP_PORT must be an integer between 1 and 65535')
  ) {
    email = {
      host: smtpHost,
      port: smtpPort,
      secure,
      user: smtpUser,
      pass: smtpPass,
      from,
      recipients,
      subjectPrefix:
        readTrimmed(env, 'REPORT_EMAIL_SUBJECT') ?? 'Petakeu Executive Revenue Summary',
    };
  }

  if (schedules.length === 0) disabledReasons.push('no weekly or monthly report schedule is configured');
  if (env.REPORT_SCHEDULE_ENABLED?.toLowerCase() === 'false') {
    disabledReasons.push('REPORT_SCHEDULE_ENABLED=false');
  }
  if (env.NODE_ENV === 'test') disabledReasons.push('NODE_ENV=test');

  const disabledByConfiguration =
    schedules.length === 0 ||
    regionIds.length === 0 ||
    !email ||
    !isValidTimeZone(timezone) ||
    env.REPORT_SCHEDULE_ENABLED?.toLowerCase() === 'false';

  return {
    enabled: env.NODE_ENV !== 'test' && !disabledByConfiguration,
    timezone,
    regionIds,
    schedules,
    email,
    disabledReasons: [...new Set(disabledReasons)],
  };
}
