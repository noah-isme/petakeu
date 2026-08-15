import { Request, Response } from 'express';

import { auditService } from '../services/audit-service';
import { asyncHandler } from '../utils/async-handler';

const listAuditLogs = asyncHandler(async (req: Request, res: Response) => {
  const { userId, event, action, resource, from, to, limit, offset } = req.query;

  const result = await auditService.getAuditLogs({
    userId: userId ? String(userId) : undefined,
    event: event ? String(event) : undefined,
    action: action ? String(action) : undefined,
    resource: resource ? String(resource) : undefined,
    from: from ? String(from) : undefined,
    to: to ? String(to) : undefined,
    limit: limit ? Number(limit) : 50,
    offset: offset ? Number(offset) : 0,
  });

  res.json(result);
});

export const auditController = {
  listAuditLogs,
};
