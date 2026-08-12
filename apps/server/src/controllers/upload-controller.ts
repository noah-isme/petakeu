import { Request, Response } from "express";
import { utils, write } from "xlsx";

import { uploadService } from "../services/upload-service";
import { logAudit } from "../services/audit-service";
import { asyncHandler } from "../utils/async-handler";
import { AppError } from "../utils/app-error";
import { logger } from "../utils/logger";
import { uploadsTotal } from "../utils/metrics";
import { isRole } from "../middleware/auth";

import type { ConfirmUploadInput, RegionAliasInput, StagedRowPatch } from "../types/upload";

function actorId(req: Request): string {
  if (!req.user?.sub || !isRole(req.user.role)) throw new AppError('Unauthorized', 401);
  return req.user.sub;
}

function bodyObject(req: Request): Record<string, unknown> {
  return req.body && typeof req.body === 'object' && !Array.isArray(req.body)
    ? (req.body as Record<string, unknown>)
    : {};
}

const handleUpload = asyncHandler(async (req: Request, res: Response) => {
  const file = req.file;
  if (!file) {
    throw new AppError("No file uploaded", 400);
  }

  const result = await uploadService.enqueueUpload({
    filename: file.originalname,
    mimetype: file.mimetype,
    buffer: file.buffer,
    size: file.size,
    actorId: actorId(req),
  });

  uploadsTotal.inc({ status: 'queued' });
  logger.info({ uploadId: result.uploadId, filename: file.originalname, size: file.size }, 'Upload queued');

  const rawIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim();
  const ip = rawIp || req.socket.remoteAddress || req.ip || '';

  logAudit({
    event: 'upload.created',
    action: 'upload',
    endpoint: req.originalUrl || '/api/v1/uploads',
    method: 'POST',
    user_id: req.user?.sub,
    resource: 'upload',
    resource_id: result.uploadId,
    status_code: 202,
    ip_address: ip,
    user_agent: req.headers['user-agent'] || '',
    details: {
      filename: file.originalname,
      size: file.size,
      hash: result.hash,
    },
  }).catch(() => {});

  res.status(202).json({
    uploadId: result.uploadId,
    status: result.status,
    hash: result.hash
  });
});

const listUploads = asyncHandler(async (_req: Request, res: Response) => {
  const uploads = await uploadService.listUploads();
  res.json({ data: uploads });
});

const getUpload = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const record = await uploadService.getUpload(id);
  if (!record) {
    throw new AppError("Upload not found", 404);
  }

  res.json({ data: record });
});

const getTemplate = asyncHandler(async (_req: Request, res: Response) => {
  const worksheet = utils.aoa_to_sheet([
    ['kode_bps', 'provinsi', 'nama_wilayah', 'periode', 'gross_setoran', 'provincial_share', 'net_revenue', 'target', 'sumber'],
    ['3301', 'Jawa Tengah', 'Kabupaten Cilacap', '2026-01', 0, 0, 0, 0, 'PAD'],
  ]);
  const workbook = utils.book_new();
  utils.book_append_sheet(workbook, worksheet, 'Data');
  const buffer = write(workbook, { type: 'buffer', bookType: 'xlsx' });
  res
    .status(200)
    .type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    .set('Content-Disposition', 'attachment; filename="petakeu-import-template.xlsx"')
    .send(buffer);
});

const getUploadRows = asyncHandler(async (req: Request, res: Response) => {
  const page = Number(req.query.page ?? 1);
  const pageSize = Number(req.query.pageSize ?? 50);
  const result = await uploadService.getUploadRows(req.params.id, page, pageSize);
  res.json({
    data: result.data,
    meta: {
      page: result.page,
      pageSize: result.pageSize,
      total: result.total,
      totalPages: result.totalPages,
    },
  });
});

