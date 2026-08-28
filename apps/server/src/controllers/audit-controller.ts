import { Request, Response } from 'express';

import { auditService } from '../services/audit-service';
import { asyncHandler } from '../utils/async-handler';

const listAuditLogs = asyncHandler(async (req: Request, res: Response) => {
  const { userId, event, action, resource, from, to, limit, offset } = req.query;

  const parsedLimit = limit ? parseInt(String(limit), 10) : 50;
  const parsedOffset = offset ? parseInt(String(offset), 10) : 0;

  if (isNaN(parsedLimit) || isNaN(parsedOffset)) {
    res.status(400).json({ error: 'Invalid limit or offset: must be a number' });
    return;
  }

  const clampedLimit = Math.max(1, Math.min(parsedLimit, 500));
  const clampedOffset = Math.max(0, parsedOffset);

  const result = await auditService.getAuditLogs({
    userId: userId ? String(userId) : undefined,
    event: event ? String(event) : undefined,
    action: action ? String(action) : undefined,
    resource: resource ? String(resource) : undefined,
    from: from ? String(from) : undefined,
    to: to ? String(to) : undefined,
    limit: clampedLimit,
    offset: clampedOffset,
  });

  res.json(result);
});

export const auditController = {
  listAuditLogs,
};
