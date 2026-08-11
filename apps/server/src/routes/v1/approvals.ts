import { Router } from 'express';

import { approvalController } from '../../controllers/approval-controller';
import { requireAnyRole, requireAuth, requireRole } from '../../middleware/auth';

export const approvalRouter = Router();

// The parent v1 router deliberately owns registration of this router.
approvalRouter.use(requireAuth);

const canSubmitOrReview = requireAnyRole('operator', 'admin');
const canRead = requireAnyRole('viewer', 'operator', 'admin');

// Upload-scoped paths are the primary API. The short aliases keep the action
// endpoints convenient for clients that already have an approval identifier.
approvalRouter.post('/uploads/:uploadId/submit', canSubmitOrReview, approvalController.submit);
approvalRouter.post('/:uploadId/submit', canSubmitOrReview, approvalController.submit);
approvalRouter.post('/submit', canSubmitOrReview, approvalController.submit);

approvalRouter.post('/uploads/:workflowId/review', canSubmitOrReview, approvalController.review);
approvalRouter.post('/:workflowId/review', canSubmitOrReview, approvalController.review);
approvalRouter.post('/review', canSubmitOrReview, approvalController.review);

approvalRouter.post('/uploads/:workflowId/approve', requireRole('admin'), approvalController.approve);
approvalRouter.post('/:workflowId/approve', requireRole('admin'), approvalController.approve);
approvalRouter.post('/approve', requireRole('admin'), approvalController.approve);

approvalRouter.post('/uploads/:workflowId/publish', requireRole('admin'), approvalController.publish);
approvalRouter.post('/:workflowId/publish', requireRole('admin'), approvalController.publish);
approvalRouter.post('/publish', requireRole('admin'), approvalController.publish);

approvalRouter.post('/periods/:period/lock', requireRole('admin'), approvalController.lockPeriod);
approvalRouter.post('/periods/:period/unlock', requireRole('admin'), approvalController.unlockPeriod);
approvalRouter.post('/periods/lock', requireRole('admin'), approvalController.lockPeriod);
approvalRouter.post('/periods/unlock', requireRole('admin'), approvalController.unlockPeriod);

approvalRouter.get('/uploads/:workflowId', canRead, approvalController.get);
approvalRouter.get('/:workflowId', canRead, approvalController.get);
