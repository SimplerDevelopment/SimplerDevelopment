/**
 * Consolidate postcaptain customCss / customJs.
 *
 * Background: the WP→2026 migration baked a near-identical ~470 KB CSS
 * bundle into every page's `posts.customCss`. The same bundle is also in
 * every CPT's posts. site.customCss and postTypes.customCss are empty.
 * Net effect: ~24 MB of duplicated CSS blob and ~270 KB of duplicated JS.
 *
 * This script splits each post's customCss / customJs into ordered sections
 * (CSS: `/* ===== heading ===== *\/`; JS: `// === heading ===`) and finds
 * sections whose exact body text appears in many posts. Each section is
 * then promoted to the cheapest layer that still covers all the posts that
 * actually use it:
 *
 *   1. site.customCss / customJs   → body identical in ≥ SITE_THRESHOLD posts
 *   2. postTypes[X].customCss / Js → body identical in 100% of one CPT's
 *                                    posts (and ≥ 2 posts in that CPT)
 *   3. posts[N].customCss / Js     → leftover unique sections per post
 *
 * Cascade order at render time is site → type → post (see SiteBlockRenderer),
 * so promoting a section into a higher layer is byte-equivalent for any post
 * that already had it. Posts that did NOT have the section originally will
 * inherit the site-layer styles after this runs — for postcaptain that's
 * just one outlier (post 452 "A Teddy's Takeover", a near-empty event page),
 * and the styles being inherited are the standard WP-imported foundation.
 *
 * Idempotency: site.customCss is wrapped with the markers
 *   /* ## CONSOLIDATED:SITE START ## *\/  …  /* ## CONSOLIDATED:SITE END ## *\/
 * On re-run, the promoted block is rebuilt from scratch — any new sections
 * that have crept into many posts since the last run will move up too.
 *
 * Backup: dumps every post's pre-migration customCss / customJs to
 *   .claude/.runtime/dev-block/postcaptain-pre-consolidation-<ts>.json
 * (gitignored). Roll back with `_restore-from-backup.ts <file>` if needed.
 *
 * Run:
 *   bun -r dotenv/config scripts/migrations/postcaptain/consolidate-custom-code.ts dotenv_config_path=.env.local           # dry run, default
 *   bun -r dotenv/config scripts/migrations/postcaptain/consolidate-custom-code.ts dotenv_config_path=.env.local --apply   # actually write
 */
import 'dotenv/config';
import { db } from '@/lib/db';
import { clientWebsites, postTypes, posts } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const SITE_ID = 144;
const SITE_THRESHOLD_RATIO = 0.95; // promote sections present in ≥ 95% of posts
const CPT_MIN_POSTS = 2;           // CPT promotion needs at least this many posts
const APPLY = process.argv.includes('--apply');

const SITE_START = '/* ## CONSOLIDATED:SITE START ## */';
const SITE_END   = '/* ## CONSOLIDATED:SITE END ## */';
const CPT_START  = '/* ## CONSOLIDATED:CPT START ## */';
const CPT_END    = '/* ## CONSOLIDATED:CPT END ## */';
const SITE_START_JS = '// ## CONSOLIDATED:SITE START ##';
const SITE_END_JS   = '// ## CONSOLIDATED:SITE END ##';
const CPT_START_JS  = '// ## CONSOLIDATED:CPT START ##';
const CPT_END_JS    = '// ## CONSOLIDATED:CPT END ##';

interface Section {
  heading: string;
  raw: string; // includes the leading marker, no trailing newline
  start: number; // byte offset in original
}

interface PostRow {
  id: number;
  postType: string;
  slug: string;
  title: string;
  customCss: string | null;
  customJs: string | null;
}

