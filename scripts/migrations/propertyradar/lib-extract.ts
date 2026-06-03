/**
 * lib-extract.ts
 * Shared extraction helper for PropertyRadar migration scripts.
 * Fetches a URL, parses with jsdom, strips noise, returns structured content.
 */

import { JSDOM } from "jsdom";

const BASE = "https://www.propertyradar.com";

// ── Types ──────────────────────────────────────────────────────────────────

export interface Heading {
  level: number;
  text: string;
}

export interface Section {
  heading: string;
  level: number;
  paragraphs: string[];
  bullets: string[];
  images: { src: string; alt: string }[];
  ctas: { text: string; href: string }[];
  stats: { value: string; label: string }[];
}

export interface ExtractedPage {
  url: string;
  slug: string;
  title: string;
  seoTitle: string;
  metaDescription: string;
  ogImage: string;
  ogTitle: string;
  headings: Heading[];
  sections: Section[];
  paragraphs: string[];
  images: { src: string; alt: string }[];
  bgImages: string[];
  ctas: { text: string; href: string }[];
  links: { text: string; href: string }[];
}

// ── Utilities ─────────────────────────────────────────────────────────────

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

function clean(text: string | null | undefined): string {
  if (!text) return "";
  return decodeEntities(text.replace(/\s+/g, " ").trim());
}

function resolveUrl(href: string | null | undefined): string {
  if (!href) return "";
  href = href.trim();
  if (!href || href.startsWith("javascript:") || href.startsWith("mailto:") || href.startsWith("tel:")) return href;
  try {
    return new URL(href, BASE).href;
  } catch {
    return href;
  }
}

function isInternal(href: string): boolean {
  try {
    const u = new URL(href);
    return u.hostname === "www.propertyradar.com" || u.hostname === "propertyradar.com";
  } catch {
    return false;
  }
}

function looksLikeButton(el: Element): boolean {
  const cls = (el.getAttribute("class") || "").toLowerCase();
  return /\b(btn|button|cta|hs-cta|hs-button|call-to-action)\b/.test(cls);
}

/** Stats heuristic: text matching currency/number pattern */
const STAT_VALUE_RE = /^[\$€£]?[\d][\d.,]*[BMKbmk%+x\s]*$/;

function extractStats(el: Element): { value: string; label: string }[] {
  const stats: { value: string; label: string }[] = [];
  try {
    // Look for elements containing a large number-like text paired with a sibling label
    const candidates = el.querySelectorAll("*");
    candidates.forEach((node) => {
      try {
        if (node.children.length > 0) return; // leaf nodes only
        const t = clean(node.textContent);
        if (STAT_VALUE_RE.test(t) && t.length < 20) {
          // look for a sibling or parent's next text child as the label
          const next = node.nextElementSibling;
          const label = next ? clean(next.textContent) : "";
          if (label && label.length > 1 && label.length < 120) {
            stats.push({ value: t, label });
          }
        }
      } catch {
        // skip bad element
      }
    });
  } catch {
    // ignore
  }
  return stats;
}

// ── Noise removal ─────────────────────────────────────────────────────────

const NOISE_SELECTORS = [
  "nav",
  "footer",
  "script",
  "style",
  "noscript",
  "iframe",
  // Cookie / chat widgets
  "#hs-eu-cookie-confirmation",
  "#hubspot-messages-iframe-container",
  ".hs-cookie-notification-position-bottom",
  "#cookieChoiceInfo",
  ".cookie-banner",
  ".cookie-notice",
  ".intercom-lightweight-app",
  "#drift-widget",
  "#drift-frame-controller",
  "#chat-widget",
  ".chat-widget",
  "#livechat-compact-container",
  // HubSpot global nav / footer wrappers
  ".hs-nav",
  ".hs-footer",
  ".navigation",
  ".site-nav",
  ".site-footer",
  // Generic utility
  ".sr-only",
  "[aria-hidden=true]",
  ".skip-to-content",
];

function stripNoise(doc: Document): void {
  NOISE_SELECTORS.forEach((sel) => {
    try {
      doc.querySelectorAll(sel).forEach((el) => el.remove());
    } catch {
      // bad selector on some envs — skip
    }
  });
}

// ── bg-image extraction ───────────────────────────────────────────────────

function extractBgImages(el: Element): string[] {
  const result: string[] = [];
  try {
    el.querySelectorAll("[style]").forEach((node) => {
      try {
        const style = node.getAttribute("style") || "";
        const match = style.match(/background(?:-image)?\s*:\s*url\(['"]?([^'")\s]+)['"]?\)/i);
        if (match?.[1]) {
          result.push(resolveUrl(match[1]));
        }
      } catch {
        // skip
      }
    });
  } catch {
    // ignore
  }
  return [...new Set(result)].filter(Boolean);
}

// ── Section grouping ─────────────────────────────────────────────────────

