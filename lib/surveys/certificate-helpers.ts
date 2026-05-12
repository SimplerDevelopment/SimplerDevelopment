/**
 * PDF-01/02 — pure helpers for the completion-certificate PDF.
 *
 * Extracted from the route so they're cheap to unit-test (the PDF render
 * itself isn't worth unit-covering — it's exercised by manual QA / e2e).
 */

/**
 * Display name for the respondent on the certificate. Trim whitespace; fall
 * back to "Respondent" when the value is null/empty so the certificate is
 * still issuable for anonymous submissions.
 */
export function formatRespondentName(name: string | null | undefined): string {
  if (typeof name !== 'string') return 'Respondent';
  const trimmed = name.trim();
  return trimmed.length > 0 ? trimmed : 'Respondent';
}

/**
 * Format a completion date as "Month Day, Year" — locale-independent so the
 * PDF reads the same regardless of where the server is running. Accepts
 * Date | string | null; returns today's date when input is missing.
 */
export function formatCompletionDate(input: Date | string | null | undefined): string {
  const d =
    input instanceof Date
      ? input
      : input
        ? new Date(input)
        : new Date();
  if (Number.isNaN(d.getTime())) return formatCompletionDate(new Date());
  // Always en-US to keep the certificate copy stable across environments.
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

/**
 * Build a filename-safe slug from a survey title. Lower-cases, replaces
 * non-alphanumerics with `-`, collapses dashes, trims to a sensible length.
 * Falls back to "survey" when the input has no usable characters.
 */
export function sanitizeFilename(title: string | null | undefined): string {
  if (typeof title !== 'string') return 'survey';
  const cleaned = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return cleaned.length > 0 ? cleaned : 'survey';
}

/**
 * Map a font family name to one of @react-pdf/renderer's built-in fonts.
 * The route avoids dynamic Google Font loading (network + cache cost on every
 * render), so anything we can't map falls back to Helvetica. Match is
 * case-insensitive and substring-based so "Helvetica Neue", "Times New
 * Roman", and "Courier Prime" all resolve correctly.
 */
export function resolvePdfFont(name: string | null | undefined): 'Helvetica' | 'Times-Roman' | 'Courier' {
  if (typeof name !== 'string' || name.trim() === '') return 'Helvetica';
  const lower = name.toLowerCase();
  if (lower.includes('times') || lower.includes('serif')) return 'Times-Roman';
  if (lower.includes('courier') || lower.includes('mono')) return 'Courier';
  return 'Helvetica';
}