const updateUploadRow = asyncHandler(async (req: Request, res: Response) => {
  const body = bodyObject(req);
  const patch: StagedRowPatch = {
    province: body.province as string | null | undefined,
    region: (body.region ?? body.regionName) as string | null | undefined,
    codeBps: (body.codeBps ?? body.code_bps ?? body.regionCode) as string | null | undefined,
    source: body.source as string | null | undefined,
    period: body.period as string | null | undefined,
    grossAmount: (body.grossAmount ?? body.gross_amount) as StagedRowPatch['grossAmount'],
    shareAmount: (body.shareAmount ?? body.share_amount) as StagedRowPatch['shareAmount'],
    netAmount: (body.netAmount ?? body.net_amount) as StagedRowPatch['netAmount'],
    targetAmount: (body.targetAmount ?? body.target_amount) as StagedRowPatch['targetAmount'],
    acknowledgedWarningIds: Array.isArray(body.acknowledgedWarningIds)
      ? body.acknowledgedWarningIds.map(String)
      : undefined,
  };
  const revision = body.revision === undefined ? undefined : Number(body.revision);
  const row = await uploadService.updateUploadRow(req.params.id, req.params.rowId, patch, actorId(req), revision);
  res.json({ data: row });
});

const confirmUpload = asyncHandler(async (req: Request, res: Response) => {
  const body = bodyObject(req) as ConfirmUploadInput;
  const acknowledgedIds = Array.isArray(body.acknowledgedWarningIds)
    ? body.acknowledgedWarningIds
    : Array.isArray(body.acknowledgedFindingIds)
      ? body.acknowledgedFindingIds
      : undefined;
  const record = await uploadService.confirmUpload(req.params.id, actorId(req), {
    acknowledgedWarningIds: acknowledgedIds?.map(String),
    acknowledgeWarnings: body.acknowledgeWarnings === true,
    overwriteConfirmed: body.overwriteConfirmed === true,
  });
  res.json({ data: record, persistedRows: record.validRowCount ?? 0 });
});

const cancelUpload = asyncHandler(async (req: Request, res: Response) => {
  const record = await uploadService.cancelUpload(req.params.id, actorId(req));
  res.json({ data: record });
});

const listRegionAliases = asyncHandler(async (req: Request, res: Response) => {
  const regionId = typeof req.query.regionId === 'string' ? req.query.regionId : undefined;
  const provinceId = typeof req.query.provinceId === 'string' ? req.query.provinceId : undefined;
  const query = typeof req.query.query === 'string' ? req.query.query : undefined;
  const active = typeof req.query.active === 'string' ? req.query.active !== 'false' : undefined;
  const aliases = await uploadService.listRegionAliases({ regionId, provinceId, query, active });
  res.json({ data: aliases });
});

const createRegionAlias = asyncHandler(async (req: Request, res: Response) => {
  const body = bodyObject(req);
  if (typeof body.alias !== 'string' || typeof body.regionId !== 'string') {
    throw new AppError('alias and regionId are required', 400);
  }
  const alias = await uploadService.createRegionAlias(
    { alias: body.alias, regionId: body.regionId } as RegionAliasInput,
    actorId(req),
  );
  res.status(201).json({ data: alias });
});

const updateRegionAlias = asyncHandler(async (req: Request, res: Response) => {
  const body = bodyObject(req);
  const alias = await uploadService.updateRegionAlias(req.params.aliasId, {
    alias: typeof body.alias === 'string' ? body.alias : undefined,
    regionId: typeof body.regionId === 'string' ? body.regionId : undefined,
    active: body.active === undefined ? undefined : Boolean(body.active),
  }, actorId(req));
  res.json({ data: alias });
});

const deleteRegionAlias = asyncHandler(async (req: Request, res: Response) => {
  const alias = await uploadService.deactivateRegionAlias(req.params.aliasId, actorId(req));
  res.json({ data: alias });
});

export const uploadController = {
  handleUpload,
  getTemplate,
  listUploads,
  getUpload,
  getUploadRows,
  updateUploadRow,
  confirmUpload,
  cancelUpload,
  listRegionAliases,
  createRegionAlias,
  updateRegionAlias,
  deleteRegionAlias,
};
