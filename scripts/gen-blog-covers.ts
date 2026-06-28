/**
 * Generates representative, on-brand SVG cover images for the marketing blog —
 * one per draft in content/blog/posts/*.md. Each cover shows the post's TOPIC
 * (eyebrow) + TITLE on a themed gradient, so it actually represents the post
 * (vs. reusing an unrelated product screenshot). Output: public/blog-covers/<slug>.svg
 *
 * Run: npx tsx scripts/gen-blog-covers.ts   (then re-run db:seed:blog)
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

type Theme = { eyebrow: string; c1: string; c2: string };
function themeFor(slug: string): Theme {
  if (/(mcp|oauth|safe-ai|ai-)/.test(slug)) return { eyebrow: 'AI & MCP', c1: '#4f46e5', c2: '#7c3aed' };
  if (/(brain|rag)/.test(slug)) return { eyebrow: 'COMPANY BRAIN', c1: '#6d28d9', c2: '#2563eb' };
  if (/(multi-tenant|isolation|queue|self-host|durable)/.test(slug)) return { eyebrow: 'ENGINEERING', c1: '#0f172a', c2: '#1e3a8a' };
  if (/(website|visual|block)/.test(slug)) return { eyebrow: 'PRODUCT', c1: '#0891b2', c2: '#2563eb' };
  if (/(crm|migrate)/.test(slug)) return { eyebrow: 'PRODUCT', c1: '#0d9488', c2: '#0891b2' };
  if (/booking/.test(slug)) return { eyebrow: 'PRODUCT', c1: '#0891b2', c2: '#2563eb' };
  if (/(automation|build-automation)/.test(slug)) return { eyebrow: 'AUTOMATIONS', c1: '#d97706', c2: '#b45309' };
  if (/(white-label|one-platform|agency)/.test(slug)) return { eyebrow: 'AGENCY', c1: '#db2777', c2: '#7c3aed' };
  return { eyebrow: 'SIMPLERDEVELOPMENT', c1: '#2563eb', c2: '#4f46e5' };
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function wrap(title: string, max = 22, maxLines = 4): string[] {
  const words = title.split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > max && cur) { lines.push(cur); cur = w; }
    else cur = (cur + ' ' + w).trim();
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) { lines.length = maxLines; lines[maxLines - 1] = lines[maxLines - 1].replace(/[.,]?$/, '…'); }
  return lines;
}

function parseFm(raw: string): { title: string; slug: string } {
  const m = raw.match(/^---\n([\s\S]*?)\n---/);
  const fm: Record<string, string> = {};
  if (m) for (const l of m[1].split('\n')) { const i = l.indexOf(':'); if (i > 0) fm[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, ''); }
  return { title: fm.title || '', slug: fm.slug || '' };
}

function svg(title: string, slug: string): string {
  const { eyebrow, c1, c2 } = themeFor(slug);
  const lines = wrap(title);
  const startY = 300 - (lines.length - 1) * 38;
  const titleTspans = lines
    .map((ln, i) => `<text x="72" y="${startY + i * 76}" font-family="Inter, Segoe UI, system-ui, sans-serif" font-size="62" font-weight="800" fill="#ffffff">${esc(ln)}</text>`)
    .join('\n  ');
  return `<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(title)}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient>
    <pattern id="dots" width="32" height="32" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.5" fill="#ffffff" opacity="0.07"/></pattern>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect width="1200" height="630" fill="url(#dots)"/>
  <rect x="72" y="120" width="56" height="6" rx="3" fill="#ffffff" opacity="0.9"/>
  <text x="72" y="104" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="24" letter-spacing="4" fill="#ffffff" opacity="0.85">${esc(eyebrow)}</text>
  ${titleTspans}
  <text x="72" y="560" font-family="Inter, Segoe UI, system-ui, sans-serif" font-size="26" font-weight="700" fill="#ffffff" opacity="0.92">&lt;/&gt; Simpler Development</text>
</svg>
`;
}

const dir = path.resolve('content/blog/posts');
const out = path.resolve('public/blog-covers');
fs.mkdirSync(out, { recursive: true });
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.md'));
let n = 0;
for (const f of files) {
  const { title, slug } = parseFm(fs.readFileSync(path.join(dir, f), 'utf8'));
  const s = slug || f.replace(/\.md$/, '');
  fs.writeFileSync(path.join(out, `${s}.svg`), svg(title || s, s));
  n++;
  console.log(`  ✓ ${s}.svg`);
}
console.log(`>> generated ${n} blog cover SVGs in public/blog-covers/`);
