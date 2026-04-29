// DOM-structure diff for postcaptain replication.
//
// Companion to style-diff.mjs. Walks each anchored section on the live and
// local postcaptain homepages, builds a normalized tree per section, and
// reports structural mismatches:
//   - nodes present on live but not local (and vice-versa), keyed by tag-path
//   - nodes whose tag matches but whose role / aria-* / data-* differ
//   - childCount deltas at the same path
//
// Output: screenshots/dom-diff.json + screenshots/dom-diff.md
//
// The tree we build is intentionally lossy — we want STRUCTURE, not pixels:
//   { tag, role, ariaLabel, dataKeys, childCount, w, h, text }
// Class names are deliberately excluded (different CSS pipelines, no signal).
//
// We compare trees by walking both sides in lockstep keyed by a stable
// "tag@nthOfType" path. When a node only exists on one side we report it
// with its descendant count so the diff stays compact even for big mismatches.
import { chromium } from 'playwright-core';
import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const OUT = '/Users/dancoyle/simplerdevelopment/simplerdevelopment2026/.planning/postcaptain-replication/screenshots';
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });
const executablePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const SECTIONS = [
  { id: 'hero', anchorText: ['DISCOVER A', 'Discover a'] },
  { id: 'services', anchorText: ['Mapping Smarter Moves', 'OUR SERVICES'] },
  { id: 'portals', anchorText: ["See What's Possible in Slate", 'See What’s Possible in Slate', 'PORTALS'] },
  { id: 'audits', anchorText: ['Get More from Your Slate Instance'] },
  { id: 'solutions', anchorText: ['Charting a Clear Course'] },
  { id: 'stats', anchorText: ['Turning Slate into a Strategic Growth Engine', 'Turning Slate Into a Strategic Growth Engine', 'TURNING SLATE INTO A', 'STRATEGIC GROWTH ENGINE'] },
  { id: 'team', anchorText: ["Follow Our Team's Lead", 'Follow Our Team’s Lead'] },
  { id: 'cta', anchorText: ['Your Slate Journey Starts Here', "Let's Talk Slate", 'Let’s Talk Slate'] },
  { id: 'footer', anchorText: ['__FOOTER__'] },
];

const TARGETS = [
  { id: 'live', url: 'https://postcaptain.com/' },
  { id: 'local', url: 'http://localhost:3000/sites/postcaptain.com' },
];

// Max depth to walk inside a section. Going deeper ~exponentially balloons the
// tree without adding signal — most of our component-level differences live in
// the first 6 levels.
const MAX_DEPTH = 6;

const PAGE_HELPERS = `
  window.__pcDom = (function () {
    function findSectionRoot(needles) {
      if (needles && needles[0] === '__FOOTER__') {
        return document.querySelector('footer');
      }
      const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let n; const matches = [];
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
      const headed = matches.find((el) => {
        let p = el;
        while (p && !/^H[1-6]$/.test(p.tagName)) p = p.parentElement;
        return !!p;
      });
      const anchor = headed || matches[0];
      let root = anchor;
      while (root && root !== document.body) {
        const tag = root.tagName;
        if (tag === 'SECTION' || tag === 'MAIN' || tag === 'FOOTER') return root;
        root = root.parentElement;
      }
      root = anchor;
      while (root && root !== document.body) {
        const r = root.getBoundingClientRect();
        if (r.width >= window.innerWidth * 0.85 && r.height >= 200) return root;
        root = root.parentElement;
      }
      return anchor;
    }

    function describe(el) {
      const r = el.getBoundingClientRect();
      const text = (el.textContent || '').replace(/\\s+/g, ' ').trim();
      const dataKeys = Object.keys(el.dataset || {});
      return {
        tag: el.tagName.toLowerCase(),
        role: el.getAttribute('role') || null,
        ariaLabel: el.getAttribute('aria-label') || null,
        dataKeys: dataKeys.length ? dataKeys : null,
        href: el.tagName === 'A' ? (el.getAttribute('href') || null) : null,
        src: el.tagName === 'IMG' ? (el.getAttribute('src') || null) : null,
        alt: el.tagName === 'IMG' ? (el.getAttribute('alt') || null) : null,
        text: text.length > 80 ? text.slice(0, 80) + '…' : text,
        textLen: text.length,
        w: Math.round(r.width),
        h: Math.round(r.height),
      };
    }

    function buildTree(el, depth, maxDepth) {
      const node = describe(el);
      node.childCount = el.children.length;
      if (depth >= maxDepth) {
        node.children = null; // depth-cut
        return node;
      }
      const kids = [];
      // Bucket by tag + nthOfType so paths stay stable across sites.
      const tagCounts = {};
      for (const child of el.children) {
        // Skip purely-text spans embedded in <p> — they bloat the tree without
        // being structurally meaningful.
        if (child.tagName === 'SCRIPT' || child.tagName === 'STYLE') continue;
        const tag = child.tagName.toLowerCase();
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
        const k = buildTree(child, depth + 1, maxDepth);
        k.pathSeg = tag + '@' + tagCounts[tag];
        kids.push(k);
      }
      node.children = kids;
      return node;
    }

    return { findSectionRoot: findSectionRoot, buildTree: buildTree };
  })();
`;

