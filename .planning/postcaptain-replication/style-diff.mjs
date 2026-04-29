// Computed-style cross-site diff for postcaptain replication.
//
// Walks each section on https://postcaptain.com and the local mirror at
// /sites/postcaptain.com, extracts computed styles for the section root +
// a small set of structurally-meaningful descendants, and emits:
//
//   - screenshots/style-report-live.json
//   - screenshots/style-report-local.json
//   - screenshots/style-diff.md
//
// Sections are anchored by stable text content (NOT class names — those differ
// between WP/Elementor and our React renderers). Within a section we identify
// descendants by tag-and-position only, so the report is portable.
//
// Properties extracted per element:
//   typography: font-family, font-size, font-weight, line-height,
//               letter-spacing, text-transform
//   color/box:  color, background-color, border, border-radius, box-shadow
//   layout:     padding, margin, display, flex-direction, gap, align-items,
//               justify-content
//   size:       width, height, max-width
//   meta:       textContent (truncated)
//
// Run with `node .planning/postcaptain-replication/style-diff.mjs`.
//
// Notes on robustness:
//   - We DO NOT run the slow-scroll force-reveal loop here — it interacts
//     badly with postcaptain.com's `position:sticky` scroll-tabs heading and
//     leaves window.scrollY non-zero, which corrupts getBoundingClientRect
//     math when we look up sections. detect-sections.mjs has the same caveat.
//   - We do wait on document.fonts.ready and on networkidle (best-effort).
//   - For each property delta we report (live → local) so a diff entry reads
//     like "font-size: 18px → 16px".
import { chromium } from 'playwright-core';
import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const OUT = '/Users/dancoyle/simplerdevelopment/simplerdevelopment2026/.planning/postcaptain-replication/screenshots';
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });
const executablePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

// Each section's anchor: the heading or eyebrow text we know exists on both
// sides. The section root we report on is the closest ancestor <section>,
// <main>, or <div> that wraps the heading and the surrounding content.
//
// `id` is the canonical section id used everywhere else in this folder.
// `anchorText` is a list of fallback strings — try each in order until one
// matches. Smart-quote variants are listed because the live site curls them.
const SECTIONS = [
  { id: 'hero', anchorText: ['DISCOVER A', 'Discover a'] },
  { id: 'services', anchorText: ['Mapping Smarter Moves', 'OUR SERVICES'] },
  { id: 'portals', anchorText: ["See What's Possible in Slate", 'See What’s Possible in Slate', 'PORTALS'] },
  { id: 'audits', anchorText: ['Get More from Your Slate Instance'] },
  { id: 'solutions', anchorText: ['Charting a Clear Course'] },
  { id: 'stats', anchorText: ['Turning Slate into a Strategic Growth Engine', 'Turning Slate Into a Strategic Growth Engine', 'TURNING SLATE INTO A', 'STRATEGIC GROWTH ENGINE'] },
  { id: 'team', anchorText: ["Follow Our Team's Lead", 'Follow Our Team’s Lead'] },
  { id: 'cta', anchorText: ['Your Slate Journey Starts Here', "Let's Talk Slate", 'Let’s Talk Slate'] },
  { id: 'footer', anchorText: ['__FOOTER__'] }, // sentinel: handled by tag, not text
];

const TARGETS = [
  { id: 'live', url: 'https://postcaptain.com/' },
  { id: 'local', url: 'http://localhost:3000/sites/postcaptain.com' },
];

// CSS properties we care about, grouped to make the diff readable.
const PROPS = [
  // typography
  'font-family',
  'font-size',
  'font-weight',
  'line-height',
  'letter-spacing',
  'text-transform',
  // color / box
  'color',
  'background-color',
  'border-top-width',
  'border-right-width',
  'border-bottom-width',
  'border-left-width',
  'border-top-color',
  'border-radius',
  'box-shadow',
  // layout
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'display',
  'flex-direction',
  'gap',
  'align-items',
  'justify-content',
  'text-align',
  // size
  'width',
  'height',
  'max-width',
];

