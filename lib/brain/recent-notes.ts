/**
 * Recent-notes ring buffer in localStorage.
 *
 * Stores the last MAX_RECENT note ids the user has opened in the brain
 * knowledge UI, most-recent-first. Used by the Cmd-K command palette to
 * surface a quick "Recent" section when the search query is empty.
 */

const STORAGE_KEY = 'brain.knowledge.recent';
const MAX_RECENT = 12;

export function getRecentNoteIds(): number[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
      .slice(0, MAX_RECENT);
  } catch {
    return [];
  }
}

export function pushRecentNoteId(id: number): void {
  if (typeof window === 'undefined') return;
  if (!Number.isFinite(id)) return;
  try {
    const current = getRecentNoteIds();
    const deduped = [id, ...current.filter((existing) => existing !== id)].slice(0, MAX_RECENT);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(deduped));
  } catch {
    /* non-fatal */
  }
}
