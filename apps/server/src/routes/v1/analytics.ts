import { Router } from 'express';

import { requireAuth, requireRole } from '../../middleware/auth';
import { analyticsController } from '../../controllers/analytics-controller';

export const analyticsRouter = Router();

analyticsRouter.get('/overview', requireAuth, requireRole('viewer'), analyticsController.getOverview);
analyticsRouter.get('/rankings', requireAuth, requireRole('viewer'), analyticsController.getRankings);
analyticsRouter.get('/reporting-matrix', requireAuth, requireRole('viewer'), analyticsController.getReportingMatrix);
analyticsRouter.get('/reporting-matrix/:regionId/:period', requireAuth, requireRole('viewer'), analyticsController.getReportingMatrixDetail);
analyticsRouter.get('/targets', requireAuth, requireRole('viewer'), analyticsController.listTargets);
analyticsRouter.post('/targets', requireAuth, requireRole('operator'), analyticsController.registerTarget);