function groupSections(body: Element): Section[] {
  const sections: Section[] = [];
  let current: Section | null = null;

  function flush() {
    if (current) sections.push(current);
    current = null;
  }

  function newSection(heading: string, level: number) {
    flush();
    current = { heading, level, paragraphs: [], bullets: [], images: [], ctas: [], stats: [] };
  }

  // Walk all children of body depth-1 for section boundaries
  // Use TreeWalker to walk all block-level elements in order
  const walker = body.ownerDocument!.createTreeWalker(
    body,
    // NodeFilter.SHOW_ELEMENT = 1
    1,
    null
  );

  let node = walker.nextNode() as Element | null;
  while (node) {
    try {
      const tag = node.tagName?.toLowerCase();

      if (["h1", "h2", "h3"].includes(tag)) {
        const level = parseInt(tag[1]);
        const text = clean(node.textContent);
        if (text) newSection(text, level);
      } else if (tag === "p") {
        const t = clean(node.textContent);
        if (t && t.length > 2) {
          if (!current) newSection("", 0);
          current!.paragraphs.push(t);
        }
      } else if (["ul", "ol"].includes(tag)) {
        if (!current) newSection("", 0);
        node.querySelectorAll("li").forEach((li) => {
          const t = clean(li.textContent);
          if (t) current!.bullets.push(t);
        });
      } else if (tag === "img") {
        const src = resolveUrl(node.getAttribute("src"));
        const alt = clean(node.getAttribute("alt"));
        if (src) {
          if (!current) newSection("", 0);
          current!.images.push({ src, alt });
        }
      } else if (tag === "a") {
        const href = resolveUrl(node.getAttribute("href"));
        const text = clean(node.textContent);
        if (href && text && looksLikeButton(node)) {
          if (!current) newSection("", 0);
          current!.ctas.push({ text, href });
        }
      }

      // Extract stats from any element
      if (current && node.children.length === 0) {
        const t = clean(node.textContent);
        if (STAT_VALUE_RE.test(t) && t.length < 20) {
          const next = node.nextElementSibling;
          const label = next ? clean(next.textContent) : "";
          if (label && label.length > 1 && label.length < 120) {
            current!.stats.push({ value: t, label });
          }
        }
      }
    } catch {
      // skip bad node
    }
    node = walker.nextNode() as Element | null;
  }

  flush();
  return sections;
}

// ── Main extractPage ──────────────────────────────────────────────────────

export async function extractPage(url: string): Promise<ExtractedPage> {
  // Derive slug
  const urlObj = new URL(url);
  const pathParts = urlObj.pathname.split("/").filter(Boolean);
  const slug = pathParts[pathParts.length - 1] || "home";

  // Fetch
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; SimplerDevelopment-Migration-Bot/1.0; +https://simplerdevelopment.com)",
      Accept: "text/html,application/xhtml+xml",
    },
    signal: AbortSignal.timeout(20_000),
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }

  const html = await res.text();
  const dom = new JSDOM(html, { url });
  const doc = dom.window.document;

  // ── Meta ────────────────────────────────────────────────────────────────
  const seoTitle = clean(doc.querySelector("title")?.textContent);
  const metaDescription =
    clean(doc.querySelector('meta[name="description"]')?.getAttribute("content")) ||
    clean(doc.querySelector('meta[property="og:description"]')?.getAttribute("content"));
  const ogImage = resolveUrl(doc.querySelector('meta[property="og:image"]')?.getAttribute("content"));
  const ogTitle = clean(doc.querySelector('meta[property="og:title"]')?.getAttribute("content"));

  // Strip noise AFTER reading meta (meta is in <head> — not removed, but be safe)
  stripNoise(doc);

  const body = doc.body || doc.documentElement;

  // ── Title ───────────────────────────────────────────────────────────────
  const firstH1 = clean(body.querySelector("h1")?.textContent);
  const title = firstH1 || seoTitle;

  // ── Headings ────────────────────────────────────────────────────────────
  const headings: Heading[] = [];
  body.querySelectorAll("h1, h2, h3").forEach((h) => {
    try {
      const text = clean(h.textContent);
      if (text) headings.push({ level: parseInt(h.tagName[1]), text });
    } catch {
      // skip
    }
  });

  // ── Paragraphs (flat, deduped) ───────────────────────────────────────────
  const paragraphSet = new Set<string>();
  body.querySelectorAll("p").forEach((p) => {
    try {
      const t = clean(p.textContent);
      if (t && t.length > 2) paragraphSet.add(t);
    } catch {
      // skip
    }
  });
  const paragraphs = [...paragraphSet];

  // ── Images ──────────────────────────────────────────────────────────────
  const imageSet = new Map<string, string>(); // src → alt
  body.querySelectorAll("img").forEach((img) => {
    try {
      const src = resolveUrl(img.getAttribute("src"));
      if (src && !src.startsWith("data:")) {
        const alt = clean(img.getAttribute("alt"));
        imageSet.set(src, alt);
      }
    } catch {
      // skip
    }
  });
  const images = [...imageSet.entries()].map(([src, alt]) => ({ src, alt }));

  // ── Background images ────────────────────────────────────────────────────
  const bgImages = extractBgImages(body);

  // ── CTAs (buttons / cta-classed links) ──────────────────────────────────
  const ctaSet = new Map<string, string>(); // href → text
  body.querySelectorAll("a").forEach((a) => {
    try {
      if (looksLikeButton(a)) {
        const href = resolveUrl(a.getAttribute("href"));
        const text = clean(a.textContent);
        if (href && text) ctaSet.set(href, text);
      }
    } catch {
      // skip
    }
  });
  const ctas = [...ctaSet.entries()].map(([href, text]) => ({ text, href }));

  // ── Internal links ───────────────────────────────────────────────────────
  const linkMap = new Map<string, string>(); // href → text
  body.querySelectorAll("a[href]").forEach((a) => {
    try {
      const href = resolveUrl(a.getAttribute("href"));
      if (href && isInternal(href)) {
        const text = clean(a.textContent);
        if (text) linkMap.set(href, text);
      }
    } catch {
      // skip
    }
  });
  const links = [...linkMap.entries()].map(([href, text]) => ({ text, href }));

  // ── Sections ─────────────────────────────────────────────────────────────
  const sections = groupSections(body);

  return {
    url,
    slug,
    title,
    seoTitle,
    metaDescription,
    ogImage,
    ogTitle,
    headings,
    sections,
    paragraphs,
    images,
    bgImages,
    ctas,
    links,
  };
}
