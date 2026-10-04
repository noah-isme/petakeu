import { Request, Response } from 'express';

import { isPublicRole } from '../middleware/auth';
import { fiscalService } from '../services/fiscal-service';
import { asyncHandler } from '../utils/async-handler';

// GET /rank?jenis=pendapatan&period=YYYY-MM&top=20
const getRanking = asyncHandler(async (req: Request, res: Response) => {
  const jenis = String(req.query.jenis ?? 'pendapatan');
  const period = String(req.query.period ?? new Date().toISOString().slice(0, 7));
  const top = Math.min(100, Math.max(1, Number(req.query.top ?? 20)));

  // Cached payload is role-agnostic; redaction happens per request after the read.
  const data = await fiscalService.getRanking(jenis, period, top);
  res.json({ data: isPublicRole(req) ? fiscalService.redactRankingForPublic(data) : data });
});

// GET /surplus-defisit?periode=YYYY-MM
const getSurplusDeficit = asyncHandler(async (req: Request, res: Response) => {
  const period = String(req.query.periode ?? new Date().toISOString().slice(0, 7));
  const data = await fiscalService.getSurplusDeficit(period);
  res.json({ data: isPublicRole(req) ? fiscalService.redactSurplusDeficitForPublic(data) : data });
});

export const fiscalController = {
  getRanking,
  getSurplusDeficit,
};
