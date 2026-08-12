import { Request, Response } from 'express';
import { z } from 'zod';

import { analyticsService } from '../services/analytics-service';
import { asyncHandler } from '../utils/async-handler';
import { AppError } from '../utils/app-error';
import {
  normalizeAnalyticsOverviewQuery,
  normalizeAnalyticsRankingQuery,
  normalizeTargetListQuery,
  targetRegistrationSchema,
} from '../validators/analytics';

function validationError(error: z.ZodError): AppError {
  return new AppError('Invalid analytics request', 400, error.flatten());
}

const getOverview = asyncHandler(async (req: Request, res: Response) => {
  let params;
  try {
    params = normalizeAnalyticsOverviewQuery(req.query as Record<string, unknown>);
  } catch (error) {
    if (error instanceof z.ZodError) throw validationError(error);
    throw error;
  }

  const data = await analyticsService.getOverview(params);
  res.json({ data });
});

const getRankings = asyncHandler(async (req: Request, res: Response) => {
  let params;
  try {
    params = normalizeAnalyticsRankingQuery(req.query as Record<string, unknown>);
  } catch (error) {
    if (error instanceof z.ZodError) throw validationError(error);
    throw error;
  }

  const data = await analyticsService.getRankings(params);
  res.json({ data });
});

const getReportingMatrix = asyncHandler(async (req: Request, res: Response) => {
  let params;
  try {
    params = normalizeAnalyticsRankingQuery(req.query as Record<string, unknown>);
  } catch (error) {
    if (error instanceof z.ZodError) throw validationError(error);
    throw error;
  }

  const data = await analyticsService.getReportingMatrix({
    ...params,
    rankingCriterion: params.rankingCriterion,
  });
  res.json({ data });
});

const getReportingMatrixDetail = asyncHandler(async (req: Request, res: Response) => {
  const period = String(req.params.period);
  const regionId = String(req.params.regionId);
  let parsed;
  try {
    parsed = normalizeAnalyticsRankingQuery({ period });
  } catch (error) {
    if (error instanceof z.ZodError) throw validationError(error);
    throw error;
  }
  const data = await analyticsService.getReportingMatrixDetail(regionId, parsed.period);
  res.json({ data });
});

const registerTarget = asyncHandler(async (req: Request, res: Response) => {
  const parsed = targetRegistrationSchema.safeParse(req.body);
  if (!parsed.success) {
    throw validationError(parsed.error);
  }
  if (!req.user?.sub) {
    throw new AppError('Unauthorized', 401);
  }

  const data = await analyticsService.registerTarget(parsed.data, req.user.sub);
  res.status(201).json({ data });
});

const listTargets = asyncHandler(async (req: Request, res: Response) => {
  let params;
  try {
    params = normalizeTargetListQuery(req.query as Record<string, unknown>);
  } catch (error) {
    if (error instanceof z.ZodError) throw validationError(error);
    throw error;
  }

  const data = await analyticsService.listTargets(params);
  res.json({ data });
});

export const analyticsController = {
  getOverview,
  getRankings,
  getReportingMatrix,
  getReportingMatrixDetail,
  registerTarget,
  listTargets,
};
