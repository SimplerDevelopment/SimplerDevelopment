/**
 * HTML escaping utilities.
 *
 * `escapeHtml` is the single canonical implementation for the whole codebase.
 * Import from here — do NOT reimplement locally.
 *
 * Character set escaped (superset of all previous local copies):
 *   & → &amp;   (MUST be first to avoid double-encoding)
 *   < → &lt;
 *   > → &gt;
 *   " → &quot;
 *   ' → &#39;
 */
export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
