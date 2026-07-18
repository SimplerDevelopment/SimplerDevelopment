/**
 * SD Chat — Tanstack Query hooks for the shared media library
 *
 * Backed by the SimplerDevelopment portal endpoints
 *  - GET    /api/portal/media          → list (paginated, with branding profiles)
 *  - DELETE /api/portal/media/[id]     → hard delete (tenant-scoped)
 *
 * The portal does NOT yet expose a per-mime-type count endpoint, so the
 * filter chip counts are computed client-side from whatever page the API
 * returned. (Phase 4 enhancement: add `?countsByMime=true` to the route.)
 *
 * `useMediaItem` is implemented as a client-side lookup against the cached
 * list — the portal does not have a `/api/portal/media/[id]` GET endpoint,
 * only PUT/DELETE. Good enough for the mobile preview surface.
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
  MediaFilter,
  MediaKind,
  MediaListResponse,
  MediaRow,
} from './types/media';

// ─── query keys ────────────────────────────────────────────────────────────

export const mediaKeys = {
  all: ['media'] as const,
  list: (filter: MediaFilter) => ['media', filter] as const,
};

// ─── mime → UI kind ────────────────────────────────────────────────────────

/** Bucket a raw MIME string into one of four UI categories. */
export function mimeTypeToKind(mimeType: string | null | undefined): MediaKind {
  if (!mimeType) return 'doc';
  const m = mimeType.toLowerCase();
  if (m.startsWith('image/')) return 'image';
  if (m.startsWith('video/')) return 'video';
  if (m.startsWith('audio/')) return 'audio';
  return 'doc';
}

/** Server-side query-string for the media `mimeType` filter (matches `LIKE` prefix). */
function filterToMimePrefix(filter: MediaFilter): string | null {
  if (filter === 'all') return null;
  if (filter === 'image') return 'image/';
  if (filter === 'video') return 'video/';
  if (filter === 'audio') return 'audio/';
  // 'doc' is everything that isn't image/video/audio. The portal route
  // only supports a single LIKE prefix, so we fetch unfiltered and bucket
  // client-side. See `useMedia` below.
  return null;
}

// ─── list ──────────────────────────────────────────────────────────────────

export interface UseMediaResult {
  items: MediaRow[];
  /** Per-kind counts derived from whatever the API returned. */
  counts: Record<MediaFilter, number>;
  total: number;
}

/**
 * Fetch the shared media library, optionally filtered to a single UI kind.
 *
 * Behaviour notes:
 *  - `'image' | 'video' | 'audio'` → query the portal with `?mimeType=image/`
 *    (etc.) so we don't shuttle extra rows.
 *  - `'doc'` → fetch unfiltered and bucket client-side, because the portal
 *    route only supports a single LIKE prefix and "doc" is "everything
 *    else".
 *  - `'all'` → unfiltered fetch, counts populated from the response.
 *
 * Returns `{ items, counts, total }` so the Media tab can power both the
 * grid and the filter-chip badges from one query.
 */
export function useMedia(
  filter: MediaFilter = 'all',
): UseQueryResult<UseMediaResult, Error> {
  return useQuery<UseMediaResult, Error>({
    queryKey: mediaKeys.list(filter),
    queryFn: async () => {
      const mimePrefix = filterToMimePrefix(filter);
      const qs = new URLSearchParams({ limit: '100' });
      if (mimePrefix) qs.set('mimeType', mimePrefix);

      const res = await api.get<MediaRow[]>(`/api/portal/media?${qs.toString()}`);
      if (!res.success) throw new Error(res.error);

      // The portal returns `{ success, data: rows, brandingProfiles, pagination }`
      // — our envelope flattens `data` into `res.data`, but the extra fields
      // come along on the underlying body. We don't surface them to the UI
      // yet, so just use `res.data` here.
      const rows = res.data;

      // Bucket every returned row by kind so filter chips can display counts
      // regardless of which subset we just fetched.
      const counts: Record<MediaFilter, number> = {
        all: rows.length,
        image: 0,
        video: 0,
        audio: 0,
        doc: 0,
      };
      for (const r of rows) counts[mimeTypeToKind(r.mimeType)]++;

      // Apply the "doc" client-side bucket if needed.
      const items =
        filter === 'doc' ? rows.filter((r) => mimeTypeToKind(r.mimeType) === 'doc') : rows;

      return { items, counts, total: rows.length };
    },
    staleTime: 60 * 1000,
  });
}

// ─── single item ───────────────────────────────────────────────────────────

/**
 * Look up a single media item from the cached `'all'` list. Returns
 * `undefined` until the list query has resolved. The portal has no GET
 * `/api/portal/media/[id]` route, so the cache is the source of truth.
 */
export function useMediaItem(id: number | null | undefined): MediaRow | undefined {
  const qc = useQueryClient();
  if (id == null) return undefined;
  const all = qc.getQueryData<UseMediaResult>(mediaKeys.list('all'));
  return all?.items.find((m) => m.id === id);
}

// ─── delete ────────────────────────────────────────────────────────────────

/**
 * Delete a media item by id. Invalidates every `['media', ...]` query so
 * filter chip counts and the grid both re-sync after the call.
 */
export function useDeleteMedia(): UseMutationResult<{ id: number }, Error, number> {
  const qc = useQueryClient();
  return useMutation<{ id: number }, Error, number>({
    mutationFn: async (id: number) => {
      const res = await api.delete<{ message: string }>(`/api/portal/media/${id}`);
      if (!res.success) throw new Error(res.error);
      return { id };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: mediaKeys.all });
    },
  });
}
