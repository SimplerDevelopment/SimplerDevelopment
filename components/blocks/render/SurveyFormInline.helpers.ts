/**
 * Pure helpers for SurveyFormInline — extracted verbatim from
 * SurveyFormInline.tsx, no behavior change.
 */

import { ALLOWED_SURVEY_UPLOAD_MIMES } from '@/lib/surveys/upload-validation';
import type { SurveyFieldOption } from './SurveyFormInline.types';

/**
 * Mirror of the server allow-list, joined for use as the <input type="file">
 * `accept` attribute. UX hint only — the server is the gate.
 */
export const SURVEY_FILE_ACCEPT_ATTR = ALLOWED_SURVEY_UPLOAD_MIMES.join(',');

/**
 * RESP-02: per-(slug, browser) session identifier used to upsert the
 * `survey_partial_responses` row. Stored in localStorage so a returning
 * visitor on the same browser resumes where they left off; lost if they
 * clear storage or switch devices (acceptable for a public form).
 */
export function partialSessionKey(slug: string): string {
  return `sd-survey-session:${slug}`;
}

export function getOrCreatePartialSessionId(slug: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const key = partialSessionKey(slug);
    let id = window.localStorage.getItem(key);
    if (!id) {
      // crypto.randomUUID is widely supported in 2026 browsers; fall back to
      // a Math.random hex string only if it's somehow missing.
      id =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : Array.from({ length: 4 }, () =>
              Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, '0'),
            ).join('-');
      window.localStorage.setItem(key, id);
    }
    return id;
  } catch {
    return null;
  }
}

export function clearPartialSessionId(slug: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(partialSessionKey(slug));
  } catch {
    // localStorage can throw in private-mode or quota-exceeded — best-effort.
  }
}

export function lightenColor(hex: string, amount: number): string {
  const c = hex.replace('#', '');
  const r = Math.min(255, parseInt(c.slice(0, 2), 16) + Math.round(255 * amount));
  const g = Math.min(255, parseInt(c.slice(2, 4), 16) + Math.round(255 * amount));
  const b = Math.min(255, parseInt(c.slice(4, 6), 16) + Math.round(255 * amount));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

export function normalizeOption(opt: SurveyFieldOption): { value: string; label: string } {
  if (typeof opt === 'string') return { value: opt, label: opt };
  const value = opt?.value ?? opt?.id ?? opt?.label ?? '';
  const label = opt?.label ?? opt?.value ?? opt?.id ?? '';
  return { value: String(value), label: String(label) };
}

/**
 * Page count from a raw field list (page_break count + 1). Used to clamp a
 * resumed partial's lastPage: the survey may have been restructured (pages
 * removed) since the partial was saved, and an unclamped lastPage past the
 * end renders a phantom empty page whose only control is Submit —
 * respondents' final pages were submitted unfinished.
 */
export function countSurveyPages(fields: Array<{ type?: string }>): number {
  return fields.filter((f) => f.type === 'page_break').length + 1;
}

/**
 * Once the Submit button is rendered (last page), Enter in any single-line
 * input implicitly submits the whole form — a survey full of optional fields
 * goes out half-finished. Enter still works on buttons (fires click) and in
 * textareas (newline).
 */
export function blockImplicitSubmit(e: { key: string; target: EventTarget | null; preventDefault: () => void }): void {
  if (e.key === 'Enter' && (e.target as HTMLElement | null)?.tagName === 'INPUT') {
    e.preventDefault();
  }
}
