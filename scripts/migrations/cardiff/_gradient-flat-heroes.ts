/**
 * Give every cardiff hero "header" a gradient instead of a flat solid fill.
 *
 * Most cardiff hero sections render a flat brand-navy solid (#25418b / #1c3370)
 * while a handful (e.g. contact-us, the article heroes) already carry the brand
 * gradient in their `style.customCSS`. This migration upgrades the flat ones to
 * match: it adds the SAME opaque brand gradient to `customCSS` so the solid
 * becomes a gradient. The existing `backgroundColor` is left in place as a
 * fallback, so there is no white-out risk and the change is purely additive.
 *
 * Targets a `section` block when ALL hold:
 *   - backgroundColor is a brand navy (#25418b or #1c3370, case-insensitive)
 *   - it has NO existing gradient (no `gradient` in customCSS, no
 *     backgroundGradient, no gradient/url in backgroundImage)
 *   - it looks like a header: id contains "hero", OR it is the first top-level
 *     section on the page.
 *
 * Idempotent: re-running is a no-op (skips anything that already has a
 * background-image gradient).
 *
 * Connection: reads TARGET_DB (explicit) so the prod target is never implicit.
 *   Dry-run (default):  TARGET_DB=<url> bun scripts/migrations/cardiff/_gradient-flat-heroes.ts
 *   Apply:              TARGET_DB=<url> bun scripts/migrations/cardiff/_gradient-flat-heroes.ts --apply
 */
import postgres from 'postgres';

const GRADIENT = 'linear-gradient(135deg, #1c3370 0%, #25418b 60%, #385cc0 100%)';
const NAVY = new Set(['#25418b', '#1c3370']);
const APPLY = process.argv.includes('--apply');

interface Block { id?: string; type?: string; style?: Record<string, unknown>; blocks?: Block[]; columns?: { blocks?: Block[] }[]; }

function mergeCustomCSS(existing: string | undefined, decl: Record<string, string>): string {
  const map = new Map<string, string>();
  if (existing) for (const d of existing.split(';')) { const i = d.indexOf(':'); if (i < 0) continue; const k = d.slice(0, i).trim(); if (k) map.set(k, d.slice(i + 1).trim()); }
  for (const [k, v] of Object.entries(decl)) map.set(k, v);
  return [...map.entries()].map(([k, v]) => `${k}: ${v}`).join('; ');
}

function hasGradient(st: Record<string, unknown>): boolean {
  const css = typeof st.customCSS === 'string' ? st.customCSS : '';
  const img = typeof st.backgroundImage === 'string' ? st.backgroundImage : '';
  return /gradient/i.test(css) || !!st.backgroundGradient || /gradient|url\(/i.test(img);
}

function isNavyHeader(b: Block, isFirstSection: boolean): boolean {
  if (b.type !== 'section') return false;
  const st = (b.style && typeof b.style === 'object' ? b.style : {}) as Record<string, unknown>;
  const bg = typeof st.backgroundColor === 'string' ? st.backgroundColor.toLowerCase().trim() : '';
  if (!NAVY.has(bg)) return false;
  if (hasGradient(st)) return false;
  const looksHero = (b.id || '').toLowerCase().includes('hero') || isFirstSection;
  return looksHero;
}

function fix(b: Block): boolean {
  const st = (b.style && typeof b.style === 'object' ? b.style : {}) as Record<string, unknown>;
  const css = typeof st.customCSS === 'string' ? st.customCSS : '';
  const next = mergeCustomCSS(css, { 'background-image': GRADIENT });
  if (next === css) return false;
  b.style = { ...st, customCSS: next };
  return true;
}

// Walk: track whether we've seen the first top-level section yet (per page).
function walk(blocks: Block[], acc: Block[], depth = 0, firstSectionSeen = { v: false }): void {
  for (const b of blocks) {
    const isFirstSection = depth === 0 && b.type === 'section' && !firstSectionSeen.v;
    if (depth === 0 && b.type === 'section') firstSectionSeen.v = true;
    if (isNavyHeader(b, isFirstSection)) acc.push(b);
    if (Array.isArray(b.blocks)) walk(b.blocks, acc, depth + 1, firstSectionSeen);
    if (Array.isArray(b.columns)) for (const c of b.columns) if (Array.isArray(c.blocks)) walk(c.blocks as Block[], acc, depth + 1, firstSectionSeen);
  }
}

async function main() {
  const url = process.env.TARGET_DB;
  if (!url) throw new Error('Set TARGET_DB to the connection string');
  const sql = postgres(url, { ssl: 'require', max: 1 });
  const [site] = await sql`select id from client_websites where subdomain = 'cardiff-main' limit 1`;
  if (!site) throw new Error('cardiff-main not found on this DB');
  const rows = await sql`select id, slug, content from posts where website_id = ${site.id}`;
  console.log(`${APPLY ? 'APPLY' : 'DRY-RUN'} — scanning ${rows.length} posts on site ${site.id}\n`);
  let postsTouched = 0, sectionsFixed = 0;
  for (const r of rows) {
    if (!r.content) continue;
    let parsed: { blocks: Block[] };
    try { parsed = JSON.parse(r.content); } catch { continue; }
    const targets: Block[] = [];
    walk(parsed.blocks ?? [], targets);
    if (!targets.length) continue;
    let n = 0;
    for (const t of targets) if (fix(t)) n++;
    if (!n) continue;
    postsTouched++; sectionsFixed += n;
    console.log(`  ${r.slug}: ${n} header(s) → gradient  [${targets.map(t => t.id).join(', ')}]`);
    if (APPLY) await sql`update posts set content = ${JSON.stringify(parsed)}, updated_at = now() where id = ${r.id}`;
  }
  console.log(`\n${APPLY ? 'Applied' : 'Would touch'}: ${postsTouched} posts, ${sectionsFixed} hero headers.`);
  if (!APPLY) console.log('(dry-run — re-run with --apply to write)');
  await sql.end();
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