async function captureTrees(page) {
  await page.addScriptTag({ content: PAGE_HELPERS });
  return await page.evaluate(({ sections, maxDepth }) => {
    const helpers = window.__pcDom;
    const out = {};
    for (const s of sections) {
      const root = helpers.findSectionRoot(s.anchorText);
      if (!root) { out[s.id] = null; continue; }
      out[s.id] = helpers.buildTree(root, 0, maxDepth);
    }
    return out;
  }, { sections: SECTIONS, maxDepth: MAX_DEPTH });
}

async function loadAndPrep(page, target) {
  try {
    await page.goto(target.url, { waitUntil: 'load', timeout: 60000 });
  } catch (e) {
    console.warn('  goto failure', e?.message);
  }
  await page.addStyleTag({
    content: `
      *, *::before, *::after { animation-duration:0s !important; transition-duration:0s !important; }
      [data-aos], .aos-init, .elementor-invisible, .has-fade-in, .fade-in, .reveal, .animate-on-scroll,
      [class*="aos-"], [class*="fade-"], [class*="reveal-"] {
        opacity: 1 !important; transform: none !important; visibility: visible !important;
      }
      #pc-announce { display: none !important; }
      body.pc-has-announce { padding-top: 0 !important; }
      nextjs-portal, next-route-announcer, [data-nextjs-toast], [data-nextjs-build-indicator] { display: none !important; }
    `,
  });
  await page.evaluate(() => {
    const el = document.getElementById('pc-announce'); if (el) el.remove();
    document.body.classList.remove('pc-has-announce');
    document.body.style.paddingTop = '';
    document.querySelectorAll('nextjs-portal, next-route-announcer, [data-nextjs-toast], [data-nextjs-build-indicator]').forEach((el) => el.remove());
  });
  try { await page.waitForLoadState('networkidle', { timeout: 4000 }); } catch {}
  await page.evaluate(async () => {
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
  });
}

// ---- Diffing -----------------------------------------------------------

function countDescendants(node) {
  if (!node || !node.children) return 0;
  let n = node.children.length;
  for (const c of node.children) n += countDescendants(c);
  return n;
}

// Walk a/b in lockstep. Emits a flat list of issues:
//   { kind: 'only_live'|'only_local'|'tag_mismatch'|'attr_mismatch'|'childcount', path, ... }
function diffTree(a, b, path = '$') {
  const issues = [];
  if (!a && !b) return issues;
  if (!a) {
    issues.push({ kind: 'only_local', path, summary: summarize(b), descendants: countDescendants(b) });
    return issues;
  }
  if (!b) {
    issues.push({ kind: 'only_live', path, summary: summarize(a), descendants: countDescendants(a) });
    return issues;
  }
  if (a.tag !== b.tag) {
    issues.push({ kind: 'tag_mismatch', path, live: summarize(a), local: summarize(b) });
    return issues; // children are no longer comparable
  }
  // Attr deltas — just role / aria / data / href / src for now.
  const attrChecks = [
    ['role', a.role, b.role],
    ['aria-label', a.ariaLabel, b.ariaLabel],
    ['href', a.href, b.href],
    ['src', a.src, b.src],
    ['alt', a.alt, b.alt],
  ];
  const attrDeltas = attrChecks.filter(([_, x, y]) => (x || '') !== (y || ''));
  if (attrDeltas.length) {
    issues.push({ kind: 'attr_mismatch', path, deltas: attrDeltas.map(([k, l, lc]) => ({ attr: k, live: l, local: lc })) });
  }
  // Bucket children by pathSeg (tag@n). Set comparison.
  const ak = new Map(), bk = new Map();
  for (const c of a.children || []) ak.set(c.pathSeg, c);
  for (const c of b.children || []) bk.set(c.pathSeg, c);
  const keys = Array.from(new Set([...ak.keys(), ...bk.keys()])).sort();
  if ((a.children || []).length !== (b.children || []).length) {
    issues.push({ kind: 'childcount', path, live: (a.children || []).length, local: (b.children || []).length });
  }
  for (const k of keys) {
    issues.push(...diffTree(ak.get(k) || null, bk.get(k) || null, path + ' > ' + k));
  }
  return issues;
}

