/**
 * extract-posts.ts
 * Fetches PropertyRadar blog posts with enriched metadata.
 *
 * Usage:
 *   npx tsx scripts/migrations/propertyradar/extract-posts.ts            # smoke test (limit=3)
 *   npx tsx scripts/migrations/propertyradar/extract-posts.ts --limit 10 # run 10
 *   npx tsx scripts/migrations/propertyradar/extract-posts.ts --limit 0  # all
 *
 * Writes data/blog.json (array).
 */

import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";
import { JSDOM } from "jsdom";

const DATA_DIR = path.join(import.meta.dirname, "data");
const URLS_FILE = path.join(DATA_DIR, "urls-blog.txt");
const OUT_FILE = path.join(DATA_DIR, "blog.json");

const CONCURRENCY = 5;
const DELAY_MS = 200;
const DEFAULT_LIMIT = 3;

// ── CLI args ──────────────────────────────────────────────────────────────

function getLimit(): number {
  const idx = process.argv.indexOf("--limit");
  if (idx !== -1 && process.argv[idx + 1] !== undefined) {
    const n = parseInt(process.argv[idx + 1], 10);
    if (!isNaN(n)) return n; // 0 = all
  }
  return DEFAULT_LIMIT;
}

// ── Helpers ───────────────────────────────────────────────────────────────

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function readLines(file: string): Promise<string[]> {
  const rl = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
  const lines: string[] = [];
  for await (const line of rl) {
    const trimmed = line.trim();
    if (trimmed) lines.push(trimmed);
  }
  return lines;
}

function clean(text: string | null | undefined): string {
  if (!text) return "";
  return text
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&nbsp;/g, " ").replace(/&#039;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, " ").trim();
}

function resolveUrl(href: string | null | undefined, base: string): string {
  if (!href) return "";
  href = href.trim();
  if (!href || href.startsWith("javascript:")) return "";
  try { return new URL(href, base).href; } catch { return href; }
}

// ── Blog-specific extraction ──────────────────────────────────────────────

interface BlogPost {
  url: string;
  slug: string;
  title: string;
  seoTitle: string;
  metaDescription: string;
  ogImage: string;
  ogTitle: string;
  date: string;
  author: string;
  categories: string[];
  tags: string[];
  featuredImage: string;
  excerpt: string;
  bodyHtml: string;
  bodyText: string;
}

const NOISE_SELECTORS = [
  "nav", "footer", "script", "style", "noscript", "iframe",
  "#hs-eu-cookie-confirmation", "#hubspot-messages-iframe-container",
  ".hs-cookie-notification-position-bottom", ".cookie-banner",
  ".intercom-lightweight-app", "#drift-widget", "#drift-frame-controller",
  "#chat-widget", ".site-nav", ".site-footer", ".navigation",
  ".related-posts", ".post-navigation", ".sidebar", ".comments",
  "[id*='cookie']", "[class*='cookie']", "[class*='chat-widget']",
];

