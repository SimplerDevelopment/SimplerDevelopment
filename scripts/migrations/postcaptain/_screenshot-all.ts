/**
 * Take full-page screenshots of every postcaptain page (all 50 posts under
 * siteId=144) and write them to .claude/.runtime/dev-block/screenshots/postcaptain/
 * along with an index.html lightbox for review.
 *
 * Assumes a dev server is reachable. Resolves the URL in this order:
 *   - $POSTCAPTAIN_BASE_URL if set
 *   - http://localhost:3001/sites/postcaptain.com  (the running dev server in
 *     sibling worktree sd2026-mcp-telemetry, same repo, same DB)
 *   - http://localhost:3000/sites/postcaptain.com  (fallback)
 *
 * Run:
 *   bun -r dotenv/config scripts/migrations/postcaptain/_screenshot-all.ts dotenv_config_path=.env.local
 */
import 'dotenv/config';
import { db } from '@/lib/db';
import { clientWebsites, posts } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Browser, type BrowserContext, type Page } from '@playwright/test';

const SITE_ID = 144;

const BASE_CANDIDATES = [
  process.env.POSTCAPTAIN_BASE_URL,
  'http://localhost:3000',
  'http://localhost:3001',
].filter(Boolean) as string[];

const VIEWPORT = { width: 1440, height: 900 };
const NAV_TIMEOUT_MS = 45_000;
const SETTLE_MS = 1500;

function urlFor(base: string, slug: string): string {
  // Match the route conventions in app/sites/[domain]/[[...slug]]/page.tsx
  // Home = empty slug; archive pages live at /<archive-slug> (e.g. /case-studies)
  // Singletons of CPTs render at /<cpt-archive-slug>/<post-slug>
  if (!slug || slug === 'home') return `${base}/sites/postcaptain.com/`;
  return `${base}/sites/postcaptain.com/${slug.replace(/^\//, '')}`;
}

// Map (postType, slug) → canonical site path. Mirrors the slug shape stored in
// posts.slug — most pages already have the full path baked in (e.g. case
// studies have slug = "case-studies/loyola"), so we just pass slug through.
function pathForPost(postType: string, slug: string): string {
  if (postType === 'page' && slug === 'home') return '';
  return slug;
}

async function probeBase(): Promise<string> {
  for (const base of BASE_CANDIDATES) {
    try {
      // First a cheap health check (avoids waiting on a slow first-page compile).
      const health = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(5000) });
      if (!health.ok) { console.log(`× ${base} → /api/health ${health.status}`); continue; }
      // Then warm the postcaptain route — first hit can take 30s+ to compile.
      const res = await fetch(`${base}/sites/postcaptain.com/`, { signal: AbortSignal.timeout(60_000) });
      if (res.status >= 200 && res.status < 400) {
        console.log(`✓ dev server: ${base} (warmed, status ${res.status})`);
        return base;
      }
      console.log(`× ${base} → status ${res.status}`);
    } catch (e) {
      console.log(`× ${base} → ${(e as Error).message}`);
    }
  }
  throw new Error(`No reachable dev server. Tried: ${BASE_CANDIDATES.join(', ')}`);
}

async function shoot(page: Page, url: string, outPath: string): Promise<{ ok: boolean; error?: string; status?: number }> {
  try {
    const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS });
    const status = res?.status() ?? 0;
    // Wait for the body block content to render (it has the WP-imported CSS
    // applied). Short timeout — pages render fast once HTML lands; if a
    // selector never appears just snap whatever is on screen.
    await page.waitForSelector('body', { timeout: 5_000 }).catch(() => {});
    await page.waitForTimeout(SETTLE_MS);
    await page.screenshot({ path: outPath, fullPage: true, timeout: 30_000 });
    return { ok: status >= 200 && status < 400, status };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

function isContextClosedError(msg?: string): boolean {
  if (!msg) return false;
  return /Target page, context or browser has been closed|browserContext\.close|page\.close/.test(msg);
}

