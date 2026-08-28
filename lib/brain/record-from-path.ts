/**
 * PUX-199 (design doc screen 58): which record the user is looking at, read
 * off the portal pathname, so Ask can open "about this contact" instead of
 * blank. Only routes that exist are matched; anything else is null.
 */
export type RecordRef = { kind: 'contact' | 'deal' | 'page' | 'ticket' | 'note'; id: number; label: string };

const PATTERNS: [RegExp, RecordRef['kind'], string][] = [
  [/^\/portal\/crm\/contacts\/(\d+)/, 'contact', 'this contact'],
  [/^\/portal\/crm\/deals\/(\d+)/, 'deal', 'this deal'],
  [/^\/portal\/websites\/\d+\/posts\/(\d+)/, 'page', 'this page'],
  [/^\/portal\/tickets\/(\d+)/, 'ticket', 'this ticket'],
  [/^\/portal\/brain\/knowledge\/(\d+)/, 'note', 'this note'],
];

export function recordFromPath(pathname: string | null | undefined): RecordRef | null {
  if (!pathname) return null;
  for (const [re, kind, label] of PATTERNS) {
    const m = pathname.match(re);
    if (m) return { kind, id: Number(m[1]), label };
  }
  return null;
}

/** The link fields the Brain note route accepts for a record, if any. */
export function noteLinkFor(ref: RecordRef | null): Record<string, number> {
  if (!ref) return {};
  if (ref.kind === 'contact') return { contactId: ref.id };
  if (ref.kind === 'deal') return { dealId: ref.id };
  return {};
}
