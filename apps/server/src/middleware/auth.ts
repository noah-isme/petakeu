import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AppError } from '../utils/app-error';

export interface AuthPayload {
  sub: string;
  email?: string;
  role?: string;
  iat?: number;
  exp?: number;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
    }
  }
}

const AUTH_SECRET = process.env.AUTH_SECRET ?? '';
const AUTH_DISABLED = process.env.AUTH_DISABLED === 'true';

export function requireAuth(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  // Allow disabling auth for local dev via env flag
  if (AUTH_DISABLED || !AUTH_SECRET) {
    req.user = { sub: 'dev-user', role: 'admin' };
    return next();
  }

  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return next(new AppError('Missing or invalid Authorization header', 401));
  }

  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, AUTH_SECRET) as AuthPayload;
    req.user = payload;
    next();
  } catch (err) {
    next(new AppError('Invalid or expired token', 401));
  }
}

export function requireRole(role: string) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new AppError('Unauthorized', 401));
    }
    if (req.user.role !== role && req.user.role !== 'admin') {
      return next(new AppError('Insufficient permissions', 403));
    }
    next();
  };
}
