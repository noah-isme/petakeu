
import { getPgPool } from '../db/postgres';
import { hasMinimumRole, isRole } from '../middleware/auth';
import { AppError } from '../utils/app-error';

import type { PoolClient } from 'pg';
import type {
  ApprovalActor,
  ApprovalReviewInput,
  ApprovalStatus,
  ApprovalTransition,
  ApprovalWorkflow,
  FiscalPeriodLock,
} from '../types/approval';

const FISCAL_PERIOD_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

type ApprovalRow = Record<string, unknown>;

export function normalizeFiscalPeriod(value: unknown): string;
export function normalizeFiscalPeriod(value: unknown, required: true): string;
export function normalizeFiscalPeriod(value: unknown, required: false): string | undefined;
export function normalizeFiscalPeriod(value: unknown, required = true): string | undefined {
  if (value === undefined || value === null || value === '') {
    if (required) {
      throw new AppError('Fiscal period is required', 400);
    }
    return undefined;
  }

  if (typeof value !== 'string' || !FISCAL_PERIOD_PATTERN.test(value)) {
    throw new AppError('Fiscal period must use YYYY-MM format', 400);
  }

  return value;
}

function toDatabasePeriod(period: string): string {
  return `${period}-01`;
}

function fromDatabasePeriod(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const stringValue = value instanceof Date ? value.toISOString().slice(0, 10) : String(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(stringValue) ? stringValue.slice(0, 7) : stringValue;
}

function toRecord(value: unknown): Record<string, unknown> {
  if (!value) {
    return {};
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    } catch (_err) {
      return {};
    }
  }

  return typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function uploadPeriod(summary: unknown): string | undefined {
  const periodRange = toRecord(toRecord(summary).periodRange);
  const period = periodRange.from;
  if (typeof period !== 'string') {
    return undefined;
  }

  return normalizeFiscalPeriod(period, false);
}

function rowToWorkflow(row: ApprovalRow): ApprovalWorkflow {
  return {
    id: String(row.id),
    uploadId: String(row.upload_id),
    period: fromDatabasePeriod(row.period),
    status: row.status as ApprovalStatus,
    submittedBy: (row.submitted_by as string | null) ?? null,
    submittedAt: (row.submitted_at as string | null) ?? null,
    reviewedBy: (row.reviewed_by as string | null) ?? null,
    reviewedAt: (row.reviewed_at as string | null) ?? null,
    reviewNotes: (row.review_notes as string | null) ?? null,
    reviewMetadata: toRecord(row.review_metadata),
    approvedBy: (row.approved_by as string | null) ?? null,
    approvedAt: (row.approved_at as string | null) ?? null,
    publishedBy: (row.published_by as string | null) ?? null,
    publishedAt: (row.published_at as string | null) ?? null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function rowToLock(row: ApprovalRow): FiscalPeriodLock {
  return {
    period: fromDatabasePeriod(row.period) ?? '',
    lockedAt: String(row.locked_at),
    lockedBy: String(row.locked_by),
    reason: (row.reason as string | null) ?? null,
  };
}

function requireActor(actor: ApprovalActor, minimumRole: 'operator' | 'admin'): void {
  if (!actor.id || !isRole(actor.role) || !hasMinimumRole(actor.role, minimumRole)) {
    throw new AppError('Insufficient permissions', 403);
  }
}

async function withTransaction<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPgPool().connect();
  try {
    await client.query('BEGIN');
    const result = await operation(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (_rollbackError) {
      // Preserve the original database/domain error.
    }
    throw err;
  } finally {
    client.release();
  }
}

async function assertPeriodUnlockedWithClient(client: PoolClient, period: string): Promise<void> {
  const result = await client.query<{ locked: boolean }>(
    `SELECT EXISTS(
       SELECT 1 FROM fiscal_period_locks WHERE period = $1::date
     ) AS locked`,
    [toDatabasePeriod(period)]
  );

  if (result.rows[0]?.locked) {
    throw new AppError(`Fiscal period ${period} is locked`, 409);
  }
}

export async function isFiscalPeriodLocked(period: string): Promise<boolean> {
  const normalizedPeriod = normalizeFiscalPeriod(period);
  const result = await getPgPool().query<{ locked: boolean }>(
    `SELECT EXISTS(
       SELECT 1 FROM fiscal_period_locks WHERE period = $1::date
     ) AS locked`,
    [toDatabasePeriod(normalizedPeriod)]
  );
  return Boolean(result.rows[0]?.locked);
}

export async function assertFiscalPeriodUnlocked(period: string): Promise<void> {
  const normalizedPeriod = normalizeFiscalPeriod(period);
  if (await isFiscalPeriodLocked(normalizedPeriod)) {
    throw new AppError(`Fiscal period ${normalizedPeriod} is locked`, 409);
  }
}

async function loadWorkflow(client: PoolClient, identifier: string, forUpdate = false): Promise<ApprovalRow> {
  const result = await client.query(
    `SELECT id::text, upload_id::text, period, status,
            submitted_by, submitted_at, reviewed_by, reviewed_at,
            review_notes, review_metadata, approved_by, approved_at,
            published_by, published_at, created_at, updated_at
       FROM approval_workflows
      WHERE id::text = $1 OR upload_id::text = $1
      LIMIT 1${forUpdate ? ' FOR UPDATE' : ''}`,
    [identifier]
  );

  if (result.rows.length === 0) {
    throw new AppError('Approval workflow not found', 404);
  }

  return result.rows[0] as ApprovalRow;
}

async function assertWorkflowPeriodUnlocked(client: PoolClient, workflow: ApprovalRow): Promise<void> {
  const period = fromDatabasePeriod(workflow.period);
  if (period) {
    await assertPeriodUnlockedWithClient(client, period);
  }
}

async function appendTransition(
  client: PoolClient,
  workflowId: string,
  eventType: ApprovalTransition['eventType'],
  fromStatus: ApprovalStatus | null,
  toStatus: ApprovalStatus,
  actor: ApprovalActor,
  notes: string | null = null,
  metadata: Record<string, unknown> = {}
): Promise<void> {
  await client.query(
    `INSERT INTO approval_workflow_events(
       workflow_id, event_type, from_status, to_status,
       actor_id, actor_role, notes, metadata
     ) VALUES($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
    [
      workflowId,
      eventType,
      fromStatus,
      toStatus,
      actor.id,
      actor.role,
      notes,
      JSON.stringify(metadata),
    ]
  );
}

export async function submitUpload(
  uploadId: string,
  actor: ApprovalActor,
  requestedPeriod?: string
): Promise<ApprovalWorkflow> {
  requireActor(actor, 'operator');
  const explicitPeriod = normalizeFiscalPeriod(requestedPeriod, false);

  return withTransaction(async (client) => {
    const uploadResult = await client.query(
      `SELECT id::text, status, summary
         FROM uploads
        WHERE id::text = $1
        FOR SHARE`,
      [uploadId]
    );

    if (uploadResult.rows.length === 0) {
      throw new AppError('Upload not found', 404);
    }

    const upload = uploadResult.rows[0] as ApprovalRow;
    if (!['parsed', 'persisted'].includes(String(upload.status))) {
      throw new AppError('Upload is not ready for approval', 409);
    }

    const derivedPeriod = explicitPeriod ?? uploadPeriod(upload.summary);
    if (derivedPeriod) {
      await assertPeriodUnlockedWithClient(client, derivedPeriod);
    }

    const existingResult = await client.query(
      `SELECT id::text, upload_id::text, period, status,
              submitted_by, submitted_at, reviewed_by, reviewed_at,
              review_notes, review_metadata, approved_by, approved_at,
              published_by, published_at, created_at, updated_at
         FROM approval_workflows
        WHERE upload_id::text = $1
        FOR UPDATE`,
      [uploadId]
    );

    let workflowId: string;
    if (existingResult.rows.length > 0) {
      const existing = existingResult.rows[0] as ApprovalRow;
      if (existing.status !== 'draft') {
        throw new AppError(`Invalid approval transition from ${String(existing.status)}`, 409);
      }

      const existingPeriod = fromDatabasePeriod(existing.period);
      if (existingPeriod && derivedPeriod && existingPeriod !== derivedPeriod) {
        throw new AppError('Approval workflow period cannot be changed', 409);
      }
      workflowId = String(existing.id);
    } else {
      const insertResult = await client.query(
        `INSERT INTO approval_workflows(upload_id, period, status)
         VALUES($1, $2::date, 'draft')
         RETURNING id::text`,
        [uploadId, derivedPeriod ? toDatabasePeriod(derivedPeriod) : null]
      );
      workflowId = String(insertResult.rows[0].id);
    }

    const updatedResult = await client.query(
      `UPDATE approval_workflows
          SET status = 'under_review',
              period = COALESCE(period, $2::date),
              submitted_by = $3,
              submitted_at = NOW(),
              updated_at = NOW()
        WHERE id = $1
        RETURNING id::text, upload_id::text, period, status,
                  submitted_by, submitted_at, reviewed_by, reviewed_at,
                  review_notes, review_metadata, approved_by, approved_at,
                  published_by, published_at, created_at, updated_at`,
      [workflowId, derivedPeriod ? toDatabasePeriod(derivedPeriod) : null, actor.id]
    );

    await appendTransition(client, workflowId, 'submit', 'draft', 'under_review', actor, null, {
      period: derivedPeriod ?? null,
    });

    return rowToWorkflow(updatedResult.rows[0] as ApprovalRow);
  });
}

export async function reviewWorkflow(
  identifier: string,
  actor: ApprovalActor,
  input: ApprovalReviewInput = {}
): Promise<ApprovalWorkflow> {
  requireActor(actor, 'operator');
  if (input.notes !== undefined && input.notes.length > 4000) {
    throw new AppError('Review notes must be 4000 characters or fewer', 400);
  }

  return withTransaction(async (client) => {
    const workflow = await loadWorkflow(client, identifier, true);
    if (workflow.status !== 'under_review') {
      throw new AppError(`Invalid approval transition from ${String(workflow.status)}`, 409);
    }
    await assertWorkflowPeriodUnlocked(client, workflow);

    const metadata = input.metadata ?? {};
    const updatedResult = await client.query(
      `UPDATE approval_workflows
          SET reviewed_by = $2,
              reviewed_at = NOW(),
              review_notes = COALESCE($3, review_notes),
              review_metadata = CASE WHEN $4::jsonb IS NULL THEN review_metadata ELSE $4::jsonb END,
              updated_at = NOW()
        WHERE id = $1
        RETURNING id::text, upload_id::text, period, status,
                  submitted_by, submitted_at, reviewed_by, reviewed_at,
                  review_notes, review_metadata, approved_by, approved_at,
                  published_by, published_at, created_at, updated_at`,
      [
        String(workflow.id),
        actor.id,
        input.notes ?? null,
        input.metadata === undefined ? null : JSON.stringify(metadata),
      ]
    );

    await appendTransition(
      client,
      String(workflow.id),
      'review',
      'under_review',
      'under_review',
      actor,
      input.notes ?? null,
      metadata
    );

    return rowToWorkflow(updatedResult.rows[0] as ApprovalRow);
  });
}

export async function approveWorkflow(
  identifier: string,
  actor: ApprovalActor
): Promise<ApprovalWorkflow> {
  requireActor(actor, 'admin');

  return withTransaction(async (client) => {
    const workflow = await loadWorkflow(client, identifier, true);
    if (workflow.status !== 'under_review') {
      throw new AppError(`Invalid approval transition from ${String(workflow.status)}`, 409);
    }
    if (!workflow.reviewed_at) {
      throw new AppError('Workflow must be reviewed before approval', 409);
    }
    await assertWorkflowPeriodUnlocked(client, workflow);

    const updatedResult = await client.query(
      `UPDATE approval_workflows
          SET status = 'approved', approved_by = $2, approved_at = NOW(), updated_at = NOW()
        WHERE id = $1
        RETURNING id::text, upload_id::text, period, status,
                  submitted_by, submitted_at, reviewed_by, reviewed_at,
                  review_notes, review_metadata, approved_by, approved_at,
                  published_by, published_at, created_at, updated_at`,
      [String(workflow.id), actor.id]
    );

    await appendTransition(client, String(workflow.id), 'approve', 'under_review', 'approved', actor);
    return rowToWorkflow(updatedResult.rows[0] as ApprovalRow);
  });
}

export async function publishWorkflow(
  identifier: string,
  actor: ApprovalActor
): Promise<ApprovalWorkflow> {
  requireActor(actor, 'admin');

  return withTransaction(async (client) => {
    const workflow = await loadWorkflow(client, identifier, true);
    if (workflow.status !== 'approved') {
      throw new AppError(`Invalid approval transition from ${String(workflow.status)}`, 409);
    }
    await assertWorkflowPeriodUnlocked(client, workflow);

    const updatedResult = await client.query(
      `UPDATE approval_workflows
          SET status = 'published', published_by = $2, published_at = NOW(), updated_at = NOW()
        WHERE id = $1
        RETURNING id::text, upload_id::text, period, status,
                  submitted_by, submitted_at, reviewed_by, reviewed_at,
                  review_notes, review_metadata, approved_by, approved_at,
                  published_by, published_at, created_at, updated_at`,
      [String(workflow.id), actor.id]
    );

    await appendTransition(client, String(workflow.id), 'publish', 'approved', 'published', actor);
    return rowToWorkflow(updatedResult.rows[0] as ApprovalRow);
  });
}

export async function getWorkflow(identifier: string): Promise<ApprovalWorkflow> {
  const result = await getPgPool().query(
    `SELECT id::text, upload_id::text, period, status,
            submitted_by, submitted_at, reviewed_by, reviewed_at,
            review_notes, review_metadata, approved_by, approved_at,
            published_by, published_at, created_at, updated_at
       FROM approval_workflows
      WHERE id::text = $1 OR upload_id::text = $1
      LIMIT 1`,
    [identifier]
  );

  if (result.rows.length === 0) {
    throw new AppError('Approval workflow not found', 404);
  }

  return rowToWorkflow(result.rows[0] as ApprovalRow);
}

export async function lockFiscalPeriod(
  period: string,
  actor: ApprovalActor,
  reason?: string
): Promise<FiscalPeriodLock> {
  requireActor(actor, 'admin');
  const normalizedPeriod = normalizeFiscalPeriod(period);
  if (reason !== undefined && reason.length > 1000) {
    throw new AppError('Lock reason must be 1000 characters or fewer', 400);
  }

  return withTransaction(async (client) => {
    const existing = await client.query(
      `SELECT period, locked_at, locked_by, reason
         FROM fiscal_period_locks
        WHERE period = $1::date
        FOR UPDATE`,
      [toDatabasePeriod(normalizedPeriod)]
    );
    if (existing.rows.length > 0) {
      throw new AppError(`Fiscal period ${normalizedPeriod} is already locked`, 409);
    }

    const inserted = await client.query(
      `INSERT INTO fiscal_period_locks(period, locked_by, reason)
       VALUES($1::date, $2, $3)
       RETURNING period, locked_at, locked_by, reason`,
      [toDatabasePeriod(normalizedPeriod), actor.id, reason ?? null]
    );
    await client.query(
      `INSERT INTO fiscal_period_lock_events(period, event_type, actor_id, reason)
       VALUES($1::date, 'locked', $2, $3)`,
      [toDatabasePeriod(normalizedPeriod), actor.id, reason ?? null]
    );

    return rowToLock(inserted.rows[0] as ApprovalRow);
  });
}

export async function unlockFiscalPeriod(
  period: string,
  actor: ApprovalActor,
  reason?: string
): Promise<{ period: string; unlockedBy: string; unlockedAt: string }> {
  requireActor(actor, 'admin');
  const normalizedPeriod = normalizeFiscalPeriod(period);
  if (reason !== undefined && reason.length > 1000) {
    throw new AppError('Unlock reason must be 1000 characters or fewer', 400);
  }

  return withTransaction(async (client) => {
    const existing = await client.query(
      `SELECT period FROM fiscal_period_locks WHERE period = $1::date FOR UPDATE`,
      [toDatabasePeriod(normalizedPeriod)]
    );
    if (existing.rows.length === 0) {
      throw new AppError(`Fiscal period ${normalizedPeriod} is not locked`, 404);
    }

    await client.query(`DELETE FROM fiscal_period_locks WHERE period = $1::date`, [
      toDatabasePeriod(normalizedPeriod),
    ]);
    await client.query(
      `INSERT INTO fiscal_period_lock_events(period, event_type, actor_id, reason)
       VALUES($1::date, 'unlocked', $2, $3)`,
      [toDatabasePeriod(normalizedPeriod), actor.id, reason ?? null]
    );

    return {
      period: normalizedPeriod,
      unlockedBy: actor.id,
      unlockedAt: new Date().toISOString(),
    };
  });
}

export const approvalService = {
  submitUpload,
  reviewWorkflow,
  approveWorkflow,
  publishWorkflow,
  getWorkflow,
  lockFiscalPeriod,
  unlockFiscalPeriod,
  isFiscalPeriodLocked,
  assertFiscalPeriodUnlocked,
};
