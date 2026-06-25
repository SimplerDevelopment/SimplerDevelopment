/**
 * SD Chat — Brain Tanstack Query hooks
 *
 * Wraps `/api/portal/brain/*` behind a typed Tanstack Query surface used by
 * every brain screen. All hooks return a plain `useQuery` result so callers
 * can branch on `isLoading` / `isError` / `data` consistently.
 *
 * Endpoints currently wired:
 * - useBrainNotes / useBrainNote — `/api/portal/brain/knowledge[/id]`
 * - useBrainDecisions / useBrainDecision — `/api/portal/brain/decisions[/id]`
 * - useBrainPeople / useBrainPerson — `/api/portal/brain/people[/id]`
 * - useBrainGlossary / useBrainGlossaryTerm — `/api/portal/brain/glossary[/id]`
 * - useBrainSearch — `/api/portal/brain/search?q=...`
 * - useBrainSuggestions — `/api/portal/brain/suggestions` (kind-discriminated
 *   server payload, mapped to visual `BrainSuggestion` tokens client-side).
 *
 * Auth / 401: every hook flows through `api.get()`, which short-circuits to
 * `{ success: false, error: 'Unauthorized' }` on 401 and lets the global
 * `setUnauthorizedHandler` clear the token. Screens render the error banner
 * — no crash.
 */
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import { api, ApiError, type ApiEnvelope } from './client';
import type {
  BrainDecisionDetail,
  BrainDecisionRow,
  BrainDecisionsListResponse,
  BrainGlossaryListResponse,
  BrainGlossaryListRow,
  BrainGlossaryTermDetail,
  BrainNoteRow,
  BrainNotesListResponse,
  BrainPeopleListResponse,
  BrainPersonDetail,
  BrainPersonListRow,
  BrainSearchResult,
  BrainSuggestion,
} from './types/brain';

/** Throws on failed envelope; caller's `useQuery` turns the throw into
 *  `isError`. Throws `ApiError` (not bare `Error`) so consumers can branch
 *  on `.code === 'BRAIN_NOT_ENTITLED'` to render an upsell instead of a
 *  generic error banner. */
function unwrap<T>(envelope: ApiEnvelope<T>): T {
  if (!envelope.success) throw new ApiError(envelope);
  return envelope.data;
}

// ─── Notes ──────────────────────────────────────────────────────────────────

export interface UseBrainNotesOpts {
  search?: string;
  tag?: string;
  pinnedOnly?: boolean;
  limit?: number;
  offset?: number;
}

export function useBrainNotes(opts: UseBrainNotesOpts = {}) {
  const params = new URLSearchParams();
  if (opts.search) params.set('search', opts.search);
  if (opts.tag) params.set('tag', opts.tag);
  if (opts.pinnedOnly) params.set('pinned', 'true');
  if (opts.limit !== undefined) params.set('limit', String(opts.limit));
  if (opts.offset !== undefined) params.set('offset', String(opts.offset));
  const qs = params.toString();
  const path = `/api/portal/brain/knowledge${qs ? `?${qs}` : ''}`;

  return useQuery({
    queryKey: ['brain', 'notes', opts] as const,
    queryFn: async () => unwrap(await api.get<BrainNotesListResponse>(path)),
  });
}

export function useBrainNote(id: number | string | null | undefined) {
  return useQuery({
    queryKey: ['brain', 'note', id] as const,
    enabled: id !== null && id !== undefined && id !== '',
    queryFn: async () =>
      unwrap(await api.get<BrainNoteRow>(`/api/portal/brain/knowledge/${id}`)),
  });
}

// ─── Decisions ──────────────────────────────────────────────────────────────

export interface UseBrainDecisionsOpts {
  status?: 'proposed' | 'accepted' | 'superseded' | 'rejected';
  limit?: number;
  offset?: number;
}

export function useBrainDecisions(opts: UseBrainDecisionsOpts = {}) {
  const params = new URLSearchParams();
  if (opts.status) params.set('status', opts.status);
  if (opts.limit !== undefined) params.set('limit', String(opts.limit));
  if (opts.offset !== undefined) params.set('offset', String(opts.offset));
  const qs = params.toString();
  const path = `/api/portal/brain/decisions${qs ? `?${qs}` : ''}`;

  return useQuery({
    queryKey: ['brain', 'decisions', opts] as const,
    queryFn: async () => unwrap(await api.get<BrainDecisionsListResponse>(path)),
  });
}

export function useBrainDecision(id: number | string | null | undefined) {
  return useQuery({
    queryKey: ['brain', 'decision', id] as const,
    enabled: id !== null && id !== undefined && id !== '',
    queryFn: async () =>
      unwrap(await api.get<BrainDecisionDetail>(`/api/portal/brain/decisions/${id}`)),
  });
}

/**
 * Re-stamp a decision's `decidedAt` to NOW. Backs the "Still accepted"
 * affordance on stale-decision suggestions — the user acknowledges the
 * decision is still current without superseding it. Invalidates the
 * suggestions feed + the decision-detail cache on success.
 */
