import { getPgPool } from '../db/postgres';
import { AppError } from '../utils/app-error';
import { logger } from '../utils/logger';
import { alertsSent } from '../utils/metrics';
import * as nodemailer from 'nodemailer';

export interface AlertPayload {
  regionId: string;
  regionName: string;
  irf: number;
  category: 'red' | 'orange' | 'green';
  reasons: string[];
  message: string;
  threshold: number;
  level: 'merah' | 'oranye' | 'hijau';
  action: string;
}

export interface NotificationConfig {
  email: {
    from: string;
    to: string;
    subject: string;
    template: string;
  };
  whatsapp: {
    enabled: boolean;
    apiKey?: string;
    phoneNumber?: string;
  };
}

export async function evaluateIrfAndSendAlerts(period: string): Promise<void> {
  const pool = getPgPool();

  // Get current watchlist with advanced rules
  const watchlist = await getWatchlistWithAdvancedRules(period);

  for (const item of watchlist) {
    if (item.category === 'red') {
      // Send high-priority alert
      await sendAlert({
        regionId: item.regionId,
        regionName: item.regionName,
        irf: item.irf,
        category: 'red',
        reasons: item.reasons,
        message: `IRF ${item.irf} - Daerah ${item.regionName} berisiko defisit tinggi!`,
        threshold: 50,
        level: 'merah',
        action: 'Intervensi segera'
      }, 'email');
    } else if (item.category === 'orange') {
      await sendAlert({
        regionId: item.regionId,
        regionName: item.regionName,
        irf: item.irf,
        category: 'orange',
        reasons: item.reasons,
        message: `IRF ${item.irf} - Daerah ${item.regionName} perlu perhatian.`,
        threshold: 25,
        level: 'oranye',
        action: 'Monitoring mingguan'
      }, 'email');
    }
  }
}

async function getWatchlistWithAdvancedRules(period: string) {
  const pool = getPgPool();
  const currentSql = `
    SELECT r.id::text AS region_id, r.name AS region_name,
           COALESCE(m.amount, 0) AS amount,
           COALESCE(m.cut_amount, 0) AS cut_amount
    FROM regions r
    LEFT JOIN mv_payments_with_cut m ON m.region_id = r.id AND m.period = ($1 || '-01')::date
    WHERE r.level = 2
  `;
  const { rows } = await pool.query(currentSql, [period]);

  return rows.map(row => {
    const irf = computeAdvancedIrf(row.amount, row.cut_amount);
    const category = getCategory(irf);
    const reasons = computeReasons(irf, row.amount, row.cut_amount);
    return { ...row, irf, category, reasons };
  }).filter(item => item.irf >= 25); // only orange and red
}

function computeAdvancedIrf(amount: number, cutAmount: number): number {
  let irf = 0;
  // Advanced rules from new-feature.md
  if (amount === 0) irf += 60;
  else if (amount < cutAmount * 0.5) irf += 40;
  else if (amount < cutAmount * 0.8) irf += 20;
  if (irf > 100) irf = 100;
  return irf;
}

function getCategory(irf: number): 'red' | 'orange' | 'green' {
  if (irf >= 75) return 'red';
  if (irf >= 50) return 'orange';
  return 'green';
}

function computeReasons(irf: number, amount: number, cutAmount: number): string[] {
  const reasons: string[] = [];
  if (amount === 0) reasons.push('Tidak ada setoran');
  if (amount < cutAmount * 0.5) reasons.push('Setoran turun >50%');
  if (irf >= 75) reasons.push('IRF tinggi - intervensi diperlukan');
  return reasons;
}

export async function sendAlert(payload: AlertPayload, channel: 'email' | 'whatsapp' = 'email'): Promise<void> {
  const config = loadNotificationConfig();

  if (channel === 'email') {
    await sendEmailAlert(payload, config.email);
  } else if (channel === 'whatsapp') {
    if (config.whatsapp.enabled && config.whatsapp.apiKey) {
      await sendWhatsAppAlert(payload, config.whatsapp);
    }
  }
}

async function sendEmailAlert(payload: AlertPayload, config: any): Promise<void> {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT || 465),
    secure: true,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });

  await transporter.sendMail({
    from: config.from,
    to: config.to,
    subject: `${config.subject} - ${payload.regionName}`,
    html: `
      <h2>ALERT DEFISITWATCH</h2>
      <p>Daerah: <strong>${payload.regionName}</strong></p>
      <p>IRF: <strong>${payload.irf}</strong> (${payload.level.toUpperCase()})</p>
      <p>Alasan: ${payload.reasons.join(', ')}</p>
      <p>Aksi: ${payload.action}</p>
      <p>Link: ${config.template}</p>
    `
  });
  
  alertsSent.inc({ channel: 'email', level: payload.level });
}

async function sendWhatsAppAlert(payload: AlertPayload, config: any): Promise<void> {
  // WhatsApp Business API implementation
  // This is a placeholder - actual implementation would use WhatsApp Business API
  logger.info({ payload, config }, 'WhatsApp alert would be sent');
  alertsSent.inc({ channel: 'whatsapp', level: payload.level });
}

function loadNotificationConfig(): NotificationConfig {
  return {
    email: {
      from: process.env.EMAIL_FROM || 'noreply@petakeu.jatim.go.id',
      to: process.env.EMAIL_TO || 'admin@petakeu.jatim.go.id',
      subject: 'Petakeu - Alert Risiko Fiskal',
      template: process.env.EMAIL_TEMPLATE || 'https://defisitwatch.jatim.go.id/detail/{regionId}'
    },
    whatsapp: {
      enabled: process.env.WHATSAPP_ENABLED === 'true',
      apiKey: process.env.WHATSAPP_API_KEY,
      phoneNumber: process.env.WHATSAPP_PHONE_NUMBER
    }
  };
}

export const alertService = { evaluateIrfAndSendAlerts, sendAlert };