// In-page helpers (injected via addInitScript so they're available before
// any page.evaluate call). Self-contained — no closure dependencies.
const PAGE_HELPERS = `
  window.__pcDiff = (function() {
  function findSectionRoot(needles) {
    if (needles && needles[0] === '__FOOTER__') {
      const footer = document.querySelector('footer');
      return footer || null;
    }
    const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n;
    const matches = [];
    while ((n = tw.nextNode())) {
      const v = n.nodeValue || '';
      for (const needle of needles) {
        if (v.includes(needle)) {
          let el = n.parentElement;
          while (el && el.tagName === 'SPAN') el = el.parentElement;
          if (el) matches.push(el);
          break;
        }
      }
    }
    if (!matches.length) return null;
    // Prefer matches that are inside an h1/h2/h3 — section headings are the
    // anchor. Otherwise take the first match.
    const headed = matches.find((el) => {
      let p = el;
      while (p && !/^H[1-6]$/.test(p.tagName)) p = p.parentElement;
      return !!p;
    });
    const anchor = headed || matches[0];
    // Walk up to the nearest <section>, <main>, or large container <div>.
    let root = anchor;
    while (root && root !== document.body) {
      const tag = root.tagName;
      if (tag === 'SECTION' || tag === 'MAIN' || tag === 'FOOTER') return root;
      root = root.parentElement;
    }
    // Fallback: walk up to a div whose own bounding rect is wide.
    root = anchor;
    while (root && root !== document.body) {
      const r = root.getBoundingClientRect();
      if (r.width >= window.innerWidth * 0.85 && r.height >= 200) return root;
      root = root.parentElement;
    }
    return anchor;
  }

  // Pick a small set of "interesting" descendants under the section root.
  // We pick the first H1, first H2, first H3, first <p>, first <button>,
  // first <a> that isn't inside a nav, and the first <img>. Each gets a
  // tag+ordinal path key like "h1", "p[1]", "a[2]". Returns elements.
  function pickDescendants(root) {
    const selectors = [
      { key: 'h1', sel: 'h1', limit: 1 },
      { key: 'h2', sel: 'h2', limit: 1 },
      { key: 'h3', sel: 'h3', limit: 1 },
      { key: 'h4', sel: 'h4', limit: 1 },
      { key: 'p', sel: 'p', limit: 2 },
      { key: 'button', sel: 'button, a[role=button], a.button', limit: 2 },
      { key: 'a', sel: 'a', limit: 2 },
      { key: 'img', sel: 'img', limit: 1 },
      { key: 'li', sel: 'li, [role=listitem]', limit: 2 },
    ];
    const picked = [];
    const seen = new Set();
    for (const s of selectors) {
      const all = Array.from(root.querySelectorAll(s.sel));
      // Filter: must be visible (non-zero bounding rect) and not inside a
      // <nav> or top-level <header> (so we skip header logos / nav links).
      const filtered = all.filter((el) => {
        if (seen.has(el)) return false;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return false;
        let p = el;
        while (p && p !== root) {
          if (p.tagName === 'NAV' || p.tagName === 'HEADER') return false;
          p = p.parentElement;
        }
        return true;
      });
      let i = 0;
      for (const el of filtered.slice(0, s.limit)) {
        const key = s.limit === 1 ? s.key : s.key + '[' + i + ']';
        picked.push({ key, el });
        seen.add(el);
        i++;
      }
    }
    return picked;
  }

  function snapshotElement(el, props) {
    const cs = window.getComputedStyle(el);
    const out = {};
    for (const p of props) out[p] = cs.getPropertyValue(p);
    const r = el.getBoundingClientRect();
    out['_bounding'] = { w: Math.round(r.width), h: Math.round(r.height) };
    out['_tag'] = el.tagName.toLowerCase();
    const text = (el.textContent || '').replace(/\\s+/g, ' ').trim();
    out['_text'] = text.slice(0, 200);
    return out;
  }
  return { findSectionRoot: findSectionRoot, pickDescendants: pickDescendants, snapshotElement: snapshotElement };
  })();
`;

