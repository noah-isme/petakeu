import { Router } from 'express';

import { requireAuth } from '../../middleware/auth';
import { fiscalController } from '../../controllers/fiscal-controller';

export const fiscalRouter = Router();

// GET /rank?jenis=pendapatan&period=YYYY-MM&top=20
fiscalRouter.get('/rank', requireAuth, fiscalController.getRanking);

// GET /surplus-defisit?periode=YYYY-MM
fiscalRouter.get('/surplus-defisit', requireAuth, fiscalController.getSurplusDeficit);
