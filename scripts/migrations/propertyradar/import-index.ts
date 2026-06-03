/**
 * Build a collection INDEX page (/plays, /lists, /coverage) that lists ALL items
 * as a branded card grid (grouped where sensible). Static grid generated from the
 * extracted data so every item is surfaced (the html-render loop caps at 24).
 *   npx tsx scripts/migrations/propertyradar/import-index.ts --type plays|lists|coverage
 * /blog index is handled by the platform's built-in blog listing — not built here.
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' }); dotenv.config({ path: '.env.local', override: true }); if (process.env.PR_DATABASE_URL) process.env.DATABASE_URL = process.env.PR_DATABASE_URL;
import * as fs from 'fs';
import * as path from 'path';
import { T, makePage, upsertPage } from './_shared';

const DATA_DIR = path.join(__dirname, 'data');
const a = process.argv.slice(2);
const type = a[a.indexOf('--type') + 1];
if (!['plays', 'lists', 'coverage'].includes(type)) { console.error('--type must be plays|lists|coverage'); process.exit(1); }

const META: Record<string, { title: string; overline: string; desc: string; groupBy: boolean }> = {
  plays: { title: 'Lead Gen Plays', overline: 'PROVEN PLAYS', desc: 'Dozens of proven plays to connect with the right owners, with the right message, at the right time — organized by who you serve.', groupBy: true },
  lists: { title: 'Property Lists', overline: 'TARGETED LISTS', desc: 'Build targeted property lists from 160M+ properties and dozens of distress and life-event signals.', groupBy: false },
  coverage: { title: 'Data Coverage', overline: 'NATIONWIDE COVERAGE', desc: 'PropertyRadar delivers property and owner data across all 50 states. Explore coverage by state.', groupBy: false },
};

const pretty = (s: string) => s.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const esc = (s: string) => (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function pathFromUrl(url: string): string { try { return new URL(url).pathname.replace(/^\/+|\/+$/g, ''); } catch { return ''; } }

function card(href: string, title: string, sub: string): string {
  return `<a href="/${href}" style="display:flex;flex-direction:column;text-decoration:none;background:#fff;border:1px solid ${T.LINE};border-radius:14px;padding:22px 24px;box-shadow:0 8px 30px rgba(10,31,68,0.05);transition:all .25s ease">
    <span style="font-family:Poppins,sans-serif;font-weight:600;font-size:1.05rem;color:${T.NAVY};line-height:1.3">${esc(title)}</span>
    ${sub ? `<span style="color:${T.INK};font-size:0.9rem;line-height:1.5;margin-top:6px">${esc(sub)}</span>` : ''}
    <span style="color:${T.GREEN_D};font-weight:600;font-size:0.85rem;margin-top:14px">View &rarr;</span>
  </a>`;
}
const gridOpen = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:20px">`;
const gridClose = `</div>`;

function run() {
  const m = META[type];
  const file = path.join(DATA_DIR, `${type}.json`);
  if (!fs.existsSync(file)) { console.error(`Missing ${file}; run extraction first.`); process.exit(1); }
  const items: Array<{ url: string; title: string; metaDescription?: string }> = JSON.parse(fs.readFileSync(file, 'utf8'));

  // de-dupe by path, build entries
  const seen = new Set<string>();
  const entries = items.map((it) => {
    const p = pathFromUrl(it.url);
    return { path: p, parts: p.split('/'), title: it.title || pretty(p.split('/').pop() || ''), sub: (it.metaDescription || '').slice(0, 110) };
  }).filter((e) => e.path && !seen.has(e.path) && seen.add(e.path));

  let html = '';
  if (m.groupBy) {
    // group by 2nd path segment (audience)
    const groups: Record<string, typeof entries> = {};
    for (const e of entries) {
      const key = e.parts[1] || 'general';
      (groups[key] ||= []).push(e);
    }
    for (const key of Object.keys(groups).sort()) {
      html += `<h3 style="font-family:Poppins,sans-serif;font-weight:700;color:${T.NAVY};font-size:1.5rem;margin:40px 0 20px;letter-spacing:-0.01em">${esc(pretty(key))}</h3>`;
      html += gridOpen + groups[key].map((e) => card(e.path, e.title, e.sub)).join('') + gridClose;
    }
  } else {
    const sorted = [...entries].sort((x, y) => x.title.localeCompare(y.title));
    html += gridOpen + sorted.map((e) => card(e.path, e.title, e.sub)).join('') + gridClose;
  }

  const p = makePage();
  p.add(p.hero({ title: m.title, subtitle: m.overline, description: m.desc, ctaText: 'Try it Free', ctaLink: '/register', secondaryCtaText: 'See pricing', secondaryCtaLink: '/pricing', dark: false, minHeight: '52vh' }));
  p.add(p.section('sec-grid', T.TINT, 80, [
    { id: 'grid', type: 'html-render', order: p.ord(), html, width: 'full' },
  ]));
  p.add(p.ctaBlock({ title: `Put PropertyRadar to work`, description: 'Find motivated owners and grow your business faster.', primaryButtonText: 'Try it Free', primaryButtonUrl: '/register', secondaryButtonText: 'See features', secondaryButtonUrl: '/features' }));

  return upsertPage({ slug: type, title: m.title, seoTitle: `${m.title} | PropertyRadar`, seoDescription: m.desc }, p.blocks);
}
Promise.resolve(run()).then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
