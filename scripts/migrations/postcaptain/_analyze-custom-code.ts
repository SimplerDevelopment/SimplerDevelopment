/**
 * Analyze postcaptain customCss / customJs across the 50 posts to find:
 *   1. Identical sections across ALL posts → candidates for site-level consolidation
 *   2. Identical sections across all posts of one CPT → CPT-level consolidation
 *   3. Per-post-unique remainder → stays at post level
 *
 * Splits each post's customCss into sections delimited by
 *   /* ===== heading ===== *\/   (the postcaptain WP-import convention).
 * Sections are keyed by heading text, then bucketed by exact body equality
 * to find identical sections across posts.
 */
import 'dotenv/config';
import { db } from '@/lib/db';
import { clientWebsites, postTypes, posts } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

const SITE_ID = 144;

interface PostRow {
  id: number;
  postType: string;
  slug: string;
  title: string;
  customCss: string | null;
  customJs: string | null;
}

interface Section {
  heading: string; // canonical heading text e.g. "critical-css"
  raw: string;     // raw section text including its own marker line, trailing newline trimmed
}

function splitCssSections(text: string | null): Section[] {
  if (!text) return [];
  // Match `/* ===== heading ===== */` with at least 4 `=` on either side.
  const re = /\/\*\s*={4,}\s*([^\n*]*?)\s*={4,}\s*\*\//g;
  const matches: { idx: number; heading: string; markerLen: number }[] = [];
  for (const m of text.matchAll(re)) {
    matches.push({ idx: m.index ?? 0, heading: m[1].trim(), markerLen: m[0].length });
  }
  const sections: Section[] = [];
  if (matches.length === 0) {
    return [{ heading: '__whole__', raw: text.trim() }];
  }
  // prelude before first marker
  const prelude = text.slice(0, matches[0].idx).trim();
  if (prelude) sections.push({ heading: '__prelude__', raw: prelude });
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].idx;
    const end = i + 1 < matches.length ? matches[i + 1].idx : text.length;
    const raw = text.slice(start, end).trim();
    sections.push({ heading: matches[i].heading, raw });
  }
  return sections;
}

// JS sections — postcaptain JS uses // --- ---- --- comment delimiters and
// `// === heading ===` patterns. Try a few common patterns.
function splitJsSections(text: string | null): Section[] {
  if (!text) return [];
  const re = /\/\/\s*={3,}\s*([^\n=]*?)\s*={3,}|\/\/\s*-{3,}\s*([^\n-]*?)\s*-{3,}/g;
  const matches: { idx: number; heading: string }[] = [];
  for (const m of text.matchAll(re)) {
    matches.push({ idx: m.index ?? 0, heading: (m[1] ?? m[2] ?? '').trim() });
  }
  const sections: Section[] = [];
  if (matches.length === 0) {
    return [{ heading: '__whole__', raw: text.trim() }];
  }
  const prelude = text.slice(0, matches[0].idx).trim();
  if (prelude) sections.push({ heading: '__prelude__', raw: prelude });
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].idx;
    const end = i + 1 < matches.length ? matches[i + 1].idx : text.length;
    const raw = text.slice(start, end).trim();
    sections.push({ heading: matches[i].heading, raw });
  }
  return sections;
}

