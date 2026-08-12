import { Router } from 'express';

import { requireAnyRole, requireAuth } from '../../middleware/auth';
import { uploadController } from '../../controllers/upload-controller';

export const regionAliasRouter = Router();

regionAliasRouter.get('/', requireAuth, requireAnyRole('viewer', 'operator', 'admin'), uploadController.listRegionAliases);
regionAliasRouter.post('/', requireAuth, requireAnyRole('operator', 'admin'), uploadController.createRegionAlias);
regionAliasRouter.patch('/:aliasId', requireAuth, requireAnyRole('admin'), uploadController.updateRegionAlias);
regionAliasRouter.delete('/:aliasId', requireAuth, requireAnyRole('admin'), uploadController.deleteRegionAlias);