export function useTouchDecision() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (decisionId: number) => {
      return unwrap(
        await api.patch<{ decision: unknown }>(
          `/api/portal/brain/decisions/${decisionId}`,
          { decidedAt: 'now' },
        ),
      );
    },
    onSuccess: (_, decisionId) => {
      void qc.invalidateQueries({ queryKey: ['brain', 'suggestions'] });
      void qc.invalidateQueries({ queryKey: ['brain', 'decision', decisionId] });
      void qc.invalidateQueries({ queryKey: ['brain', 'decisions'] });
    },
  });
}

/**
 * Flip every unchecked GitHub-flavored markdown checkbox in a note body to
 * checked. Backs the "Mark done" affordance on the `note_followup_stale`
 * suggestion — the user closes out all open checkboxes in one tap without
 * navigating to the note. Read the note, regex-substitute `- [ ]` → `- [x]`,
 * PATCH the new body, invalidate caches. Idempotent (already-checked boxes
 * are unchanged).
 */
export function useMarkNoteFollowupsDone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (noteId: number) => {
      const noteRes = await api.get<BrainNoteRow>(
        `/api/portal/brain/knowledge/${noteId}`,
      );
      const note = unwrap(noteRes);
      const currentBody = note.body ?? '';
      // Match `- [ ]` and `* [ ]` (with any leading whitespace) and flip the
      // box to lowercase x. Preserve indentation so nested checkboxes don't
      // get reflowed.
      const nextBody = currentBody.replace(/^(\s*[-*]\s+)\[ \]/gm, '$1[x]');
      if (nextBody === currentBody) return note;
      return unwrap(
        await api.patch<BrainNoteRow>(
          `/api/portal/brain/knowledge/${noteId}`,
          { body: nextBody },
        ),
      );
    },
    onSuccess: (_, noteId) => {
      void qc.invalidateQueries({ queryKey: ['brain', 'suggestions'] });
      void qc.invalidateQueries({ queryKey: ['brain', 'note', noteId] });
      void qc.invalidateQueries({ queryKey: ['brain', 'notes'] });
    },
  });
}

/**
 * Delete a note. The server returns a discriminated response:
 *   - first call on a live row → `{ deleted: 'soft' }` (sets deletedAt)
 *   - second call on the same row → `{ deleted: 'hard' }` (actually removes)
 * Callers should treat both as a successful delete from the user's POV. The
 * notes list query is invalidated so the row drops out of the list; the note
 * detail cache is cleared so a stale row doesn't linger if the user navigates
 * back. Suggestions are invalidated too because a deleted note can no longer
 * generate `note_followup_stale` / `note_orphan_owner` suggestions.
 */
export function useDeleteNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (noteId: number) => {
      return unwrap(
        await api.delete<{ id: number; deleted: 'soft' | 'hard' }>(
          `/api/portal/brain/knowledge/${noteId}`,
        ),
      );
    },
    onSuccess: (_, noteId) => {
      void qc.invalidateQueries({ queryKey: ['brain', 'notes'] });
      void qc.invalidateQueries({ queryKey: ['brain', 'suggestions'] });
      qc.removeQueries({ queryKey: ['brain', 'note', noteId] });
    },
  });
}

// ─── People ─────────────────────────────────────────────────────────────────

export interface UseBrainPeopleOpts {
  search?: string;
  status?: 'active' | 'inactive' | 'departed';
  limit?: number;
  offset?: number;
}

export function useBrainPeople(opts: UseBrainPeopleOpts = {}) {
  const params = new URLSearchParams();
  if (opts.search) params.set('search', opts.search);
  if (opts.status) params.set('status', opts.status);
  if (opts.limit !== undefined) params.set('limit', String(opts.limit));
  if (opts.offset !== undefined) params.set('offset', String(opts.offset));
  const qs = params.toString();
  const path = `/api/portal/brain/people${qs ? `?${qs}` : ''}`;

  return useQuery({
    queryKey: ['brain', 'people', opts] as const,
    queryFn: async () => unwrap(await api.get<BrainPeopleListResponse>(path)),
  });
}

export function useBrainPerson(id: number | string | null | undefined) {
  return useQuery({
    queryKey: ['brain', 'person', id] as const,
    enabled: id !== null && id !== undefined && id !== '',
    queryFn: async () =>
      unwrap(await api.get<BrainPersonDetail>(`/api/portal/brain/people/${id}`)),
  });
}

// ─── Glossary ───────────────────────────────────────────────────────────────

export interface UseBrainGlossaryOpts {
  search?: string;
  category?: string;
  status?: 'active' | 'deprecated';
  limit?: number;
  offset?: number;
}

export function useBrainGlossary(opts: UseBrainGlossaryOpts = {}) {
  const params = new URLSearchParams();
  if (opts.search) params.set('search', opts.search);
  if (opts.category) params.set('category', opts.category);
  if (opts.status) params.set('status', opts.status);
  if (opts.limit !== undefined) params.set('limit', String(opts.limit));
  if (opts.offset !== undefined) params.set('offset', String(opts.offset));
  const qs = params.toString();
  const path = `/api/portal/brain/glossary${qs ? `?${qs}` : ''}`;

  return useQuery({
    queryKey: ['brain', 'glossary', opts] as const,
    queryFn: async () => unwrap(await api.get<BrainGlossaryListResponse>(path)),
  });
}