async function main() {
  const [site] = await db.select().from(clientWebsites).where(eq(clientWebsites.id, SITE_ID));
  console.log(`Site ${site.id} ${site.name}`);

  const types = await db.select().from(postTypes).where(eq(postTypes.websiteId, SITE_ID));
  console.log(`${types.length} post types: ${types.map(t => t.slug).join(', ')}`);

  const allPosts = (await db
    .select({ id: posts.id, postType: posts.postType, slug: posts.slug, title: posts.title, customCss: posts.customCss, customJs: posts.customJs })
    .from(posts)
    .where(eq(posts.websiteId, SITE_ID))) as PostRow[];
  const postsWithCss = allPosts.filter(p => p.customCss);
  const postsWithJs = allPosts.filter(p => p.customJs);

  for (const layer of ['css', 'js'] as const) {
    console.log(`\n========== ${layer.toUpperCase()} ANALYSIS ==========`);
    const target = layer === 'css' ? postsWithCss : postsWithJs;
    const splitter = layer === 'css' ? splitCssSections : splitJsSections;

    const sectionsByPost = new Map<number, Section[]>();
    for (const p of target) {
      sectionsByPost.set(p.id, splitter(layer === 'css' ? p.customCss : p.customJs));
    }

    // headingsTouched: set of headings that appear in any post
    const headingPostMap = new Map<string, Set<number>>();
    // bodyMap: key = `<heading>::${body}` -> { postIds, bodyLen }
    const bodyMap = new Map<string, { heading: string; body: string; postIds: Set<number> }>();
    for (const [pid, sects] of sectionsByPost) {
      for (const s of sects) {
        if (!headingPostMap.has(s.heading)) headingPostMap.set(s.heading, new Set());
        headingPostMap.get(s.heading)!.add(pid);
        const key = `${s.heading}::${s.raw}`;
        if (!bodyMap.has(key)) bodyMap.set(key, { heading: s.heading, body: s.raw, postIds: new Set() });
        bodyMap.get(key)!.postIds.add(pid);
      }
    }

    // Bucket per heading by which posts use which body.
    const headings = [...headingPostMap.entries()].sort((a, b) => b[1].size - a[1].size);
    console.log(`\nHeadings & coverage (top 30 of ${headings.length}):`);
    for (const [h, set] of headings.slice(0, 30)) {
      console.log(`  ${set.size}/${target.length}  ${h}`);
    }

    // For each heading, find unique bodies and their post coverage.
    let totalGlobalSavings = 0;
    const globalCandidates: { heading: string; body: string; size: number; count: number }[] = [];
    const cptCandidates = new Map<string, { heading: string; body: string; size: number; count: number }[]>();
    const partial: { heading: string; body: string; size: number; count: number; types: string[] }[] = [];

    for (const heading of headingPostMap.keys()) {
      // Bucket posts under this heading by body.
      const buckets: { body: string; postIds: Set<number> }[] = [];
      for (const entry of bodyMap.values()) {
        if (entry.heading !== heading) continue;
        buckets.push({ body: entry.body, postIds: entry.postIds });
      }
      buckets.sort((a, b) => b.postIds.size - a.postIds.size);

      for (const b of buckets) {
        const size = b.body.length;
        const count = b.postIds.size;
        const types = [...new Set([...b.postIds].map(pid => target.find(p => p.id === pid)!.postType))];

        // Global candidate: this body covers ALL target posts (or close).
        if (count === target.length && target.length > 1) {
          globalCandidates.push({ heading, body: b.body, size, count });
          totalGlobalSavings += size * (count - 1);
          continue;
        }
        // CPT candidate: this body covers all posts of one specific CPT.
        const cptCoverage = new Map<string, number>();
        for (const pid of b.postIds) {
          const p = target.find(x => x.id === pid)!;
          cptCoverage.set(p.postType, (cptCoverage.get(p.postType) ?? 0) + 1);
        }
        const totalsByCpt = new Map<string, number>();
        for (const p of target) totalsByCpt.set(p.postType, (totalsByCpt.get(p.postType) ?? 0) + 1);
        const fullCpts = [...cptCoverage.entries()]
          .filter(([cpt, c]) => c === totalsByCpt.get(cpt) && (totalsByCpt.get(cpt) ?? 0) > 1)
          .map(([cpt]) => cpt);
        if (fullCpts.length > 0) {
          for (const cpt of fullCpts) {
            if (!cptCandidates.has(cpt)) cptCandidates.set(cpt, []);
            cptCandidates.get(cpt)!.push({ heading, body: b.body, size, count });
          }
          continue;
        }
        if (count > 1) partial.push({ heading, body: b.body, size, count, types });
      }
    }

    globalCandidates.sort((a, b) => b.size * b.count - a.size * a.count);
    partial.sort((a, b) => b.size * b.count - a.size * a.count);

    console.log(`\n--- GLOBAL candidates (${globalCandidates.length} sections in EVERY post) ---`);
    for (const c of globalCandidates.slice(0, 60)) {
      console.log(`  size=${c.size} × ${c.count} (save ${c.size * (c.count - 1)})  | ${c.heading}`);
    }
    console.log(`  TOTAL global ${layer} savings: ${totalGlobalSavings} chars`);

    for (const [cpt, list] of cptCandidates) {
      list.sort((a, b) => b.size * b.count - a.size * a.count);
      const total = list.reduce((s, c) => s + c.size * (c.count - 1), 0);
      console.log(`\n--- CPT [${cpt}] candidates (${list.length} sections shared by all ${cpt} posts) ---`);
      for (const c of list.slice(0, 30)) {
        console.log(`  size=${c.size} × ${c.count} (save ${c.size * (c.count - 1)})  | ${c.heading}`);
      }
      console.log(`  TOTAL ${cpt} ${layer} savings: ${total} chars`);
    }

    console.log(`\n--- Partial blocks (shared by some, no clean home): ${partial.length} ---`);
    for (const c of partial.slice(0, 25)) {
      console.log(`  size=${c.size} × ${c.count} (types=${c.types.join(',')}) | ${c.heading}`);
    }
  }
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
