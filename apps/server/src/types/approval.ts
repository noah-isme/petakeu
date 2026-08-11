import type { Role } from '../middleware/auth';

export const APPROVAL_STATUSES = ['draft', 'under_review', 'approved', 'published'] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

export const APPROVAL_EVENT_TYPES = ['submit', 'review', 'approve', 'publish'] as const;
export type ApprovalEventType = (typeof APPROVAL_EVENT_TYPES)[number];

export interface ApprovalActor {
  id: string;
  role: Role;
}

export interface ApprovalReviewInput {
  notes?: string;
  metadata?: Record<string, unknown>;
}

export interface ApprovalWorkflow {
  id: string;
  uploadId: string;
  period?: string | null;
  status: ApprovalStatus;
  submittedBy?: string | null;
  submittedAt?: string | null;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  reviewNotes?: string | null;
  reviewMetadata: Record<string, unknown>;
  approvedBy?: string | null;
  approvedAt?: string | null;
  publishedBy?: string | null;
  publishedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApprovalTransition {
  id: string;
  workflowId: string;
  eventType: ApprovalEventType;
  fromStatus?: ApprovalStatus | null;
  toStatus: ApprovalStatus;
  actorId: string;
  actorRole: Role;
  notes?: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface FiscalPeriodLock {
  period: string;
  lockedAt: string;
  lockedBy: string;
  reason?: string | null;
}