async function extractPost(url: string): Promise<BlogPost> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; SimplerDevelopment-Migration-Bot/1.0)",
      Accept: "text/html,application/xhtml+xml",
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  const dom = new JSDOM(html, { url });
  const doc = dom.window.document;

  const urlObj = new URL(url);
  const pathParts = urlObj.pathname.split("/").filter(Boolean);
  const slug = pathParts[pathParts.length - 1] || "post";

  // ── Meta ────────────────────────────────────────────────────────────────
  const seoTitle = clean(doc.querySelector("title")?.textContent);
  const metaDescription =
    clean(doc.querySelector('meta[name="description"]')?.getAttribute("content")) ||
    clean(doc.querySelector('meta[property="og:description"]')?.getAttribute("content"));
  const ogImage = resolveUrl(doc.querySelector('meta[property="og:image"]')?.getAttribute("content"), url);
  const ogTitle = clean(doc.querySelector('meta[property="og:title"]')?.getAttribute("content"));

  // ── Date ────────────────────────────────────────────────────────────────
  let date = "";
  // 1. meta article:published_time
  date = clean(doc.querySelector('meta[property="article:published_time"]')?.getAttribute("content"));
  // 2. <time> element
  if (!date) {
    const timeEl = doc.querySelector("time");
    date = clean(timeEl?.getAttribute("datetime") || timeEl?.textContent);
  }
  // 3. Visible date patterns in common HubSpot class names
  if (!date) {
    const dateEl = doc.querySelector(".hs-blog-post-date, .post-date, .published-date, .blog-date, [class*='date']");
    date = clean(dateEl?.textContent);
  }

  // ── Author ──────────────────────────────────────────────────────────────
  let author = "";
  author = clean(doc.querySelector('meta[name="author"]')?.getAttribute("content"));
  if (!author) {
    const authorEl = doc.querySelector(
      ".hs-blog-author-name, .author-name, .byline-name, [class*='author'], [rel='author']"
    );
    author = clean(authorEl?.textContent);
  }

  // ── Categories & Tags ────────────────────────────────────────────────────
  const categories: string[] = [];
  const tags: string[] = [];

  // meta article:tag → tags
  doc.querySelectorAll('meta[property="article:tag"]').forEach((m) => {
    const t = clean(m.getAttribute("content"));
    if (t) tags.push(t);
  });

  // Breadcrumb links (typically categories)
  doc.querySelectorAll(".breadcrumb a, [class*='breadcrumb'] a").forEach((a) => {
    const t = clean(a.textContent);
    if (t && t.toLowerCase() !== "home") categories.push(t);
  });

  // Tag links
  doc.querySelectorAll(".post-tags a, .tag-list a, [class*='tag'] a").forEach((a) => {
    const t = clean(a.textContent);
    if (t && !tags.includes(t)) tags.push(t);
  });

  // ── Strip noise AFTER reading meta ───────────────────────────────────────
  NOISE_SELECTORS.forEach((sel) => {
    try { doc.querySelectorAll(sel).forEach((el) => el.remove()); } catch { /**/ }
  });

  const body = doc.body || doc.documentElement;

  // ── Title ───────────────────────────────────────────────────────────────
  const title = clean(body.querySelector("h1")?.textContent) || seoTitle;

  // ── Featured image ───────────────────────────────────────────────────────
  const featuredImage = ogImage ||
    resolveUrl(body.querySelector(".hs-blog-post-header img, .post-hero img, .featured-image img, article img")?.getAttribute("src"), url);

  // ── Locate article container ─────────────────────────────────────────────
  const articleEl =
    body.querySelector("article") ||
    body.querySelector(".hs-blog-post-body, .post-body, .blog-post-body, .entry-content, main") ||
    body;

  // ── Body HTML (clean — strip remaining script/style) ────────────────────
  // Clone to avoid mutating doc
  const clone = articleEl.cloneNode(true) as Element;
  clone.querySelectorAll("script, style, noscript").forEach((el) => el.remove());
  const bodyHtml = clone.innerHTML.replace(/\s+/g, " ").trim();

  // ── Body text ────────────────────────────────────────────────────────────
  const bodyText = clean(clone.textContent);

  // ── Excerpt ─────────────────────────────────────────────────────────────
  const excerpt = metaDescription ||
    clean(body.querySelector(".hs-blog-post-summary, .post-excerpt, .entry-summary")?.textContent) ||
    bodyText.slice(0, 300);

  return {
    url, slug, title, seoTitle, metaDescription, ogImage, ogTitle,
    date, author,
    categories: [...new Set(categories)],
    tags: [...new Set(tags)],
    featuredImage,
    excerpt,
    bodyHtml,
    bodyText,
  };
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
  const limit = getLimit();
  const allUrls = await readLines(URLS_FILE);
  const urls = limit > 0 ? allUrls.slice(0, limit) : allUrls;

  console.log(`\nExtracting ${urls.length} blog posts${limit > 0 ? ` (limit=${limit} of ${allUrls.length})` : " (ALL)"} …\n`);

  const posts: BlogPost[] = [];
  let succeeded = 0;
  const failures: string[] = [];

  for (let i = 0; i < urls.length; i += CONCURRENCY) {
    const batch = urls.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(
      batch.map(async (url, j) => {
        const idx = i + j;
        try {
          const post = await extractPost(url);
          console.log(`  [${idx + 1}/${urls.length}] ✓  ${url}  →  ${post.slug}`);
          succeeded++;
          return post;
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`  [${idx + 1}/${urls.length}] ✗  ${url}  —  ${msg}`);
          failures.push(`${url}: ${msg}`);
          return null;
        }
      })
    );
    posts.push(...(batchResults.filter(Boolean) as BlogPost[]));
    if (i + CONCURRENCY < urls.length) await sleep(DELAY_MS);
  }

  fs.writeFileSync(OUT_FILE, JSON.stringify(posts, null, 2), "utf8");

  console.log(`\n── Summary ──────────────────────────────────────────────`);
  console.log(`  Succeeded : ${succeeded} / ${urls.length}`);
  console.log(`  Failed    : ${failures.length}`);
  failures.forEach((f) => console.error(`    ✗  ${f}`));
  console.log(`  Output    : ${OUT_FILE}`);
  console.log(`────────────────────────────────────────────────────────\n`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
