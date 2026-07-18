/**
 * SD Chat — Tanstack Query hooks for AI conversations
 *
 * Backed by the SimplerDevelopment portal endpoints
 *  - GET  /api/portal/ai/conversations          → AiConversation[]
 *  - GET  /api/portal/ai/conversations/[id]     → { conversation, messages }
 *
 * Refetch policy:
 *  - List: stale 30s, refetch on app focus (React Native AppState).
 *  - Detail: stale 10s (a conversation rarely changes server-side between
 *    opens; the live streaming session manages its own freshness), disabled
 *    when `id` is falsy or 'new' (the "compose a new chat" sentinel).
 *
 * Mutations (`useDeleteConversation`, `useUpdateConversationTitle`) are
 * scaffolded against the eventual REST shape but currently throw because
 * sd2026 does not yet expose DELETE / PATCH on the conversation routes —
 * see `lib/api/types/chat.ts` and the report-back at the end of Phase 4
 * Agent A.
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';
import { useEffect } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { api } from './client';
import type {
  AiConversation,
  AiConversationDetail,
} from './types/chat';

// ─── query keys ────────────────────────────────────────────────────────────

export const conversationKeys = {
  all: ['conversations'] as const,
  detail: (id: number | string) => ['conversation', id] as const,
};

// ─── list ──────────────────────────────────────────────────────────────────

/**
 * Fetch all AI conversations for the signed-in user (scoped to their
 * portal client server-side). Returns rows sorted by `updatedAt desc` —
 * the portal already sorts; we trust that order.
 *
 * Surfaces unauthorized / network errors via the standard React Query
 * `error` field. The `api` client also fires the global 401 handler which
 * bounces the user to sign-in.
 */
export function useConversations(): UseQueryResult<AiConversation[], Error> {
  const qc = useQueryClient();

  // Refetch on app foreground (React Native equivalent of
  // refetchOnWindowFocus). Cheap: tanstack only re-runs queries currently
  // observed by mounted components.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') {
        qc.invalidateQueries({ queryKey: conversationKeys.all });
      }
    });
    return () => sub.remove();
  }, [qc]);

  return useQuery<AiConversation[], Error>({
    queryKey: conversationKeys.all,
    queryFn: async () => {
      const res = await api.get<AiConversation[]>('/api/portal/ai/conversations');
      if (!res.success) throw new Error(res.error);
      // Defensive: the portal already sorts updatedAt desc, but coerce in
      // case the route changes shape later.
      return [...res.data].sort((a, b) =>
        b.updatedAt.localeCompare(a.updatedAt),
      );
    },
    staleTime: 30 * 1000,
  });
}

// ─── detail ────────────────────────────────────────────────────────────────

/**
 * Fetch one conversation + its full message history. Disabled when `id` is
 * empty or the special sentinel 'new' (used by the compose-new-chat flow,
 * which has no persisted conversation yet — the first send mints the row).
 */
export function useConversation(
  id: number | string | null | undefined,
): UseQueryResult<AiConversationDetail, Error> {
  const enabled =
    id !== null &&
    id !== undefined &&
    id !== '' &&
    id !== 'new' &&
    !Number.isNaN(Number(id));

  return useQuery<AiConversationDetail, Error>({
    queryKey: conversationKeys.detail(id ?? ''),
    queryFn: async () => {
      const res = await api.get<AiConversationDetail>(
        `/api/portal/ai/conversations/${id}`,
      );
      if (!res.success) throw new Error(res.error);
      return res.data;
    },
    enabled,
    staleTime: 10 * 1000,
  });
}

// ─── mutations (scaffolded — backend missing) ──────────────────────────────

/**
 * Delete a conversation. **Currently unimplemented on the backend.** Calling
 * this hook will throw a clear error so the UI can surface "not yet
 * supported" instead of silently failing. When sd2026 adds the route, switch
 * the body to `api.delete<{ id: number }>(...)` and invalidate
 * `conversationKeys.all`.
 */
export function useDeleteConversation(): UseMutationResult<
  { id: number },
  Error,
  number
> {
  const qc = useQueryClient();
  return useMutation<{ id: number }, Error, number>({
    mutationFn: async (_id: number) => {
      throw new Error(
        'Delete conversation is not yet supported by the portal API.',
      );
    },
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: conversationKeys.all });
      qc.removeQueries({ queryKey: conversationKeys.detail(id) });
    },
  });
}

/**
 * Rename a conversation. **Currently unimplemented on the backend.** Same
 * story as delete — placeholder shape so the UI compiles against the right
 * signature; flip to `api.patch(...)` once the route lands.
 */
export function useUpdateConversationTitle(): UseMutationResult<
  AiConversation,
  Error,
  { id: number; title: string }
> {
  const qc = useQueryClient();
  return useMutation<AiConversation, Error, { id: number; title: string }>({
    mutationFn: async (_args) => {
      throw new Error(
        'Rename conversation is not yet supported by the portal API.',
      );
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: conversationKeys.all });
      qc.invalidateQueries({ queryKey: conversationKeys.detail(data.id) });
    },
  });
}
