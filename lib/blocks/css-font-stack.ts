// Dependency-free: safe to import from client components. See page-fonts.ts.

/**
 * Produce a valid CSS `font-family` value for inline application. If the
 * authored value is already a stack (contains a comma) it is used verbatim —
 * the old code wrapped the WHOLE stack in quotes, producing an invalid single
 * family name that silently fell back to the generic. A bare name gets quoted
 * and given a sensible fallback.
 */
export function cssFontStack(
  raw: string | null | undefined,
  fallback = 'sans-serif',
): string | undefined {
  if (!raw || typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  if (trimmed.includes(',')) return trimmed; // already a stack — use as-is
  return `"${trimmed}", ${fallback}`;
}
