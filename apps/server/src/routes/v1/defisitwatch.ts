import { Router } from 'express';

import { asyncHandler } from '../../utils/async-handler';
import { requireAuth } from '../../middleware/auth';
import { defisitwatchService } from '../../services/defisitwatch-service';

export const defisitwatchRouter = Router();

// GET /defisitwatch/watchlist?periode=YYYY-MM
defisitwatchRouter.get('/watchlist', requireAuth, asyncHandler(async (req, res) => {
  const period = String(req.query.periode ?? new Date().toISOString().slice(0, 7));
  const data = await defisitwatchService.getWatchlist(period);
  res.json({ data });
}));

// GET /defisitwatch/daerah/:id/penjelasan
defisitwatchRouter.get('/daerah/:id/penjelasan', requireAuth, asyncHandler(async (req, res) => {
  const period = String(req.query.periode ?? new Date().toISOString().slice(0, 7));
  const data = await defisitwatchService.getRegionDetail(req.params.id, period);
  res.json({ data });
}));