function splitCssSections(text: string | null): Section[] {
  if (!text) return [];
  const re = /\/\*\s*={4,}\s*([^\n*]*?)\s*={4,}\s*\*\//g;
  const matches: { idx: number; heading: string }[] = [];
  for (const m of text.matchAll(re)) {
    matches.push({ idx: m.index ?? 0, heading: m[1].trim() });
  }
  const sections: Section[] = [];
  if (matches.length === 0) return [{ heading: '__whole__', raw: text.trim(), start: 0 }];
  if (matches[0].idx > 0) {
    const prelude = text.slice(0, matches[0].idx).trim();
    if (prelude) sections.push({ heading: '__prelude__', raw: prelude, start: 0 });
  }
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].idx;
    const end = i + 1 < matches.length ? matches[i + 1].idx : text.length;
    sections.push({ heading: matches[i].heading, raw: text.slice(start, end).trim(), start });
  }
  return sections;
}

// Strip any prior consolidation block so we can rebuild from a clean slate.
function stripConsolidatedMarkers(text: string | null, start: string, end: string): string {
  if (!text) return '';
  let out = text;
  while (true) {
    const s = out.indexOf(start);
    if (s < 0) break;
    const e = out.indexOf(end, s);
    if (e < 0) break;
    out = (out.slice(0, s) + out.slice(e + end.length)).trim();
  }
  return out;
}

function splitJsSections(text: string | null): Section[] {
  if (!text) return [];
  const re = /\/\/\s*={3,}\s*([^\n=]*?)\s*={3,}|\/\/\s*-{3,}\s*([^\n-]*?)\s*-{3,}/g;
  const matches: { idx: number; heading: string }[] = [];
  for (const m of text.matchAll(re)) {
    matches.push({ idx: m.index ?? 0, heading: (m[1] ?? m[2] ?? '').trim() });
  }
  const sections: Section[] = [];
  if (matches.length === 0) return [{ heading: '__whole__', raw: text.trim(), start: 0 }];
  if (matches[0].idx > 0) {
    const prelude = text.slice(0, matches[0].idx).trim();
    if (prelude) sections.push({ heading: '__prelude__', raw: prelude, start: 0 });
  }
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].idx;
    const end = i + 1 < matches.length ? matches[i + 1].idx : text.length;
    sections.push({ heading: matches[i].heading, raw: text.slice(start, end).trim(), start });
  }
  return sections;
}

interface ConsolidationPlan {
  // bodies that should be moved to the site layer
  siteBodies: Set<string>;
  // bodies that should be moved to a specific CPT layer
  cptBodies: Map<string, Set<string>>; // cpt slug -> set of bodies
  // ordered list of (heading, body) to write into site.customCss
  siteOrder: { heading: string; body: string }[];
  // ordered list per CPT
  cptOrder: Map<string, { heading: string; body: string }[]>;
  // canonical post that defines the order
  canonicalPostId: number;
}

