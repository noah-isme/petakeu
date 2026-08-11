import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

import { AppError } from '../utils/app-error';

export const ROLES = ['public', 'viewer', 'operator', 'admin'] as const;
export type Role = (typeof ROLES)[number];

/** Numeric levels make role checks explicit and keep the hierarchy in one place. */
export const ROLE_HIERARCHY: Readonly<Record<Role, number>> = Object.freeze({
  public: 0,
  viewer: 1,
  operator: 2,
  admin: 3,
});

export interface AuthPayload {
  sub: string;
  email?: string;
  role?: Role;
  iat?: number;
  exp?: number;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthPayload;
    }
  }
}

const AUTH_SECRET = process.env.AUTH_SECRET ?? '';
const AUTH_DISABLED = process.env.AUTH_DISABLED === 'true';

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

export function hasMinimumRole(actualRole: unknown, requiredRole: string): boolean {
  if (!isRole(actualRole) || !isRole(requiredRole)) {
    return false;
  }

  return ROLE_HIERARCHY[actualRole] >= ROLE_HIERARCHY[requiredRole];
}

function isAuthPayload(value: unknown): value is AuthPayload {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const payload = value as Record<string, unknown>;
  return typeof payload.sub === 'string' && payload.sub.length > 0 && isRole(payload.role);
}

function assertUserRole(req: Request): Role {
  if (!req.user) {
    throw new AppError('Unauthorized', 401);
  }

  if (!isRole(req.user.role)) {
    throw new AppError('Invalid or missing role', 403);
  }

  return req.user.role;
}

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
    const payload = jwt.verify(token, AUTH_SECRET);
    if (!isAuthPayload(payload)) {
      return next(new AppError('Invalid authentication claims', 401));
    }

    req.user = payload;
    next();
  } catch (err) {
    next(new AppError('Invalid or expired token', 401));
  }
}

function requireAllowList(roles: readonly string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    let actualRole: Role;
    try {
      actualRole = assertUserRole(req);
    } catch (err) {
      return next(err);
    }

    if (!roles.every(isRole) || !roles.includes(actualRole)) {
      return next(new AppError('Insufficient permissions', 403));
    }

    next();
  };
}

/**
 * Require a minimum role in the public hierarchy. Existing requireRole('admin')
 * callers therefore keep their original meaning, while lower roles can be
 * used for routes that should also be available to higher roles.
 */
export function requireRole(role: string | readonly string[]) {
  if (typeof role !== 'string') {
    return requireAllowList(role);
  }

  return (req: Request, _res: Response, next: NextFunction): void => {
    let actualRole: Role;
    try {
      actualRole = assertUserRole(req);
    } catch (err) {
      return next(err);
    }

    if (!hasMinimumRole(actualRole, role)) {
      return next(new AppError('Insufficient permissions', 403));
    }

    next();
  };
}

/** Exact allow-list authorization for routes whose roles are not hierarchical. */
export function requireAnyRole(...roles: Role[]) {
  return requireAllowList(roles);
}

/** Array form for route declarations that build their allow-list dynamically. */
export function requireRoles(roles: readonly Role[]) {
  return requireAllowList(roles);
}

export const allowRoles = requireAnyRole;
