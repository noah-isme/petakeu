import { Request, Response } from 'express';

import { isRole } from '../middleware/auth';
import { approvalService, normalizeFiscalPeriod } from '../services/approval-service';
import { asyncHandler } from '../utils/async-handler';
import { AppError } from '../utils/app-error';

import type { ApprovalActor, ApprovalReviewInput } from '../types/approval';

function requestBody(req: Request): Record<string, unknown> {
  return req.body && typeof req.body === 'object' && !Array.isArray(req.body)
    ? (req.body as Record<string, unknown>)
    : {};
}

function actorFromRequest(req: Request): ApprovalActor {
  if (!req.user?.sub || !isRole(req.user.role)) {
    throw new AppError('Unauthorized', 401);
  }

  return { id: req.user.sub, role: req.user.role };
}

function firstString(values: unknown[]): string | undefined {
  return values.find((value): value is string => typeof value === 'string' && value.length > 0);
}

function uploadIdFromRequest(req: Request): string {
  const body = requestBody(req);
  const uploadId = firstString([req.params.uploadId, req.params.approvalId, body.uploadId]);
  if (!uploadId) {
    throw new AppError('Upload ID is required', 400);
  }
  return uploadId;
}

function workflowIdFromRequest(req: Request): string {
  const body = requestBody(req);
  const workflowId = firstString([
    req.params.workflowId,
    req.params.approvalId,
    req.params.uploadId,
    body.workflowId,
    body.approvalId,
  ]);
  if (!workflowId) {
    throw new AppError('Approval workflow ID is required', 400);
  }
  return workflowId;
}

function reviewInput(req: Request): ApprovalReviewInput {
  const body = requestBody(req);
  const notes = body.notes ?? body.reviewNotes ?? body.comment;
  if (notes !== undefined && typeof notes !== 'string') {
    throw new AppError('Review notes must be a string', 400);
  }

  const metadata = body.metadata;
  if (metadata !== undefined && (!metadata || typeof metadata !== 'object' || Array.isArray(metadata))) {
    throw new AppError('Review metadata must be an object', 400);
  }

  return {
    notes: notes as string | undefined,
    metadata: metadata as Record<string, unknown> | undefined,
  };
}

const submit = asyncHandler(async (req: Request, res: Response) => {
  const body = requestBody(req);
  const requestedPeriod = body.period === undefined ? undefined : String(body.period);
  const workflow = await approvalService.submitUpload(
    uploadIdFromRequest(req),
    actorFromRequest(req),
    requestedPeriod
  );
  res.status(200).json({ data: workflow });
});

const review = asyncHandler(async (req: Request, res: Response) => {
  const workflow = await approvalService.reviewWorkflow(
    workflowIdFromRequest(req),
    actorFromRequest(req),
    reviewInput(req)
  );
  res.status(200).json({ data: workflow });
});

const approve = asyncHandler(async (req: Request, res: Response) => {
  const workflow = await approvalService.approveWorkflow(
    workflowIdFromRequest(req),
    actorFromRequest(req)
  );
  res.status(200).json({ data: workflow });
});

const publish = asyncHandler(async (req: Request, res: Response) => {
  const workflow = await approvalService.publishWorkflow(
    workflowIdFromRequest(req),
    actorFromRequest(req)
  );
  res.status(200).json({ data: workflow });
});

const get = asyncHandler(async (req: Request, res: Response) => {
  const workflow = await approvalService.getWorkflow(workflowIdFromRequest(req));
  res.status(200).json({ data: workflow });
});

const lockPeriod = asyncHandler(async (req: Request, res: Response) => {
  const body = requestBody(req);
  const period = normalizeFiscalPeriod(req.params.period ?? body.period);
  const reason = body.reason;
  if (reason !== undefined && typeof reason !== 'string') {
    throw new AppError('Lock reason must be a string', 400);
  }

  const lock = await approvalService.lockFiscalPeriod(period, actorFromRequest(req), reason as string | undefined);
  res.status(200).json({ data: lock });
});

const unlockPeriod = asyncHandler(async (req: Request, res: Response) => {
  const body = requestBody(req);
  const period = normalizeFiscalPeriod(req.params.period ?? body.period);
  const reason = body.reason;
  if (reason !== undefined && typeof reason !== 'string') {
    throw new AppError('Unlock reason must be a string', 400);
  }

  const result = await approvalService.unlockFiscalPeriod(
    period,
    actorFromRequest(req),
    reason as string | undefined
  );
  res.status(200).json({ data: result });
});

export const approvalController = {
  submit,
  review,
  approve,
  publish,
  get,
  lockPeriod,
  unlockPeriod,
};
