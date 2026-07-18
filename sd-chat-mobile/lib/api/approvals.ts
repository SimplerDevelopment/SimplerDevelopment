/**
 * SD Chat — Tanstack Query hooks for the approvals queue
 *
 * Backed by the SimplerDevelopment portal endpoints
 *  - GET   /api/portal/approvals                  → list (filter by `?status=`)
 *  - GET   /api/portal/approvals/[id]             → single change w/ submitter info
 *  - POST  /api/portal/approvals/[id]/approve     → apply + mark applied
 *  - POST  /api/portal/approvals/[id]/reject      → mark rejected
 *  - POST  /api/portal/approvals/bulk-approve     → serial apply, max 25
 *  - POST  /api/portal/approvals/bulk-reject      → bulk mark rejected, max 25
 *
 * History is just `status != pending` — we fetch each terminal status
 * separately and concatenate (the portal route returns up to 100 rows per
 * call sorted by `createdAt desc`, which is plenty for the "recent
 * history" view).
 *
 * Approve + reject mutations are optimistic against the
 * `['approvals', 'pending']` list: the row is removed immediately and
 * restored on error.
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import { api } from './client';
import type {
  ApprovalDetailResponse,
  ApprovalFilter,
  BulkApproveResponse,
  BulkRejectResponse,
  PendingChangeRow,
} from './types/approvals';

// ─── query keys ────────────────────────────────────────────────────────────

export const approvalKeys = {
  all: ['approvals'] as const,
  list: (status: ApprovalFilter) => ['approvals', status] as const,
  detail: (id: number | string) => ['approval', id] as const,
};

// ─── list ──────────────────────────────────────────────────────────────────

/**
 * Fetch approvals. `'pending'` returns just `status=pending`; `'history'`
 * concatenates applied + rejected + failed (latest first within each
 * bucket, then by createdAt desc overall).
 */
export function useApprovals(
  status: ApprovalFilter = 'pending',
): UseQueryResult<PendingChangeRow[], Error> {
  return useQuery<PendingChangeRow[], Error>({
    queryKey: approvalKeys.list(status),
    queryFn: async () => {
      if (status === 'pending') {
        const res = await api.get<PendingChangeRow[]>(
          '/api/portal/approvals?status=pending',
        );
        if (!res.success) throw new Error(res.error);
        return res.data;
      }

      // History: fan out across the three terminal statuses and merge.
      const [applied, rejected, failed] = await Promise.all([
        api.get<PendingChangeRow[]>('/api/portal/approvals?status=applied'),
        api.get<PendingChangeRow[]>('/api/portal/approvals?status=rejected'),
        api.get<PendingChangeRow[]>('/api/portal/approvals?status=failed'),
      ]);

      const rows: PendingChangeRow[] = [];
      for (const r of [applied, rejected, failed]) {
        if (r.success) rows.push(...r.data);
      }
      // If every fan-out failed, surface a clear error rather than empty list.
      if (rows.length === 0 && !applied.success && !rejected.success && !failed.success) {
        throw new Error(applied.success ? 'Failed to load history' : applied.error);
      }
      return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    staleTime: 30 * 1000,
  });
}

// ─── detail ────────────────────────────────────────────────────────────────

export function useApproval(
  id: number | string | null | undefined,
): UseQueryResult<ApprovalDetailResponse, Error> {
  const enabled =
    id !== null && id !== undefined && id !== '' && !Number.isNaN(Number(id));

  return useQuery<ApprovalDetailResponse, Error>({
    queryKey: approvalKeys.detail(id ?? ''),
    queryFn: async () => {
      const res = await api.get<ApprovalDetailResponse>(
        `/api/portal/approvals/${id}`,
      );
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
    enabled,
    staleTime: 10 * 1000,
  });
}

// ─── mutations ─────────────────────────────────────────────────────────────

interface ApprovePayload {
  id: number;
  note?: string;
}

interface RejectPayload {
  id: number;
  note?: string;
}

/**
 * Approve a single pending change. Optimistically removes the row from the
 * `['approvals', 'pending']` cache; on error, the previous list is
 * restored. On success, invalidates history so the row reappears there.
 */
export function useApprove(): UseMutationResult<
  { change: unknown; result: unknown },
  Error,
  ApprovePayload,
  { previousPending: PendingChangeRow[] | undefined }
> {
  const qc = useQueryClient();
  return useMutation<
    { change: unknown; result: unknown },
    Error,
    ApprovePayload,
    { previousPending: PendingChangeRow[] | undefined }
  >({
    mutationFn: async ({ id, note }) => {
      const res = await api.post<{ change: unknown; result: unknown }>(
        `/api/portal/approvals/${id}/approve`,
        { note },
      );
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
    onMutate: async ({ id }) => {
      await qc.cancelQueries({ queryKey: approvalKeys.list('pending') });
      const previousPending = qc.getQueryData<PendingChangeRow[]>(
        approvalKeys.list('pending'),
      );
      qc.setQueryData<PendingChangeRow[]>(
        approvalKeys.list('pending'),
        (old) => (old ?? []).filter((c) => c.id !== id),
      );
      return { previousPending };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previousPending) {
        qc.setQueryData(approvalKeys.list('pending'), ctx.previousPending);
      }
    },
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: approvalKeys.list('history') });
      qc.invalidateQueries({ queryKey: approvalKeys.detail(id) });
    },
  });
}

/**
 * Reject a single pending change (with optional reason). Same optimistic
 * pattern as `useApprove`.
 */
export function useReject(): UseMutationResult<
  unknown,
  Error,
  RejectPayload,
  { previousPending: PendingChangeRow[] | undefined }
