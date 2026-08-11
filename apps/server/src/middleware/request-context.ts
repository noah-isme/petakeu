import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

import type { NextFunction, Request, Response } from 'express';

const REQUEST_ID_HEADER = 'x-request-id';
const MAX_REQUEST_ID_LENGTH = 128;
const MAX_LOG_FIELD_LENGTH = 128;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]+$/;
const LOG_FIELD_PATTERN = /^[A-Za-z0-9._:@/-]+$/;
const PERIOD_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export interface RequestLogContext {
  request_id: string;
  user_id?: string;
  region_code?: string;
  period?: string;
  duration_ms?: number;
}

interface RequestState {
  request_id: string;
  started_at: number;
  request: Request;
  response: Response;
  overrides: Partial<Omit<RequestLogContext, 'request_id'>>;
}

const requestStorage = new AsyncLocalStorage<RequestState>();

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      request_id?: string;
      requestId?: string;
    }
  }
}

function firstString(value: unknown): string | undefined {
  const candidate = Array.isArray(value) ? value[0] : value;
  return typeof candidate === 'string' ? candidate : undefined;
}

function boundedString(value: unknown, pattern: RegExp): string | undefined {
  const candidate = firstString(value)?.trim();
  if (!candidate || candidate.length > MAX_LOG_FIELD_LENGTH || !pattern.test(candidate)) {
    return undefined;
  }
  return candidate;
}

function normalizeRequestId(value: unknown): string | undefined {
  const candidate = firstString(value)?.trim();
  if (
    !candidate ||
    candidate.length > MAX_REQUEST_ID_LENGTH ||
    !REQUEST_ID_PATTERN.test(candidate)
  ) {
    return undefined;
  }
  return candidate;
}

function getRequestField(req: Request, names: string[]): unknown {
  for (const source of [req.params, req.query, req.body]) {
    if (!source || typeof source !== 'object') continue;
    for (const name of names) {
      const value = (source as Record<string, unknown>)[name];
      if (value !== undefined) return value;
    }
  }
  return undefined;
}

function deriveContext(state: RequestState | undefined, request?: Request): RequestLogContext {
  const req = request ?? state?.request;
  const requestId = state?.request_id ?? normalizeRequestId(req?.request_id ?? req?.requestId);
  const context: RequestLogContext = {
    request_id: requestId ?? randomUUID(),
  };

  if (req) {
    const userId = boundedString(req.user?.sub, LOG_FIELD_PATTERN);
    const regionCode = boundedString(
      getRequestField(req, ['region_code', 'regionCode']),
      LOG_FIELD_PATTERN
    );
    const period = boundedString(getRequestField(req, ['period']), PERIOD_PATTERN);

    if (userId) context.user_id = userId;
    if (regionCode) context.region_code = regionCode;
    if (period) context.period = period;
  }

  if (state) {
    Object.assign(context, state.overrides);
    context.duration_ms = Math.max(0, Date.now() - state.started_at);
  }

  return context;
}

export function requestContextMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const requestId = normalizeRequestId(req.headers[REQUEST_ID_HEADER]) ?? randomUUID();
  const state: RequestState = {
    request_id: requestId,
    started_at: Date.now(),
    request: req,
    response: res,
    overrides: {},
  };

  req.request_id = requestId;
  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);
  res.locals.request_id = requestId;

  res.once('finish', () => {
    state.overrides.duration_ms = Math.max(0, Date.now() - state.started_at);
  });

  requestStorage.run(state, next);
}

export const requestContext = requestContextMiddleware;

export function getRequestId(req?: Request): string | undefined {
  const state = requestStorage.getStore();
  return state?.request_id ?? normalizeRequestId(req?.request_id ?? req?.requestId);
}

export function getRequestLogContext(req?: Request): RequestLogContext {
  return deriveContext(requestStorage.getStore(), req);
}

export function setRequestContext(
  fields: Partial<Omit<RequestLogContext, 'request_id'>>
): void {
  const state = requestStorage.getStore();
  if (state) Object.assign(state.overrides, fields);
}
