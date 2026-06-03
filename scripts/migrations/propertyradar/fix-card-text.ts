/**
 * Ensure card-grid / services-grid cards have explicit readable text colors.
 * Some worker pages set the block-level `title`/`description` elementStyles but
 * omitted the PER-CARD keys (cardTitle/cardDescription, serviceTitle/...), so the
 * card titles fell back to Tailwind `text-foreground` (≈#EDEDED) and became
 * invisible on light cards. Force navy titles / ink descriptions / green icons.
 * Idempotent. Run: npx tsx scripts/migrations/propertyradar/fix-card-text.ts
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' }); dotenv.config({ path: '.env.local', override: true }); if (process.env.PR_DATABASE_URL) process.env.DATABASE_URL = process.env.PR_DATABASE_URL;
import { eq } from 'drizzle-orm';
const WEBSITE_ID = parseInt(process.env.PR_WEBSITE_ID || '433', 10);

const NAVY = '#0A1F44', INK = '#41506B', GREEN = '#38CB89', PF = 'Poppins, sans-serif';
let changed = 0;

function ensure(es: Record<string, any>, key: string, color: string, weight?: string) {
  const cur = es[key] || {};
  const isIcon = /icon/i.test(key);
  const needs = cur.color !== color || (isIcon && cur.fontFamily && /poppins/i.test(cur.fontFamily));
  if (needs) {
    cur.color = color;
    if (isIcon) {
      // Icons must use the Material Icons font (a Poppins override renders the
      // ligature name as literal text). Force it / clear a bad Poppins value.
      cur.fontFamily = 'Material Icons';
    } else {
      cur.fontFamily = cur.fontFamily || PF;
      if (weight) cur.fontWeight = cur.fontWeight || weight;
    }
    es[key] = cur; changed++;
  }
}

function walk(node: unknown) {
  if (Array.isArray(node)) { node.forEach(walk); return; }
  if (!node || typeof node !== 'object') return;
  const b = node as Record<string, any>;
  if (b.type === 'card-grid' && Array.isArray(b.cards)) {
    b.elementStyles = b.elementStyles || {};
    ensure(b.elementStyles, 'cardTitle', NAVY, '600');
    ensure(b.elementStyles, 'cardDescription', INK);
    ensure(b.elementStyles, 'cardIcon', GREEN);
  }
  if (b.type === 'services-grid' && Array.isArray(b.services)) {
    b.elementStyles = b.elementStyles || {};
    ensure(b.elementStyles, 'serviceTitle', NAVY, '600');
    ensure(b.elementStyles, 'serviceDescription', INK);
    if (!(b.elementStyles.serviceIcon && b.elementStyles.serviceIcon.color)) ensure(b.elementStyles, 'serviceIcon', GREEN);
  }
  for (const key of ['blocks', 'columns', 'tabs', 'panels']) if (Array.isArray(b[key])) walk(b[key]);
}

async function run() {
  const { db } = await import('../../../lib/db');
  const { posts } = await import('../../../lib/db/schema');
  const rows = await db.select({ id: posts.id, content: posts.content }).from(posts).where(eq(posts.websiteId, WEBSITE_ID));
  let touched = 0;
  for (const r of rows) {
    let parsed: { blocks?: unknown[]; version?: string };
    try { parsed = JSON.parse(r.content || '{}'); } catch { continue; }
    if (!parsed.blocks) continue;
    const before = changed;
    walk(parsed.blocks);
    if (changed > before) { await db.update(posts).set({ content: JSON.stringify(parsed), updatedAt: new Date() }).where(eq(posts.id, r.id)); touched++; }
  }
  console.log(`[fix-card-text] scanned ${rows.length}; updated ${touched}; ${changed} edits`);
}
run().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
