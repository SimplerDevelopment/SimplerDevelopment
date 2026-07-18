/**
 * localStorage-backed list of the customer's most recent AI prompts so the
 * modal can offer one-click re-prompts without forcing a re-type.
 *
 * Scope is per-browser, not per-design — a customer typically re-uses the
 * same handful of "vintage motorcycle silhouette" / "smiling avocado"
 * ideas across multiple t-shirts, so widening the scope matches intent.
 *
 * Best-effort: every helper swallows storage errors (private-mode quotas,
 * disabled localStorage, JSON corruption). The modal degrades to "no
 * recent prompts" rather than crashing.
 */

import type { AiImageStyle } from './aiPromptBuilder';

const STORAGE_KEY = 'designer:ai-prompt-history';
const MAX_ENTRIES = 8;

export interface AiPromptHistoryEntry {
  prompt: string;
  style: AiImageStyle;
  transparent: boolean;
  /** ISO timestamp — used to sort + show "2h ago" if we ever surface it. */
  at: string;
}

function readRaw(): AiPromptHistoryEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is AiPromptHistoryEntry =>
        e && typeof e.prompt === 'string' && typeof e.style === 'string',
    );
  } catch {
    return [];
  }
}

function writeRaw(entries: AiPromptHistoryEntry[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // localStorage quota / disabled — give up silently.
  }
}

export function listAiPromptHistory(): AiPromptHistoryEntry[] {
  return readRaw();
}

/**
 * Stamp a prompt at the top of the history. De-dupes by case-insensitive
 * prompt text (the same idea typed twice shouldn't push every other entry
 * off the bottom of the list) and trims to MAX_ENTRIES.
 */
export function recordAiPrompt(entry: Omit<AiPromptHistoryEntry, 'at'>): void {
  const trimmed = entry.prompt.trim();
  if (!trimmed) return;
  const lower = trimmed.toLowerCase();
  const next: AiPromptHistoryEntry = {
    prompt: trimmed,
    style: entry.style,
    transparent: entry.transparent,
    at: new Date().toISOString(),
  };
  const existing = readRaw().filter(
    (e) => e.prompt.trim().toLowerCase() !== lower,
  );
  const merged = [next, ...existing].slice(0, MAX_ENTRIES);
  writeRaw(merged);
}

export function clearAiPromptHistory(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
