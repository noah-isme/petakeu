import { Router } from 'express';

import { regionRouter } from './regions';
import { geoRouter } from './geo';
import { uploadRouter } from './uploads';
import { reportRouter } from './reports';
import { fiscalRouter } from './fiscal';
import { rankfinRouter } from './rankfin';
import { defisitwatchRouter } from './defisitwatch';
import { auditRouter } from './audit';
import { auditMiddleware } from '../../middleware/audit';

export const apiRouter = Router();

apiRouter.use(auditMiddleware);

apiRouter.use('/regions', regionRouter);
apiRouter.use('/geo', geoRouter);
apiRouter.use('/uploads', uploadRouter);
apiRouter.use('/reports', reportRouter);
apiRouter.use('/', fiscalRouter);         // /rank and /surplus-defisit at root v1
apiRouter.use('/rankfin', rankfinRouter);
apiRouter.use('/defisitwatch', defisitwatchRouter);
apiRouter.use('/audit-logs', auditRouter);