function buildPlan(
  posts: PostRow[],
  splitter: (s: string | null) => Section[],
  field: 'customCss' | 'customJs',
): ConsolidationPlan {
  const target = posts.filter(p => p[field]);
  if (target.length === 0) {
    return { siteBodies: new Set(), cptBodies: new Map(), siteOrder: [], cptOrder: new Map(), canonicalPostId: 0 };
  }

  // body -> Set<postId>
  const bodyToPosts = new Map<string, Set<number>>();
  // body -> heading (most common heading observed for this body — but they should all be the same)
  const bodyToHeading = new Map<string, string>();
  const sectionsByPost = new Map<number, Section[]>();

  for (const p of target) {
    const sections = splitter(p[field]);
    sectionsByPost.set(p.id, sections);
    const seen = new Set<string>();
    for (const s of sections) {
      const body = s.raw;
      if (!body || seen.has(body)) continue;
      seen.add(body);
      if (!bodyToPosts.has(body)) bodyToPosts.set(body, new Set());
      bodyToPosts.get(body)!.add(p.id);
      if (!bodyToHeading.has(body)) bodyToHeading.set(body, s.heading);
    }
  }

  const totalsByCpt = new Map<string, number>();
  for (const p of target) totalsByCpt.set(p.postType, (totalsByCpt.get(p.postType) ?? 0) + 1);

  const siteThreshold = Math.max(2, Math.floor(target.length * SITE_THRESHOLD_RATIO));
  const siteBodies = new Set<string>();
  const cptBodies = new Map<string, Set<string>>();

  for (const [body, postIds] of bodyToPosts) {
    if (postIds.size >= siteThreshold) {
      siteBodies.add(body);
      continue;
    }
    // CPT coverage: how many of one CPT's posts use this body?
    const cptCoverage = new Map<string, number>();
    for (const pid of postIds) {
      const p = target.find(x => x.id === pid)!;
      cptCoverage.set(p.postType, (cptCoverage.get(p.postType) ?? 0) + 1);
    }
    for (const [cpt, c] of cptCoverage) {
      const total = totalsByCpt.get(cpt) ?? 0;
      if (c === total && total >= CPT_MIN_POSTS) {
        if (!cptBodies.has(cpt)) cptBodies.set(cpt, new Set());
        cptBodies.get(cpt)!.add(body);
      }
    }
  }

  // Pick a canonical post (the one with the most distinct sections) — its
  // section ORDER defines the order we use when rebuilding site/CPT layers.
  const canonical = [...sectionsByPost.entries()]
    .sort((a, b) => b[1].length - a[1].length)[0][0];
  const canonicalSections = sectionsByPost.get(canonical)!;

  // Walk canonical in order to build siteOrder.
  const siteOrder: { heading: string; body: string }[] = [];
  const seenSite = new Set<string>();
  for (const s of canonicalSections) {
    if (siteBodies.has(s.raw) && !seenSite.has(s.raw)) {
      siteOrder.push({ heading: s.heading, body: s.raw });
      seenSite.add(s.raw);
    }
  }

  // For each CPT, pick a canonical post within that CPT (most sections) and
  // build cptOrder for that CPT.
  const cptOrder = new Map<string, { heading: string; body: string }[]>();
  const byCpt = new Map<string, PostRow[]>();
  for (const p of target) {
    if (!byCpt.has(p.postType)) byCpt.set(p.postType, []);
    byCpt.get(p.postType)!.push(p);
  }
  for (const [cpt, list] of byCpt) {
    if (!cptBodies.has(cpt)) continue;
    const bodies = cptBodies.get(cpt)!;
    const sortedByCount = list.map(p => ({ p, n: sectionsByPost.get(p.id)!.length })).sort((a, b) => b.n - a.n);
    const cptCanonical = sortedByCount[0].p;
    const cptCanonicalSections = sectionsByPost.get(cptCanonical.id)!;
    const order: { heading: string; body: string }[] = [];
    const seen = new Set<string>();
    for (const s of cptCanonicalSections) {
      if (bodies.has(s.raw) && !seen.has(s.raw)) {
        order.push({ heading: s.heading, body: s.raw });
        seen.add(s.raw);
      }
    }
    cptOrder.set(cpt, order);
  }

  return { siteBodies, cptBodies, siteOrder, cptOrder, canonicalPostId: canonical };
}

function buildLayerText(parts: { heading: string; body: string }[], startMarker: string, endMarker: string): string {
  if (parts.length === 0) return '';
  const inner = parts.map(p => p.body).join('\n\n');
  return `${startMarker}\n${inner}\n${endMarker}`;
}

function rebuildPostText(
  original: string | null,
  splitter: (s: string | null) => Section[],
  promotedBodies: Set<string>,
): string {
  if (!original) return '';
  const sections = splitter(original);
  if (sections.length === 0) return '';
  // Reassemble in ORIGINAL order, dropping any section whose body matches
  // a promoted body.
  const kept = sections.filter(s => !promotedBodies.has(s.raw));
  return kept.map(s => s.raw).join('\n\n').trim();
}

