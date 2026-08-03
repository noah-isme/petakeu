import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler';
import { requireAuth } from '../../middleware/auth';
import { fiscalService } from '../../services/fiscal-service';

export const fiscalRouter = Router();

// GET /rank?jenis=pendapatan&period=YYYY-MM&top=20
fiscalRouter.get('/rank', requireAuth, asyncHandler(async (req, res) => {
  const jenis = String(req.query.jenis ?? 'pendapatan');
  const period = String(req.query.period ?? new Date().toISOString().slice(0, 7));
  const top = Math.min(100, Math.max(1, Number(req.query.top ?? 20)));

  const data = await fiscalService.getRanking(jenis, period, top);
  res.json({ data });
}));

// GET /surplus-defisit?periode=YYYY-MM
fiscalRouter.get('/surplus-defisit', requireAuth, asyncHandler(async (req, res) => {
  const period = String(req.query.periode ?? new Date().toISOString().slice(0, 7));
  const data = await fiscalService.getSurplusDeficit(period);
  res.json({ data });
}));
