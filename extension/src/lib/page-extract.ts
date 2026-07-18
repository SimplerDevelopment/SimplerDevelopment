// Tiny Readability-lite extractor. Runs inside the content script's isolated
// world. Returns clean text, raw HTML of the chosen container, current
// selection, and a coarse page-kind heuristic.

import type { ExtractedPage, PageKind } from './messages';

const MAX_TEXT_CHARS = 50_000;

const STRIP_TAGS = ['script', 'style', 'noscript', 'iframe', 'svg'];
const STRIP_ROLES = ['nav', 'aside', 'footer', 'header', 'banner', 'contentinfo'];

function detectPageKind(url: URL, doc: Document): PageKind {
  const host = url.hostname.toLowerCase();
  const path = url.pathname.toLowerCase();
  if (host.endsWith('linkedin.com') && /^\/in\//.test(path)) return 'person';
  if ((host === 'x.com' || host === 'twitter.com') && /^\/[^/]+\/?$/.test(path)) {
    return 'person';
  }
  // microdata / itemtype Person
  const personMicro = doc.querySelector(
    'h1[itemtype*="schema.org/Person"], [itemtype*="schema.org/Person"] h1'
  );
  if (personMicro) return 'person';

  const ogType = doc
    .querySelector('meta[property="og:type"]')
    ?.getAttribute('content')
    ?.toLowerCase();
  const titleTokens = (doc.title || '').toLowerCase().split(/[\s\-|·:•]+/).filter(Boolean);
  if (
    ogType === 'website' &&
    titleTokens.some((t) => host.replace(/^www\./, '').startsWith(t))
  ) {
    return 'company';
  }
  return 'article';
}

function pickRoot(doc: Document): Element {
  const candidates: (Element | null)[] = [
    doc.querySelector('main'),
    doc.querySelector('article'),
    doc.querySelector('[role="main"]'),
  ];
  for (const c of candidates) {
    if (c && c.textContent && c.textContent.trim().length > 200) return c;
  }
  return doc.body;
}

function cloneAndStrip(root: Element): HTMLElement {
  const clone = root.cloneNode(true) as HTMLElement;

  STRIP_TAGS.forEach((t) => clone.querySelectorAll(t).forEach((n) => n.remove()));
  STRIP_ROLES.forEach((r) => clone.querySelectorAll(r).forEach((n) => n.remove()));
  // role-based
  clone
    .querySelectorAll('[role="navigation"],[role="banner"],[role="contentinfo"],[aria-hidden="true"]')
    .forEach((n) => n.remove());
  // hidden
  clone.querySelectorAll<HTMLElement>('*').forEach((el) => {
    if (el.hasAttribute('hidden')) el.remove();
  });

  return clone;
}

function collapseWhitespace(s: string): string {
  return s.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

export function extractPage(): ExtractedPage {
  const url = new URL(location.href);
  const root = pickRoot(document);
  const cleaned = cloneAndStrip(root);

  let text = (cleaned.innerText || cleaned.textContent || '').toString();
  text = collapseWhitespace(text);
  if (text.length > MAX_TEXT_CHARS) text = text.slice(0, MAX_TEXT_CHARS);

  const html = cleaned.innerHTML.length > 80_000
    ? cleaned.innerHTML.slice(0, 80_000)
    : cleaned.innerHTML;

  const sel = window.getSelection();
  const selection = sel ? collapseWhitespace(sel.toString()) : '';

  return {
    url: location.href,
    title: document.title || '',
    text,
    html,
    selection,
    pageKind: detectPageKind(url, document),
  };
}

export function getSelection(): { selection: string } {
  const sel = window.getSelection();
  return { selection: sel ? collapseWhitespace(sel.toString()) : '' };
}