async function captureSnapshot(page) {
  // Inject the helpers as a script tag (page.evaluate with a string runs the
  // value as an *expression*, which breaks function declarations — addScriptTag
  // runs the content as a regular script, which is what we want).
  await page.addScriptTag({ content: PAGE_HELPERS });
  // Build the snapshot inside the page so we don't ferry a million round
  // trips. Returns: { [sectionId]: { root: {...}, descendants: { key: {...} } } }.
  const snap = await page.evaluate(({ sections, props }) => {
    const helpers = window.__pcDiff;
    const out = {};
    for (const s of sections) {
      const root = helpers.findSectionRoot(s.anchorText);
      if (!root) {
        out[s.id] = null;
        continue;
      }
      const rootSnap = helpers.snapshotElement(root, props);
      const descendants = {};
      const picked = helpers.pickDescendants(root);
      for (const { key, el } of picked) {
        descendants[key] = helpers.snapshotElement(el, props);
      }
      out[s.id] = { root: rootSnap, descendants };
    }
    return out;
  }, { sections: SECTIONS, props: PROPS });
  return snap;
}

async function loadAndPrep(page, target) {
  try {
    await page.goto(target.url, { waitUntil: 'load', timeout: 60000 });
  } catch (e) {
    console.warn('  goto failure', e?.message);
  }
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation-duration: 0s !important;
        animation-delay: 0s !important;
        transition-duration: 0s !important;
        transition-delay: 0s !important;
      }
      [data-aos], .aos-init, .elementor-invisible,
      .has-fade-in, .fade-in, .reveal, .animate-on-scroll,
      [class*="aos-"], [class*="fade-"], [class*="reveal-"] {
        opacity: 1 !important;
        transform: none !important;
        visibility: visible !important;
      }
      #pc-announce { display: none !important; }
      body.pc-has-announce { padding-top: 0 !important; }
      body.pc-has-announce nav.fixed { top: 0 !important; }
      nextjs-portal,
      next-route-announcer,
      [data-nextjs-toast],
      [data-nextjs-build-indicator] {
        display: none !important;
      }
    `,
  });
  await page.evaluate(() => {
    const el = document.getElementById('pc-announce');
    if (el) el.remove();
    document.body.classList.remove('pc-has-announce');
    document.body.style.paddingTop = '';
    document.querySelectorAll('nextjs-portal, next-route-announcer, [data-nextjs-toast], [data-nextjs-build-indicator]').forEach((el) => el.remove());
  });
  try {
    await page.waitForLoadState('networkidle', { timeout: 4000 });
  } catch {}
  await page.evaluate(async () => {
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
  });
}

function diffSnapshots(live, local) {
  // For every section, compare root and each descendant key. Emit deltas keyed
  // by section/element-path with property-level (live → local) entries.
  const diff = {};
  const sectionIds = Array.from(new Set([...Object.keys(live || {}), ...Object.keys(local || {})]));
  for (const sid of sectionIds) {
    const lv = live[sid];
    const lc = local[sid];
    const sectionDiff = { missing_in_live: false, missing_in_local: false, root: [], descendants: {} };
    if (!lv) sectionDiff.missing_in_live = true;
    if (!lc) sectionDiff.missing_in_local = true;
    if (lv && lc) {
      sectionDiff.root = compareElement(lv.root, lc.root);
      const keys = Array.from(new Set([
        ...Object.keys(lv.descendants || {}),
        ...Object.keys(lc.descendants || {}),
      ]));
      for (const k of keys) {
        const a = (lv.descendants || {})[k];
        const b = (lc.descendants || {})[k];
        if (!a) {
          sectionDiff.descendants[k] = { only_in_local: true, snapshot: b };
        } else if (!b) {
          sectionDiff.descendants[k] = { only_in_live: true, snapshot: a };
        } else {
          const deltas = compareElement(a, b);
          if (deltas.length) sectionDiff.descendants[k] = { deltas };
        }
      }
    }
    diff[sid] = sectionDiff;
  }
  return diff;
}

function compareElement(a, b) {
  const deltas = [];
  if (!a || !b) return deltas;
  const allKeys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of allKeys) {
    if (k.startsWith('_')) continue; // metadata
    const av = (a[k] || '').trim();
    const bv = (b[k] || '').trim();
    if (av !== bv) deltas.push({ prop: k, live: av, local: bv });
  }
  // Bounding box delta is informational — flag if either dimension differs by
  // more than 20%.
  const ab = a._bounding;
  const bb = b._bounding;
  if (ab && bb) {
    const wDiffPct = ab.w === 0 ? 0 : Math.abs(ab.w - bb.w) / ab.w;
    const hDiffPct = ab.h === 0 ? 0 : Math.abs(ab.h - bb.h) / ab.h;
    if (wDiffPct > 0.2 || hDiffPct > 0.2) {
      deltas.push({ prop: '_bounding', live: ab.w + 'x' + ab.h, local: bb.w + 'x' + bb.h });
    }
  }
  // Text-content delta is informational, surfaced near the bottom.
  const at = (a._text || '').slice(0, 80);
  const bt = (b._text || '').slice(0, 80);
  if (at !== bt) deltas.push({ prop: '_text', live: at, local: bt });
  return deltas;
}

function renderMarkdown(diff, snapshots) {
  let md = '# postcaptain computed-style diff (live vs local)\n\n';
  md += '_For each section, properties are listed only when they differ. `_bounding` is the element’s rendered W×H — flagged when off by >20%. `_text` is the truncated textContent — flagged when changed._\n';
  for (const sid of Object.keys(diff)) {
    const d = diff[sid];
    md += `\n## ${sid}\n\n`;
    if (d.missing_in_live && d.missing_in_local) { md += '_section not found on either side_\n'; continue; }
    if (d.missing_in_live) { md += '_section anchor not found on **live**_\n'; continue; }
    if (d.missing_in_local) { md += '_section anchor not found on **local**_\n'; continue; }
    md += '### root\n\n';
    md += renderDeltas(d.root);
    const dKeys = Object.keys(d.descendants);
    if (dKeys.length === 0) {
      md += '\n_no descendant deltas_\n';
    } else {
      for (const k of dKeys) {
        const entry = d.descendants[k];
        md += `\n### ${k}\n\n`;
        if (entry.only_in_live) {
          const t = (entry.snapshot && entry.snapshot._text) || '';
          md += `_only present on **live**_ — \`${t.slice(0, 80)}\`\n`;
          continue;
        }
        if (entry.only_in_local) {
          const t = (entry.snapshot && entry.snapshot._text) || '';
          md += `_only present on **local**_ — \`${t.slice(0, 80)}\`\n`;
          continue;
        }
        md += renderDeltas(entry.deltas || []);
      }
    }
  }
  return md;
}

