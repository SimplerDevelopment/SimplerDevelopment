/**
 * SD Chat — Approvals API types
 *
 * Mirrors the response shape returned by the SimplerDevelopment portal at
 *  - GET   /api/portal/approvals               → list, with `?status=pending|applied|rejected|failed`
 *  - GET   /api/portal/approvals/[id]          → single change w/ submitter info
 *  - POST  /api/portal/approvals/[id]/approve  → apply + mark applied
 *  - POST  /api/portal/approvals/[id]/reject   → mark rejected (with optional note)
 *  - POST  /api/portal/approvals/bulk-approve  → serial apply, max 25 per call
 *  - POST  /api/portal/approvals/bulk-reject   → bulk mark rejected, max 25
 *
 * The portal stages MCP CMS-write calls into `mcp_pending_changes`. Those
 * rows are what "approvals" are.
 */

export type ApprovalStatus = 'pending' | 'applied' | 'rejected' | 'failed';

/** Row from `GET /api/portal/approvals` (list-projection). */
export interface PendingChangeRow {
  id: number;
  entityType: string;
  entityId: number | null;
  operation: string;
  summary: string | null;
  status: ApprovalStatus;
  keyId: number | null;
  keyName: string | null;
  submitterName: string | null;
  reviewerId: number | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  appliedAt: string | null;
  errorMessage: string | null;
  createdAt: string;
}

/** Wire envelope of `GET /api/portal/approvals` (when `?count=true` is NOT set). */
export interface ApprovalsListResponse {
  data: PendingChangeRow[];
  meta: { role: string | null; canManage: boolean };
}

/** Full row from `GET /api/portal/approvals/[id]` — includes the raw payload + submitter. */
export interface PendingChangeDetailRow {
  id: number;
  clientId: number;
  userId: number | null;
  keyId: number | null;
  entityType: string;
  entityId: number | null;
  operation: string;
  /** JSON-encoded payload that will be applied. */
  payload: unknown;
  summary: string | null;
  status: ApprovalStatus;
  reviewerId: number | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  appliedAt: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Wire response of `GET /api/portal/approvals/[id]`. */
export interface ApprovalDetailResponse {
  change: PendingChangeDetailRow;
  keyName: string | null;
  submitterName: string | null;
  submitterEmail: string | null;
}

/** Result of one item inside a bulk approve/reject call. */
export interface BulkItemResult {
  id: number;
  status: 'applied' | 'failed' | 'skipped' | 'rejected';
  error?: string;
}

export interface BulkApproveResponse {
  total: number;
  applied: number;
  failed: number;
  skipped: number;
  results: BulkItemResult[];
}

export interface BulkRejectResponse {
  total: number;
  rejected: number;
  skipped: number;
  results: BulkItemResult[];
}

/** UI-only filter — `'pending'` shows the inbox, `'history'` shows applied/rejected/failed. */
export type ApprovalFilter = 'pending' | 'history';
