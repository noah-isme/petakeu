import { Router } from 'express';

import { auditController } from '../../controllers/audit-controller';
import { requireAuth, requireRole } from '../../middleware/auth';

export const auditRouter = Router();

auditRouter.use(requireAuth);
auditRouter.use(requireRole('admin'));

auditRouter.get('/', auditController.listAuditLogs);