> {
  const qc = useQueryClient();
  return useMutation<
    unknown,
    Error,
    RejectPayload,
    { previousPending: PendingChangeRow[] | undefined }
  >({
    mutationFn: async ({ id, note }) => {
      const res = await api.post<unknown>(
        `/api/portal/approvals/${id}/reject`,
        { note },
      );
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
    onMutate: async ({ id }) => {
      await qc.cancelQueries({ queryKey: approvalKeys.list('pending') });
      const previousPending = qc.getQueryData<PendingChangeRow[]>(
        approvalKeys.list('pending'),
      );
      qc.setQueryData<PendingChangeRow[]>(
        approvalKeys.list('pending'),
        (old) => (old ?? []).filter((c) => c.id !== id),
      );
      return { previousPending };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previousPending) {
        qc.setQueryData(approvalKeys.list('pending'), ctx.previousPending);
      }
    },
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: approvalKeys.list('history') });
      qc.invalidateQueries({ queryKey: approvalKeys.detail(id) });
    },
  });
}

/**
 * Approve a batch of pending changes. Uses the portal's native
 * `bulk-approve` endpoint (serial apply server-side, cap of 25 per call;
 * we split larger batches across multiple sequential calls).
 *
 * Optimistically removes every targeted row from the pending list.
 */
export function useBulkApprove(): UseMutationResult<
  BulkApproveResponse,
  Error,
  { ids: number[]; note?: string },
  { previousPending: PendingChangeRow[] | undefined }
> {
  const qc = useQueryClient();
  const MAX_BATCH = 25;

  return useMutation<
    BulkApproveResponse,
    Error,
    { ids: number[]; note?: string },
    { previousPending: PendingChangeRow[] | undefined }
  >({
    mutationFn: async ({ ids, note }) => {
      if (ids.length === 0) {
        return { total: 0, applied: 0, failed: 0, skipped: 0, results: [] };
      }

      // Split into ≤25-id chunks; the portal enforces the cap server-side.
      const chunks: number[][] = [];
      for (let i = 0; i < ids.length; i += MAX_BATCH) {
        chunks.push(ids.slice(i, i + MAX_BATCH));
      }

      const aggregate: BulkApproveResponse = {
        total: 0,
        applied: 0,
        failed: 0,
        skipped: 0,
        results: [],
      };
      for (const chunk of chunks) {
        const res = await api.post<BulkApproveResponse>(
          '/api/portal/approvals/bulk-approve',
          { ids: chunk, note },
        );
        if (!res.success) throw new Error(res.error);
        aggregate.total += res.data.total;
        aggregate.applied += res.data.applied;
        aggregate.failed += res.data.failed;
        aggregate.skipped += res.data.skipped;
        aggregate.results.push(...res.data.results);
      }
      return aggregate;
    },
    onMutate: async ({ ids }) => {
      await qc.cancelQueries({ queryKey: approvalKeys.list('pending') });
      const previousPending = qc.getQueryData<PendingChangeRow[]>(
        approvalKeys.list('pending'),
      );
      const idSet = new Set(ids);
      qc.setQueryData<PendingChangeRow[]>(
        approvalKeys.list('pending'),
        (old) => (old ?? []).filter((c) => !idSet.has(c.id)),
      );
      return { previousPending };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previousPending) {
        qc.setQueryData(approvalKeys.list('pending'), ctx.previousPending);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: approvalKeys.list('history') });
    },
  });
}

/**
 * Reject a batch of pending changes. Uses the portal's native
 * `bulk-reject` endpoint. Same optimistic pattern as `useBulkApprove`.
 */
export function useBulkReject(): UseMutationResult<
  BulkRejectResponse,
  Error,
  { ids: number[]; note?: string },
  { previousPending: PendingChangeRow[] | undefined }
> {
  const qc = useQueryClient();
  const MAX_BATCH = 25;

  return useMutation<
    BulkRejectResponse,
    Error,
    { ids: number[]; note?: string },
    { previousPending: PendingChangeRow[] | undefined }
  >({
    mutationFn: async ({ ids, note }) => {
      if (ids.length === 0) {
        return { total: 0, rejected: 0, skipped: 0, results: [] };
      }
      const chunks: number[][] = [];
      for (let i = 0; i < ids.length; i += MAX_BATCH) {
        chunks.push(ids.slice(i, i + MAX_BATCH));
      }
      const aggregate: BulkRejectResponse = {
        total: 0,
        rejected: 0,
        skipped: 0,
        results: [],
      };
      for (const chunk of chunks) {
        const res = await api.post<BulkRejectResponse>(
          '/api/portal/approvals/bulk-reject',
          { ids: chunk, note },
        );
        if (!res.success) throw new Error(res.error);
        aggregate.total += res.data.total;
        aggregate.rejected += res.data.rejected;
        aggregate.skipped += res.data.skipped;
        aggregate.results.push(...res.data.results);
      }
      return aggregate;
    },
    onMutate: async ({ ids }) => {
      await qc.cancelQueries({ queryKey: approvalKeys.list('pending') });
      const previousPending = qc.getQueryData<PendingChangeRow[]>(
        approvalKeys.list('pending'),
      );
      const idSet = new Set(ids);
      qc.setQueryData<PendingChangeRow[]>(
        approvalKeys.list('pending'),
        (old) => (old ?? []).filter((c) => !idSet.has(c.id)),
      );
      return { previousPending };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previousPending) {
        qc.setQueryData(approvalKeys.list('pending'), ctx.previousPending);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: approvalKeys.list('history') });
    },
  });
}
