import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler';
import { requireAuth } from '../../middleware/auth';
import { rankfinService } from '../../services/rankfin-service';

export const rankfinRouter = Router();

// GET /rankfin/league?periode=YYYY-MM
rankfinRouter.get('/league', requireAuth, asyncHandler(async (req, res) => {
  const period = String(req.query.periode ?? new Date().toISOString().slice(0, 7));
  const data = await rankfinService.getLeague(period);
  res.json({ data });
}));