async function main() {
  const base = await probeBase();
  const [site] = await db.select().from(clientWebsites).where(eq(clientWebsites.id, SITE_ID));
  if (!site) throw new Error(`site ${SITE_ID} not found`);

  const allPosts = await db
    .select({ id: posts.id, postType: posts.postType, slug: posts.slug, title: posts.title, published: posts.published })
    .from(posts)
    .where(and(eq(posts.websiteId, SITE_ID), eq(posts.published, true)));

  console.log(`${allPosts.length} published postcaptain posts to screenshot`);

  const outDir = join(process.cwd(), '.claude/.runtime/dev-block/screenshots/postcaptain');
  mkdirSync(outDir, { recursive: true });

  let browser: Browser = await chromium.launch({ headless: true });
  let context: BrowserContext = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  let page: Page = await context.newPage();

  async function relaunch(): Promise<void> {
    try { await context.close(); } catch {}
    try { await browser.close(); } catch {}
    browser = await chromium.launch({ headless: true });
    context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
    page = await context.newPage();
  }

  type Result = {
    id: number; postType: string; slug: string; title: string; url: string; file: string;
    ok: boolean; status?: number; error?: string;
  };
  const results: Result[] = [];

  // sort: home first, then page, then by CPT
  const order = ['page', 'solution', 'service', 'case-study', 'guide', 'portal-demo', 'event', 'blog'];
  const sorted = [...allPosts].sort((a, b) => {
    if (a.slug === 'home') return -1;
    if (b.slug === 'home') return 1;
    const ai = order.indexOf(a.postType); const bi = order.indexOf(b.postType);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi) || a.slug.localeCompare(b.slug);
  });

  // Resume-friendly loop: existsSync skips cached, retry on context-close
  // (re-launch once and try again), and short-circuit early if too many
  // consecutive timeouts in a row (a sign that the dev server has wedged —
  // better to bail and restart the script than spin forever).
  let consecutiveFailures = 0;
  const MAX_CONSECUTIVE_FAILURES = 3;
  for (let i = 0; i < sorted.length; i++) {
    const p = sorted[i];
    const path = pathForPost(p.postType, p.slug);
    const url = urlFor(base, path);
    const file = `${String(i).padStart(3, '0')}-${p.postType}-${p.slug.replace(/\//g, '__')}.png`;
    const outPath = join(outDir, file);

    if (existsSync(outPath)) {
      console.log(`[${i + 1}/${sorted.length}] ${p.postType}/${p.slug} → ↺ cached`);
      results.push({ id: p.id, postType: p.postType, slug: p.slug, title: p.title, url, file, ok: true, status: 200 });
      consecutiveFailures = 0;
      continue;
    }

    process.stdout.write(`[${i + 1}/${sorted.length}] ${p.postType}/${p.slug} → `);
    let r = await shoot(page, url, outPath);
    if (!r.ok && isContextClosedError(r.error)) {
      console.log(`(context died, relaunching + retrying)`);
      await relaunch();
      process.stdout.write(`  retry → `);
      r = await shoot(page, url, outPath);
    }
    if (r.ok) {
      console.log(`✓ ${r.status}`);
      consecutiveFailures = 0;
    } else {
      console.log(`✗ ${r.status ?? '?'} ${r.error?.split('\n')[0] ?? ''}`);
      consecutiveFailures++;
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        console.log(`  · ${MAX_CONSECUTIVE_FAILURES} consecutive failures — relaunching browser`);
        await relaunch();
        consecutiveFailures = 0;
      }
    }
    results.push({ id: p.id, postType: p.postType, slug: p.slug, title: p.title, url, file, ok: r.ok, status: r.status, error: r.error });
  }

  try { await browser.close(); } catch {}

  // Build the lightbox HTML
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>postcaptain — full-page screenshots</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; background: #0b1220; color: #e2e8f0; }
  header { padding: 24px 32px; border-bottom: 1px solid #1e293b; background: #0f172a; position: sticky; top: 0; z-index: 10; }
  header h1 { margin: 0 0 6px 0; font-size: 18px; font-weight: 600; }
  header p { margin: 0; font-size: 13px; color: #94a3b8; }
  header .filters { margin-top: 14px; display: flex; flex-wrap: wrap; gap: 6px; }
  header .filters button { padding: 5px 11px; font-size: 12px; border-radius: 6px; background: #1e293b; color: #e2e8f0; border: 1px solid #334155; cursor: pointer; }
  header .filters button.active { background: #3b82f6; border-color: #3b82f6; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)); gap: 18px; padding: 24px 32px; }
  .card { background: #0f172a; border: 1px solid #1e293b; border-radius: 8px; overflow: hidden; cursor: zoom-in; transition: transform 80ms ease; }
  .card:hover { transform: translateY(-2px); border-color: #3b82f6; }
  .card .thumb { aspect-ratio: 1440 / 900; overflow: hidden; background: #020617; position: relative; }
  .card .thumb img { width: 100%; height: auto; display: block; object-fit: cover; object-position: top; }
  .card .err { color: #fda4af; padding: 32px; font-size: 13px; }
  .card .meta { padding: 12px 14px; font-size: 13px; }
  .card .meta .t { font-weight: 600; color: #f1f5f9; margin-bottom: 4px; line-height: 1.35; }
  .card .meta .s { color: #94a3b8; font-size: 11px; font-family: ui-monospace, monospace; word-break: break-all; }
  .card .meta .badge { display: inline-block; margin-right: 6px; padding: 2px 7px; font-size: 10px; border-radius: 999px; background: #1e293b; color: #cbd5e1; }
  .badge.solution { background: #334155; color: #fde68a; }
  .badge.service { background: #334155; color: #c4b5fd; }
  .badge.case-study { background: #334155; color: #86efac; }
  .badge.guide { background: #334155; color: #fdba74; }
  .badge.portal-demo { background: #334155; color: #67e8f9; }
  .badge.event { background: #334155; color: #f9a8d4; }
  .badge.page { background: #334155; color: #93c5fd; }
  .badge.blog { background: #334155; color: #d1d5db; }
  .badge.bad { background: #7f1d1d; color: #fecaca; }
  .lightbox { display: none; position: fixed; inset: 0; background: rgba(2, 6, 23, 0.96); z-index: 100; padding: 24px; }
  .lightbox.open { display: flex; flex-direction: column; }
  .lightbox header { background: transparent; border: 0; padding: 0 0 16px 0; display: flex; justify-content: space-between; align-items: center; }
  .lightbox header h2 { margin: 0; font-size: 16px; }
  .lightbox header a { color: #93c5fd; font-size: 12px; }
  .lightbox header button { padding: 6px 14px; background: #1e293b; color: #f1f5f9; border: 1px solid #334155; border-radius: 6px; cursor: pointer; }
  .lightbox .scroll { overflow: auto; flex: 1; border: 1px solid #1e293b; border-radius: 8px; background: #ffffff; }
  .lightbox img { display: block; width: 100%; height: auto; }
  .lightbox .nav { position: absolute; top: 50%; transform: translateY(-50%); padding: 16px 12px; background: rgba(15, 23, 42, 0.85); color: #fff; font-size: 18px; cursor: pointer; user-select: none; border: 0; }
  .lightbox .nav.prev { left: 8px; }
  .lightbox .nav.next { right: 8px; }
  kbd { padding: 1px 6px; background: #1e293b; border: 1px solid #334155; border-radius: 4px; font-size: 11px; }
</style>
</head>
<body>
<header>
  <h1>Post Captain — full-page screenshots</h1>
  <p>${results.length} pages · captured at ${new Date().toISOString()} · viewport 1440×900 · base <code>${base}</code> · <kbd>←</kbd>/<kbd>→</kbd> to navigate, <kbd>Esc</kbd> to close</p>
  <div class="filters" id="filters"></div>
</header>
<div class="grid" id="grid"></div>

<div class="lightbox" id="lightbox" role="dialog" aria-modal="true">
  <header>
    <div>
      <h2 id="lbTitle"></h2>
      <a id="lbUrl" href="#" target="_blank" rel="noopener">open page in new tab</a>
    </div>
    <div>
      <button id="lbClose">Close ✕</button>
    </div>
  </header>
  <div class="scroll" id="lbScroll">
    <img id="lbImage" alt="" />
  </div>
  <button class="nav prev" id="lbPrev" aria-label="Previous">‹</button>
  <button class="nav next" id="lbNext" aria-label="Next">›</button>
</div>

<script>
const RESULTS = ${JSON.stringify(results)};
const grid = document.getElementById('grid');
const filters = document.getElementById('filters');
const lb = document.getElementById('lightbox');
const lbImg = document.getElementById('lbImage');
const lbTitle = document.getElementById('lbTitle');
const lbUrl = document.getElementById('lbUrl');
const lbScroll = document.getElementById('lbScroll');
let activeType = 'all';
let activeIdx = 0;
let visibleResults = RESULTS;

function render() {
  visibleResults = activeType === 'all' ? RESULTS : RESULTS.filter(r => r.postType === activeType);
  grid.innerHTML = '';
  visibleResults.forEach((r, i) => {
    const card = document.createElement('div');
    card.className = 'card';
    card.onclick = () => open(i);
    card.innerHTML =
      '<div class="thumb">' + (r.ok
        ? '<img src="' + encodeURI(r.file) + '" alt="" loading="lazy" />'
        : '<div class="err">' + (r.error || ('HTTP ' + r.status)) + '</div>')
      + '</div>'
      + '<div class="meta">'
      + '<div class="t">' + escapeHtml(r.title) + '</div>'
      + '<div class="s"><span class="badge ' + r.postType + (r.ok ? '' : ' bad') + '">' + r.postType + '</span>'
      + escapeHtml(r.slug) + (r.ok ? '' : ' · ' + (r.status || 'err'))
      + '</div></div>';
    grid.appendChild(card);
  });
}
function escapeHtml(s) { return String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
function open(i) {
  activeIdx = i;
  const r = visibleResults[i];
  lbImg.src = r.ok ? r.file : '';
  lbImg.alt = r.title;
  lbTitle.textContent = r.title + ' — ' + r.postType + '/' + r.slug;
  lbUrl.href = r.url;
  lb.classList.add('open');
  lbScroll.scrollTop = 0;
}
function close() { lb.classList.remove('open'); }
document.getElementById('lbClose').onclick = close;
document.getElementById('lbPrev').onclick = () => open((activeIdx - 1 + visibleResults.length) % visibleResults.length);
document.getElementById('lbNext').onclick = () => open((activeIdx + 1) % visibleResults.length);
document.addEventListener('keydown', e => {
  if (!lb.classList.contains('open')) return;
  if (e.key === 'Escape') close();
  if (e.key === 'ArrowLeft') open((activeIdx - 1 + visibleResults.length) % visibleResults.length);
  if (e.key === 'ArrowRight') open((activeIdx + 1) % visibleResults.length);
});
lb.addEventListener('click', e => { if (e.target === lb) close(); });

const types = ['all', ...Array.from(new Set(RESULTS.map(r => r.postType)))];
types.forEach(t => {
  const b = document.createElement('button');
  b.textContent = t + (t === 'all' ? ' (' + RESULTS.length + ')' : ' (' + RESULTS.filter(r => r.postType === t).length + ')');
  b.className = t === activeType ? 'active' : '';
  b.onclick = () => { activeType = t; document.querySelectorAll('#filters button').forEach(x => x.classList.toggle('active', x === b)); render(); };
  filters.appendChild(b);
});
render();
</script>
</body>
</html>
`;
  writeFileSync(join(outDir, 'index.html'), html);

  const ok = results.filter(r => r.ok).length;
  console.log(`\n${ok}/${results.length} screenshots succeeded`);
  console.log(`Open: file://${join(outDir, 'index.html')}`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
