/**
 * Fix two cardiff-main blocks that rely on nested `data-repeat`. The template
 * engine (`lib/blocks/html-render-template.ts`) only finds top-level repeat
 * regions — anything inside a repeat is rendered once with empty placeholders.
 * That's the "checkmark + blank text" bug the user reported.
 *
 * Affected blocks:
 *   - `industries-trucking` / `sec-qual-render`:
 *       outer `data-repeat="products"` contains an inner `data-repeat="reqs"`
 *       list (each product has its own qualification matrix).
 *   - `revenue-based-business-loans` / `sec-3-compare`:
 *       outer `data-repeat="products"` references `data-repeat="products.features"`,
 *       `products.bestFor`, `products.pros` — the engine doesn't support
 *       dotted-name repeats either.
 *
 * Strategy: rewrite each block's html so each product's inner list is
 * generated server-side from the existing values via a build-time string
 * concat, then the inner `data-repeat` is replaced with literal `<li>` rows.
 * Static markup but with proper content for every product. Editors lose
 * per-row editing for these blocks; everything else (title, icon, intro,
 * cta) remains editable.
 *
 * Idempotent — we re-derive the html from `values` on every run.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

interface Block { id?: string; type?: string; blocks?: Block[]; html?: string; values?: Record<string, unknown>; }
function walk(node: Block, fn: (b: Block) => void) { fn(node); if (Array.isArray(node.blocks)) for (const c of node.blocks) walk(c, fn); }

function escAttr(s: string): string { return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;'); }
function escHtml(s: string): string { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function buildTruckingQualHtml(values: Record<string, unknown>): string {
  const products = Array.isArray(values.products) ? values.products as Array<Record<string, unknown>> : [];
  const intro = typeof values.intro === 'string' ? values.intro : '';
  const ctaText = typeof values.ctaText === 'string' ? values.ctaText : 'Check eligibility';
  const ctaUrl = typeof values.ctaUrl === 'string' ? values.ctaUrl : '/apply';
  const cards = products.map((p) => {
    const icon = typeof p.icon === 'string' ? p.icon : 'check_circle';
    const name = typeof p.name === 'string' ? p.name : '';
    const reqs = Array.isArray(p.reqs) ? p.reqs as Array<Record<string, unknown>> : [];
    const rows = reqs.map(rq => {
      const label = typeof rq.label === 'string' ? rq.label : '';
      const value = typeof rq.value === 'string' ? rq.value : '';
      return `<li class="cd-trk-qual__row"><span class="cd-trk-qual__check"><span class="material-icons">check_circle</span></span><span class="cd-trk-qual__label">${escHtml(label)}</span><span class="cd-trk-qual__value">${escHtml(value)}</span></li>`;
    }).join('');
    return `<div class="cd-trk-qual__card"><div class="cd-trk-qual__head"><div class="cd-trk-qual__icon"><span class="material-icons">${escHtml(icon)}</span></div><h3 class="cd-trk-qual__title">${escHtml(name)}</h3></div><ul class="cd-trk-qual__list">${rows}</ul></div>`;
  }).join('\n    ');
  return `<style>
  .cd-trk-qual { max-width: 1140px; margin: 0 auto; }
  .cd-trk-qual__intro { text-align: center; color: #525f7f; font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.0625rem; line-height: 1.75; max-width: 760px; margin: 0 auto 48px auto; }
  .cd-trk-qual__grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 28px; }
  .cd-trk-qual__card { background: #ffffff; border: 1px solid #e6ecf5; border-radius: 14px; padding: 36px 32px; box-shadow: 0 12px 32px rgba(28,51,112,0.07); transition: transform .25s ease, box-shadow .25s ease; display: flex; flex-direction: column; }
  .cd-trk-qual__card:hover { transform: translateY(-4px); box-shadow: 0 20px 48px rgba(28,51,112,0.13); }
  .cd-trk-qual__head { display: flex; align-items: center; gap: 16px; margin: 0 0 22px 0; padding: 0 0 18px 0; border-bottom: 1px solid #eef2f8; }
  .cd-trk-qual__icon { width: 56px; height: 56px; border-radius: 14px; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, #25418b 0%, #1c3370 100%); color: #ffffff; box-shadow: 0 8px 18px rgba(28,51,112,0.22); flex-shrink: 0; }
  .cd-trk-qual__card:nth-child(2) .cd-trk-qual__icon { background: linear-gradient(135deg, #ef6632 0%, #d8501e 100%); box-shadow: 0 8px 18px rgba(239,102,50,0.28); }
  .cd-trk-qual__card:nth-child(3) .cd-trk-qual__icon { background: linear-gradient(135deg, #5ac96f 0%, #3aa856 100%); box-shadow: 0 8px 18px rgba(58,168,86,0.28); }
  .cd-trk-qual__icon .material-icons { font-size: 30px; }
  .cd-trk-qual__title { font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 1.375rem; font-weight: 800; color: #1c3370; margin: 0; letter-spacing: -0.005em; line-height: 1.2; }
  .cd-trk-qual__list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 14px; }
  .cd-trk-qual__row { display: grid; grid-template-columns: 22px 1fr auto; gap: 12px; align-items: baseline; font-family: 'Open Sans', -apple-system, BlinkMacSystemFont, sans-serif; }
  .cd-trk-qual__check { color: #5ac96f; font-size: 18px; line-height: 1; flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center; }
  .cd-trk-qual__check .material-icons { font-size: 18px; }
  .cd-trk-qual__label { color: #25418b; font-size: 0.9375rem; font-weight: 600; letter-spacing: -0.002em; }
  .cd-trk-qual__value { color: #1c3370; font-size: 0.9375rem; font-weight: 700; text-align: right; font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; }
  .cd-trk-qual__cta { margin: 28px 0 0 0; text-align: center; }
  .cd-trk-qual__cta a { display: inline-block; background: #ef6632; color: #ffffff; font-family: 'Raleway', -apple-system, BlinkMacSystemFont, sans-serif; font-weight: 700; font-size: 0.8125rem; letter-spacing: 0.1em; text-transform: uppercase; padding: 12px 28px; border-radius: 6px; text-decoration: none; box-shadow: 0 8px 20px rgba(239,102,50,0.32); transition: transform .15s ease, box-shadow .15s ease; }
  .cd-trk-qual__cta a:hover { transform: translateY(-2px); box-shadow: 0 12px 28px rgba(239,102,50,0.42); }
  @media (max-width: 820px) {
    .cd-trk-qual__grid { grid-template-columns: 1fr; gap: 20px; }
    .cd-trk-qual__card { padding: 28px 22px; }
    .cd-trk-qual__head { gap: 14px; }
    .cd-trk-qual__icon { width: 48px; height: 48px; border-radius: 12px; }
    .cd-trk-qual__icon .material-icons { font-size: 26px; }
    .cd-trk-qual__title { font-size: 1.2rem; }
  }
</style>
<div class="cd-trk-qual">
  <p class="cd-trk-qual__intro" data-field="intro">${escHtml(intro)}</p>
  <div class="cd-trk-qual__grid">
    ${cards}
  </div>
  <div class="cd-trk-qual__cta">
    <a href="${escAttr(ctaUrl)}">${escHtml(ctaText)}</a>
  </div>
</div>`;
}

function buildRbblCompareHtml(values: Record<string, unknown>, originalHtml: string): string {
  // Extract the original <style> block + the surrounding section markup so we
  // only replace the comparison-grid body. This keeps the unique design of
  // sec-3-compare intact; we just inline the per-product feature/bestFor/pros
  // lists so they actually render.
  const products = Array.isArray(values.products) ? values.products as Array<Record<string, unknown>> : [];
  // Find the style tag + everything else outside the products data-repeat;
  // replace the data-repeat region with literal cards.
  const styleMatch = originalHtml.match(/<style>[\s\S]*?<\/style>/);
  const style = styleMatch ? styleMatch[0] : '';
  const buildCard = (p: Record<string, unknown>): string => {
    const name = typeof p.name === 'string' ? p.name : '';
    const tagline = typeof p.tagline === 'string' ? p.tagline : '';
    const icon = typeof p.icon === 'string' ? p.icon : 'verified';
    const features = Array.isArray(p.features) ? p.features as Array<Record<string, unknown>> : [];
    const bestFor = Array.isArray(p.bestFor) ? p.bestFor as Array<Record<string, unknown>> : [];
    const pros = Array.isArray(p.pros) ? p.pros as Array<Record<string, unknown>> : [];
    const liList = (arr: Array<Record<string, unknown>>, iconName = 'check_circle') => arr.map(it => {
      const text = typeof it.text === 'string' ? it.text : (typeof it.label === 'string' ? it.label : '');
      return `<li><span class="material-icons">${escHtml(iconName)}</span><span>${escHtml(text)}</span></li>`;
    }).join('');
    return `<article class="cd-rbbl-cmp__card">
      <header class="cd-rbbl-cmp__head"><span class="material-icons cd-rbbl-cmp__icon">${escHtml(icon)}</span><h3 class="cd-rbbl-cmp__name">${escHtml(name)}</h3><p class="cd-rbbl-cmp__tagline">${escHtml(tagline)}</p></header>
      ${features.length ? `<section class="cd-rbbl-cmp__sec"><h4>Features</h4><ul>${liList(features)}</ul></section>` : ''}
      ${bestFor.length ? `<section class="cd-rbbl-cmp__sec"><h4>Best For</h4><ul>${liList(bestFor, 'task_alt')}</ul></section>` : ''}
      ${pros.length ? `<section class="cd-rbbl-cmp__sec"><h4>Pros</h4><ul>${liList(pros, 'add_circle')}</ul></section>` : ''}
    </article>`;
  };
  const cards = products.map(buildCard).join('\n    ');
  return `${style}
<div class="cd-rbbl-cmp">
  <div class="cd-rbbl-cmp__grid">
    ${cards}
  </div>
</div>`;
}

async function main() {
  // --- 1. Trucking ---
  const [trucking] = await db.select().from(posts).where(eq(posts.id, 817)).limit(1);
  if (!trucking) throw new Error('post 817 (trucking) not found');
  const tParsed = JSON.parse(trucking.content) as { blocks: Block[] };
  let touchedT = false;
  walk(tParsed as Block, (b) => {
    if (b.id === 'sec-qual-render' && b.type === 'html-render' && b.values) {
      b.html = buildTruckingQualHtml(b.values);
      touchedT = true;
    }
  });
  if (touchedT) {
    await db.update(posts).set({ content: JSON.stringify(tParsed), updatedAt: new Date() }).where(eq(posts.id, 817));
    console.log('Trucking sec-qual-render: rebuilt html with inlined req rows per product');
  } else {
    console.log('Trucking sec-qual-render: NOT FOUND');
  }

  // --- 2. Revenue-based business loans ---
  const [rbbl] = await db.select().from(posts).where(eq(posts.id, 828)).limit(1);
  if (!rbbl) throw new Error('post 828 (revenue-based-business-loans) not found');
  const rParsed = JSON.parse(rbbl.content) as { blocks: Block[] };
  let touchedR = false;
  walk(rParsed as Block, (b) => {
    if (b.id === 'sec-3-compare' && b.type === 'html-render' && b.values && b.html) {
      b.html = buildRbblCompareHtml(b.values, b.html);
      touchedR = true;
    }
  });
  if (touchedR) {
    await db.update(posts).set({ content: JSON.stringify(rParsed), updatedAt: new Date() }).where(eq(posts.id, 828));
    console.log('RBBL sec-3-compare: rebuilt html with inlined features/bestFor/pros per product');
  } else {
    console.log('RBBL sec-3-compare: NOT FOUND');
  }

  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
