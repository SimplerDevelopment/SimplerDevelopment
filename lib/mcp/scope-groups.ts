/**
 * PUX-214 (design doc screen 78): a key's scopes shown by room, using the
 * same SCOPE_GROUPS the create modal offers, so a row and the picker never
 * disagree. Scopes no group knows (or '*') fall into "Other".
 */
export type ScopeGroupLike = { label: string; scopes: { value: string }[] };

export function groupScopes(groups: ScopeGroupLike[], scopes: string[]): [string, string[]][] {
  const out: [string, string[]][] = [];
  const seen = new Set<string>();
  for (const g of groups) {
    const hit = g.scopes.map((s) => s.value).filter((v) => scopes.includes(v));
    if (hit.length) { out.push([g.label, hit]); hit.forEach((v) => seen.add(v)); }
  }
  const rest = scopes.filter((s) => !seen.has(s));
  if (rest.length) out.push(['Other', rest]);
  return out;
}