function summarize(node) {
  if (!node) return null;
  const bits = [node.tag];
  if (node.role) bits.push('role=' + node.role);
  if (node.ariaLabel) bits.push('aria=' + node.ariaLabel);
  if (node.text) bits.push('"' + node.text + '"');
  bits.push('(' + node.w + 'x' + node.h + ')');
  return bits.join(' ');
}

function renderMarkdown(perSection) {
  let md = '# postcaptain DOM-structure diff (live vs local)\n\n';
  md += '_Each section is walked top-down up to depth ' + MAX_DEPTH + '. Issues are categorized:_\n';
  md += '- `only_live` / `only_local` — node present on one side only (descendants count rolled up)\n';
  md += '- `tag_mismatch` — same path, different tag (children below this point are no longer compared)\n';
  md += '- `attr_mismatch` — role / aria / href / src / alt differs\n';
  md += '- `childcount` — same node, different number of children\n';
  for (const sid of Object.keys(perSection)) {
    const p = perSection[sid];
    md += `\n## ${sid}\n\n`;
    if (p.missing) { md += `_${p.missing}_\n`; continue; }
    if (!p.issues || p.issues.length === 0) { md += '_no structural deltas_\n'; continue; }
    // Group by kind.
    const byKind = {};
    for (const i of p.issues) {
      (byKind[i.kind] ||= []).push(i);
    }
    const kindOrder = ['only_live', 'only_local', 'tag_mismatch', 'attr_mismatch', 'childcount'];
    for (const k of kindOrder) {
      const items = byKind[k];
      if (!items || items.length === 0) continue;
      md += `\n### ${k} (${items.length})\n\n`;
      // Sort: prefer items with most descendants first (high-impact).
      items.sort((a, b) => (b.descendants || 0) - (a.descendants || 0));
      for (const it of items.slice(0, 30)) {
        md += renderIssue(it);
      }
      if (items.length > 30) md += `\n_…and ${items.length - 30} more_\n`;
    }
  }
  return md;
}

function renderIssue(it) {
  if (it.kind === 'only_live' || it.kind === 'only_local') {
    return '- `' + it.path + '` — ' + it.summary + (it.descendants ? ` _(+${it.descendants} descendants)_` : '') + '\n';
  }
  if (it.kind === 'tag_mismatch') {
    return '- `' + it.path + '` — live `' + it.live + '` vs local `' + it.local + '`\n';
  }
  if (it.kind === 'attr_mismatch') {
    const lines = it.deltas.map((d) => `\`${d.attr}\`: \`${d.live ?? ''}\` → \`${d.local ?? ''}\``).join('; ');
    return '- `' + it.path + '` — ' + lines + '\n';
  }
  if (it.kind === 'childcount') {
    return '- `' + it.path + '` — live ' + it.live + ' children, local ' + it.local + '\n';
  }
  return '- `' + it.path + '` — ' + JSON.stringify(it) + '\n';
}

(async () => {
  const browser = await chromium.launch({ executablePath, headless: true });
  const trees = {};
  for (const t of TARGETS) {
    console.log('walking', t.id);
    const ctx = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
      reducedMotion: 'reduce',
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
    });
    const page = await ctx.newPage();
    await loadAndPrep(page, t);
    trees[t.id] = await captureTrees(page);
    await ctx.close();
  }
  await browser.close();

  const perSection = {};
  for (const sid of SECTIONS.map((s) => s.id)) {
    const a = (trees.live || {})[sid];
    const b = (trees.local || {})[sid];
    if (!a && !b) { perSection[sid] = { missing: 'section anchor missing on both sides' }; continue; }
    if (!a) { perSection[sid] = { missing: 'section anchor missing on **live**' }; continue; }
    if (!b) { perSection[sid] = { missing: 'section anchor missing on **local**' }; continue; }
    perSection[sid] = { issues: diffTree(a, b) };
  }

  writeFileSync(join(OUT, 'dom-diff.json'), JSON.stringify({ trees, perSection }, null, 2));
  writeFileSync(join(OUT, 'dom-diff.md'), renderMarkdown(perSection));
  console.log('wrote dom-diff.{md,json}');
})();