/**
 * Glossary detail fetcher. The portal endpoint is keyed by numeric id,
 * not slug — the screen URL param is named `[term]` but the screen passes
 * the id (which is what list rows expose). If a slug is ever passed in,
 * the request will 400 and the screen falls back to its error state.
 */
export function useBrainGlossaryTerm(idOrSlug: number | string | null | undefined) {
  return useQuery({
    queryKey: ['brain', 'glossary-term', idOrSlug] as const,
    enabled: idOrSlug !== null && idOrSlug !== undefined && idOrSlug !== '',
    queryFn: async () =>
      unwrap(
        await api.get<BrainGlossaryTermDetail>(
          `/api/portal/brain/glossary/${idOrSlug}`,
        ),
      ),
  });
}

// ─── Search ─────────────────────────────────────────────────────────────────

/**
 * Live brain search. Caller should debounce externally — this hook only
 * gates on `query.trim().length >= 2` so a 1-char query does not hit the
 * server. `placeholderData: keepPreviousData` keeps the last results on
 * screen while a new query is in-flight so the list does not flash empty.
 */
export function useBrainSearch(query: string, limit = 25) {
  const trimmed = query.trim();
  const params = new URLSearchParams({ q: trimmed, limit: String(limit) });

  return useQuery({
    queryKey: ['brain', 'search', trimmed, limit] as const,
    enabled: trimmed.length >= 2,
    placeholderData: keepPreviousData,
    queryFn: async () =>
      unwrap(
        await api.get<BrainSearchResult>(`/api/portal/brain/search?${params}`),
      ),
  });
}

// ─── Suggestions ────────────────────────────────────────────────────────────

/**
 * Server-side shape returned by `GET /api/portal/brain/suggestions`. The
 * server stays presentation-agnostic — `kind` is the discriminator and the
 * mobile screen maps each kind to its own (accent / bg / icon / gradient)
 * visual tokens via `serverToBrainSuggestion()` below.
 */
type ServerSuggestionKind =
  | 'decision_stale'
  | 'note_orphan_owner'
  | 'note_duplicate'
  | 'glossary_orphan'
  | 'note_followup_stale';

interface ServerSuggestion {
  id: string;
  kind: ServerSuggestionKind;
  eyebrow: string;
  title: string;
  body: string;
  entityType: 'decision' | 'note' | 'glossary_term';
  entityId: number;
  cta: { primary: string; secondary: string };
}

// Map server kind → mockup visual tokens. The icons mirror the original
// `brainSuggestions` mock so the visual language stays consistent — only the
// data source changes.
const SUGGESTION_VISUALS: Record<
  ServerSuggestionKind,
  { accent: string; bg: string; icon: BrainSuggestion['icon']; gradient?: boolean }
> = {
  decision_stale: { accent: '#F59E0B', bg: '#FEF7E6', icon: 'history' },
  note_orphan_owner: { accent: '#5B5BD6', bg: '#F5F5FE', icon: 'group_add', gradient: true },
  note_duplicate: { accent: '#0BB8B0', bg: '#E6F8F7', icon: 'merge_type' },
  glossary_orphan: { accent: '#FF9500', bg: '#FFF2E0', icon: 'unpublished' },
  note_followup_stale: { accent: '#64748B', bg: '#EEF2F6', icon: 'pending_actions' },
};

function serverToBrainSuggestion(s: ServerSuggestion): BrainSuggestion {
  const v = SUGGESTION_VISUALS[s.kind];
  return {
    id: s.id,
    accent: v.accent,
    bg: v.bg,
    gradient: v.gradient,
    icon: v.icon,
    eyebrow: s.eyebrow,
    title: s.title,
    body: s.body,
    cta1: s.cta.primary,
    cta2: s.cta.secondary,
    entityType: s.entityType,
    entityId: s.entityId,
  };
}

/**
 * AI-suggestions feed. Hits `GET /api/portal/brain/suggestions` and adapts
 * the server's presentation-agnostic shape into the existing visual
 * `BrainSuggestion` tokens so the screen stays unchanged. Returns the
 * tenant-scoped heuristic list (stale decisions, orphan glossary terms,
 * duplicate-title notes, etc.). Returns 402 for un-Brain-entitled tenants —
 * the calling screen renders that as the standard "could not load" card.
 */
export function useBrainSuggestions() {
  return useQuery({
    queryKey: ['brain', 'suggestions'] as const,
    queryFn: async (): Promise<BrainSuggestion[]> => {
      const res = await api.get<ServerSuggestion[]>('/api/portal/brain/suggestions');
      if (!res.success) throw new ApiError(res);
      return res.data.map(serverToBrainSuggestion);
    },
    staleTime: 5 * 60 * 1000,
  });
}