function renderDeltas(deltas) {
  if (!deltas || deltas.length === 0) return '_no deltas_\n';
  let out = '| prop | live | local |\n|---|---|---|\n';
  // Stable sort: text/bounding/structural at the top, others alphabetical.
  const priority = (p) => {
    if (p === '_text') return 0;
    if (p === '_bounding') return 1;
    if (p === 'display' || p === 'flex-direction') return 2;
    return 3;
  };
  const sorted = [...deltas].sort((a, b) => {
    const pa = priority(a.prop), pb = priority(b.prop);
    if (pa !== pb) return pa - pb;
    return a.prop.localeCompare(b.prop);
  });
  for (const d of sorted) {
    const lv = String(d.live || '').replace(/\|/g, '\\|');
    const lc = String(d.local || '').replace(/\|/g, '\\|');
    out += `| \`${d.prop}\` | ${lv} | ${lc} |\n`;
  }
  return out;
}

(async () => {
  const browser = await chromium.launch({ executablePath, headless: true });
  const snapshots = {};
  for (const t of TARGETS) {
    console.log('snapshotting', t.id);
    const ctx = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
      reducedMotion: 'reduce',
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
    });
    const page = await ctx.newPage();
    await loadAndPrep(page, t);
    snapshots[t.id] = await captureSnapshot(page);
    await ctx.close();
  }
  await browser.close();

  writeFileSync(join(OUT, 'style-report-live.json'), JSON.stringify(snapshots.live, null, 2));
  writeFileSync(join(OUT, 'style-report-local.json'), JSON.stringify(snapshots.local, null, 2));
  console.log('wrote style-report-{live,local}.json');

  const diff = diffSnapshots(snapshots.live, snapshots.local);
  writeFileSync(join(OUT, 'style-diff.json'), JSON.stringify(diff, null, 2));
  const md = renderMarkdown(diff, snapshots);
  writeFileSync(join(OUT, 'style-diff.md'), md);
  console.log('wrote style-diff.{md,json}');
})();
