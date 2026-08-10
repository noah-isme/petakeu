import { Request, Response, NextFunction } from 'express';
import { logAudit } from '../services/audit-service';

export function auditMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Automatically audit mutative HTTP methods (POST, PUT, PATCH, DELETE)
  const isMutative = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method.toUpperCase());

  if (!isMutative) {
    return next();
  }

  res.on('finish', () => {
    const rawIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim();
    const ip = rawIp || req.socket.remoteAddress || req.ip || '';
    const userAgent = req.headers['user-agent'] || '';
    const endpoint = req.originalUrl || req.url;

    logAudit({
      event: `${req.method.toLowerCase()}.${endpoint.split('?')[0].replace(/^\/api\/v1\//, '').replace(/\//g, '.')}`,
      action: req.method.toLowerCase(),
      endpoint,
      method: req.method,
      user_id: req.user?.sub,
      status_code: res.statusCode,
      ip_address: ip,
      user_agent: userAgent,
      details: {
        query: Object.keys(req.query).length > 0 ? req.query : undefined,
      },
    }).catch(() => {
      // Ignore background audit write failures in finish handler
    });
  });

  next();
}