async function main() {
  console.log(APPLY ? '*** APPLY mode — writing to DB ***' : '--- DRY RUN — no DB writes ---');
  const [site] = await db.select().from(clientWebsites).where(eq(clientWebsites.id, SITE_ID));
  if (!site) throw new Error(`site ${SITE_ID} not found`);
  console.log(`site ${site.id} ${site.name}`);

  // Idempotency guard: if site.customCss already has the consolidation
  // sentinel, this site has been processed. The post-level data has
  // already had the duplicates stripped, so re-planning would compute an
  // empty site layer and erase the previous consolidation. Bail out and
  // tell the caller how to start over cleanly (restore from backup, then
  // re-apply).
  if (APPLY && site.customCss?.includes(SITE_START)) {
    console.log(
      `\nsite.customCss already contains the consolidation sentinel — this site\n` +
      `has been consolidated. To re-run from scratch, restore from the most\n` +
      `recent .claude/.runtime/dev-block/postcaptain-pre-consolidation-*.json\n` +
      `via _restore-from-backup.ts, then re-run this with --apply.`,
    );
    process.exit(0);
  }

  const types = await db.select().from(postTypes).where(eq(postTypes.websiteId, SITE_ID));
  const allPosts = (await db
    .select({ id: posts.id, postType: posts.postType, slug: posts.slug, title: posts.title, customCss: posts.customCss, customJs: posts.customJs })
    .from(posts)
    .where(eq(posts.websiteId, SITE_ID))) as PostRow[];

  // Pre-strip any prior consolidation markers so we re-plan from raw bodies.
  const cleanPosts: PostRow[] = allPosts.map(p => ({
    ...p,
    customCss: stripConsolidatedMarkers(p.customCss ?? '', SITE_START, SITE_END) || null,
    customJs: stripConsolidatedMarkers(p.customJs ?? '', SITE_START_JS, SITE_END_JS) || null,
  }));

  // ---- BACKUP -----------------------------------------------------------
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = join(
    process.cwd(),
    '.claude/.runtime/dev-block',
    `postcaptain-pre-consolidation-${ts}.json`,
  );
  mkdirSync(dirname(backupPath), { recursive: true });
  writeFileSync(
    backupPath,
    JSON.stringify(
      {
        site: { id: site.id, customCss: site.customCss, customJs: site.customJs },
        types: types.map(t => ({ id: t.id, slug: t.slug, customCss: t.customCss, customJs: t.customJs })),
        posts: allPosts.map(p => ({ id: p.id, postType: p.postType, slug: p.slug, customCss: p.customCss, customJs: p.customJs })),
      },
      null,
      2,
    ),
  );
  console.log(`backup → ${backupPath}`);

  // ---- PLAN -------------------------------------------------------------
  const cssPlan = buildPlan(cleanPosts, splitCssSections, 'customCss');
  const jsPlan = buildPlan(cleanPosts, splitJsSections, 'customJs');

  console.log(`\nCSS plan:`);
  console.log(`  canonical post: ${cssPlan.canonicalPostId}`);
  console.log(`  site sections promoted: ${cssPlan.siteOrder.length}`);
  console.log(`  CPT promotions:`);
  for (const [cpt, list] of cssPlan.cptOrder) {
    console.log(`    [${cpt}]: ${list.length} sections`);
  }
  console.log(`\nJS plan:`);
  console.log(`  canonical post: ${jsPlan.canonicalPostId}`);
  console.log(`  site sections promoted: ${jsPlan.siteOrder.length}`);
  console.log(`  CPT promotions:`);
  for (const [cpt, list] of jsPlan.cptOrder) {
    console.log(`    [${cpt}]: ${list.length} sections`);
  }

  // Build the layer texts.
  const newSiteCss = buildLayerText(cssPlan.siteOrder, SITE_START, SITE_END);
  const newSiteJs  = buildLayerText(jsPlan.siteOrder,  SITE_START_JS, SITE_END_JS);

  const newCptCssByCpt = new Map<string, string>();
  for (const [cpt, list] of cssPlan.cptOrder) {
    newCptCssByCpt.set(cpt, buildLayerText(list, CPT_START, CPT_END));
  }
  const newCptJsByCpt = new Map<string, string>();
  for (const [cpt, list] of jsPlan.cptOrder) {
    newCptJsByCpt.set(cpt, buildLayerText(list, CPT_START_JS, CPT_END_JS));
  }

  // Compute new post bodies (drop promoted sections).
  const newPostRows = cleanPosts.map(p => {
    const promotedCss = new Set<string>([
      ...cssPlan.siteBodies,
      ...(cssPlan.cptBodies.get(p.postType) ?? new Set()),
    ]);
    const promotedJs = new Set<string>([
      ...jsPlan.siteBodies,
      ...(jsPlan.cptBodies.get(p.postType) ?? new Set()),
    ]);
    const newCss = rebuildPostText(p.customCss, splitCssSections, promotedCss);
    const newJs = rebuildPostText(p.customJs, splitJsSections, promotedJs);
    return { ...p, newCss, newJs };
  });

  // ---- REPORT -----------------------------------------------------------
  const beforeCssTotal = allPosts.reduce((s, p) => s + (p.customCss?.length ?? 0), 0);
  const beforeJsTotal  = allPosts.reduce((s, p) => s + (p.customJs?.length ?? 0), 0);
  const afterCssTotal  = newPostRows.reduce((s, p) => s + p.newCss.length, 0) + newSiteCss.length +
    [...newCptCssByCpt.values()].reduce((s, v) => s + v.length, 0);
  const afterJsTotal   = newPostRows.reduce((s, p) => s + p.newJs.length, 0) + newSiteJs.length +
    [...newCptJsByCpt.values()].reduce((s, v) => s + v.length, 0);

  console.log(`\nCSS: ${beforeCssTotal} → ${afterCssTotal} (saved ${beforeCssTotal - afterCssTotal} chars, ${((1 - afterCssTotal / Math.max(1, beforeCssTotal)) * 100).toFixed(1)}%)`);
  console.log(`JS:  ${beforeJsTotal} → ${afterJsTotal} (saved ${beforeJsTotal - afterJsTotal} chars, ${((1 - afterJsTotal / Math.max(1, beforeJsTotal)) * 100).toFixed(1)}%)`);

  console.log(`\nNew site.customCss length: ${newSiteCss.length}`);
  console.log(`New site.customJs length: ${newSiteJs.length}`);
  for (const [cpt, css] of newCptCssByCpt) console.log(`  type[${cpt}].customCss length: ${css.length}`);
  for (const [cpt, js] of newCptJsByCpt) console.log(`  type[${cpt}].customJs length: ${js.length}`);

  console.log(`\nPer-post deltas (top 10 by savings):`);
  const deltas = newPostRows.map(p => ({
    id: p.id, slug: p.slug, type: p.postType,
    cssDelta: (p.customCss?.length ?? 0) - p.newCss.length,
    jsDelta: (p.customJs?.length ?? 0) - p.newJs.length,
    newCssLen: p.newCss.length, newJsLen: p.newJs.length,
  }));
  deltas.sort((a, b) => (b.cssDelta + b.jsDelta) - (a.cssDelta + a.jsDelta));
  for (const d of deltas.slice(0, 10)) {
    console.log(`  post ${d.id} [${d.type}/${d.slug}] css -${d.cssDelta} (now ${d.newCssLen}), js -${d.jsDelta} (now ${d.newJsLen})`);
  }

  if (!APPLY) {
    console.log(`\n--- DRY RUN complete. Re-run with --apply to write. ---`);
    process.exit(0);
  }

  // ---- WRITE ------------------------------------------------------------
  await db.transaction(async (tx) => {
    await tx
      .update(clientWebsites)
      .set({ customCss: newSiteCss || null, customJs: newSiteJs || null, updatedAt: new Date() })
      .where(eq(clientWebsites.id, site.id));

    for (const t of types) {
      const newCss = newCptCssByCpt.get(t.slug) ?? '';
      const newJs = newCptJsByCpt.get(t.slug) ?? '';
      await tx
        .update(postTypes)
        .set({ customCss: newCss || null, customJs: newJs || null, updatedAt: new Date() })
        .where(eq(postTypes.id, t.id));
    }

    for (const row of newPostRows) {
      await tx
        .update(posts)
        .set({ customCss: row.newCss || null, customJs: row.newJs || null, updatedAt: new Date() })
        .where(eq(posts.id, row.id));
    }
  });

  console.log(`\n*** APPLIED. Rollback file: ${backupPath} ***`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
