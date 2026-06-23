/**
 * Directory + person extraction primitives for scraping staff directories.
 *
 * The web is a mess. These extractors err on the side of strictness — better
 * to miss a person than to insert a "Click Here" contact named after a button.
 */
import { JSDOM } from 'jsdom';

// ─── URL discovery ─────────────────────────────────────────────────────────

const KEYWORD_SCORES: Array<{ re: RegExp; score: number }> = [
  // Strong cues
  { re: /\b(?:staff|faculty|employee)\s+directory\b/i, score: 100 },
  { re: /\bdirectory\b/i, score: 60 },
  { re: /\b(?:meet|our)\s+(?:our\s+)?(?:team|staff|faculty|people|leadership)\b/i, score: 55 },
  { re: /\b(?:staff|faculty)\b/i, score: 50 },
  { re: /\b(?:leadership|administration)\b/i, score: 40 },
  { re: /\bpeople\b/i, score: 40 },
  { re: /\bteam\b/i, score: 30 },
  { re: /\bemployees\b/i, score: 35 },
];

const URL_KEYWORD_SCORES: Array<{ re: RegExp; score: number }> = [
  { re: /\/directory\b/i, score: 70 },
  { re: /\/staff(?:\b|\/)/i, score: 55 },
  { re: /\/faculty(?:\b|\/)/i, score: 55 },
  { re: /\/people(?:\b|\/)/i, score: 45 },
  { re: /\/leadership(?:\b|\/)/i, score: 45 },
  { re: /\/team(?:\b|\/)/i, score: 35 },
  { re: /\/employees(?:\b|\/)/i, score: 40 },
  { re: /\/about\/(staff|people|team|leadership|directory|faculty)/i, score: 50 },
];

// Common URL suffixes to try even when not explicitly linked.
export const GUESSED_DIRECTORY_PATHS = [
  '/directory',
  '/directory/',
  '/staff-directory/',
  '/faculty-staff/',
  '/about/staff/',
  '/about/leadership/',
  '/about/people/',
  '/about/our-team/',
  '/leadership/',
  '/people/',
];

export interface DirectoryCandidate {
  url: string;
  score: number;
  reason: string;
}

/**
 * Find candidate directory URLs in homepage HTML. Returns up to N candidates,
 * sorted by descending score.
 */
export function findDirectoryCandidates(
  html: string,
  baseUrl: string,
  limit = 4,
): DirectoryCandidate[] {
  const baseHost = (() => {
    try { return new URL(baseUrl).hostname.toLowerCase(); } catch { return ''; }
  })();
  if (!baseHost) return [];

  const candidates = new Map<string, DirectoryCandidate>();

  const anchorRe = /<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>(.*?)<\/a>/gi;
  for (const m of html.matchAll(anchorRe)) {
    const rawHref = m[1].trim();
    const text = m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (!rawHref || rawHref.startsWith('#') || /^(mailto|tel|javascript):/i.test(rawHref)) continue;

    let url: URL;
    try { url = new URL(rawHref, baseUrl); } catch { continue; }
    const host = url.hostname.toLowerCase();
    // Same registrable domain only (host or *.baseHost).
    if (host !== baseHost && !host.endsWith('.' + baseHost.replace(/^www\./, '')) && !baseHost.endsWith('.' + host.replace(/^www\./, ''))) continue;

    let score = 0;
    const matchedReasons: string[] = [];
    for (const k of KEYWORD_SCORES) if (k.re.test(text)) { score += k.score; matchedReasons.push(`text:${k.re.source}`); }
    for (const k of URL_KEYWORD_SCORES) if (k.re.test(url.pathname)) { score += k.score; matchedReasons.push(`url:${k.re.source}`); }
    if (score === 0) continue;

    // Reject URLs that look like a single news/blog post or individual bio page
    // — typically the deepest path segment is a long hyphen-joined slug.
    const segments = url.pathname.split('/').filter(Boolean);
    if (segments.some((seg) => seg.split('-').length >= 4)) continue;
    // Reject obvious news/blog/event paths
    if (/\/(news|blog|press|events|story|stories|articles?|posts?|tags?|category|categories|archive|\d{4}\/\d{2})\//i.test(url.pathname)) continue;
    if (/\/(news|blog|press|events|story|stories|articles?|posts?)$/i.test(url.pathname)) continue;

    const norm = url.toString().replace(/#.*$/, '');
    const existing = candidates.get(norm);
    if (!existing || score > existing.score) {
      candidates.set(norm, { url: norm, score, reason: matchedReasons.slice(0, 3).join(' | ') });
    }
  }

  return [...candidates.values()].sort((a, b) => b.score - a.score).slice(0, limit);
}

// ─── Person extraction ────────────────────────────────────────────────────

export interface ScrapedContact {
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  title: string | null;
  linkedinUrl: string | null;
  source: 'jsonld' | 'microdata' | 'mailto-card';
}

const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE_RE = /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/;
const LINKEDIN_RE = /https?:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/in\/[A-Za-z0-9_\-%.]+/i;

// Cloudflare email obfuscation: data-cfemail="<hex bytes, first byte = XOR key>"
function decodeCfEmail(hex: string): string | null {
  if (!/^[0-9a-f]{4,}$/i.test(hex)) return null;
  const bytes: number[] = [];
  for (let i = 0; i < hex.length; i += 2) bytes.push(parseInt(hex.substr(i, 2), 16));
  const key = bytes[0];
  const out = bytes.slice(1).map((b) => String.fromCharCode(b ^ key)).join('');
  return /@/.test(out) ? out : null;
}

// Common ASCII obfuscations: " name [at] domain [dot] edu " etc.
function deobfuscateText(s: string): string {
  return s
    .replace(/\s*\[\s*at\s*\]\s*/gi, '@')
    .replace(/\s*\(\s*at\s*\)\s*/gi, '@')
    .replace(/\s+at\s+(?=[a-z0-9-]+\.[a-z]{2,})/gi, '@')
    .replace(/\s*\[\s*dot\s*\]\s*/gi, '.')
    .replace(/\s*\(\s*dot\s*\)\s*/gi, '.');
}

// Words that indicate the string is a job title / nav link / section heading,
// not a person name. Checked against the first 1-2 tokens of the candidate.
const NON_NAME_TOKENS = new Set([
  // Roles / titles
  'staff', 'faculty', 'student', 'students', 'admissions', 'admission',
  'director', 'coordinator', 'chair', 'dean', 'president', 'vice', 'provost',
  'manager', 'specialist', 'assistant', 'associate', 'professor', 'instructor',
  // Org units / sections
  'office', 'department', 'committee', 'team', 'board', 'campus', 'library',
  'headquarters', 'school', 'college', 'university', 'institute', 'center',
  'centre', 'division', 'unit', 'lab', 'laboratory', 'program', 'council',
  'league', 'association', 'alumni', 'alumnae', 'alumna', 'society', 'mission',
  // Nav / page-chrome / generic words
  'our', 'jump', 'skip', 'menu', 'more', 'view', 'learn', 'read', 'click',
  'contact', 'about', 'home', 'search', 'login', 'register', 'apply',
  'main', 'navigation', 'content', 'open', 'close', 'toggle', 'undefined',
  'welcome', 'overview', 'meet', 'see', 'find', 'explore', 'visit',
]);

// Local-parts that indicate a shared department mailbox, not an individual.
const DEPARTMENTAL_LOCAL_PARTS = new Set([
  'info', 'contact', 'admissions', 'admission', 'support', 'help', 'helpdesk',
  'office', 'main', 'general', 'enquiries', 'inquiries', 'sales', 'marketing',
  'press', 'media', 'pr', 'webmaster', 'postmaster', 'noreply', 'no-reply',
  'donotreply', 'do-not-reply', 'jobs', 'careers', 'hr', 'humanresources',
  'recruiting', 'library', 'it', 'itsupport', 'finaid', 'financialaid',
  'registrar', 'bursar', 'alumni', 'development', 'advancement',
  'communications', 'comms', 'security', 'parking', 'admit', 'apply',
  'undergraduate', 'graduate', 'enroll', 'enrollment',
]);

function isDepartmentalEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const local = email.toLowerCase().split('@')[0];
  if (DEPARTMENTAL_LOCAL_PARTS.has(local)) return true;
  // Catch hyphen/underscore variants like "alumni-relations", "it_support"
  const head = local.split(/[-_.]/)[0];
  return DEPARTMENTAL_LOCAL_PARTS.has(head);
}

function nameLooksReal(name: string): boolean {
  const trimmed = name.trim();
  if (trimmed.length < 4 || trimmed.length > 80) return false;
  // Reject common non-name link text.
  if (/^(read more|learn more|click here|view profile|contact|home|menu|more info|view bio|see all|see more|jump (to )?content|skip (to |navigation))$/i.test(trimmed)) return false;
  // Must have at least one space (first + last) OR be a "Last, First" form.
  if (!/\s/.test(trimmed) && !trimmed.includes(',')) return false;
  // Must be mostly letters / hyphens / apostrophes / commas / periods / spaces.
  if (!/^[A-Za-z][A-Za-z'\-., ]+$/.test(trimmed)) return false;
  // Reject all-caps section headings, e.g. "FACULTY DIRECTORY".
  if (trimmed === trimmed.toUpperCase() && trimmed.length > 20) return false;
  // Reject if any of the first two whitespace tokens is a job-title noun.
  // (handles "Staff Chair", "Office of …", "Jump Content", "Vice President")
  const tokens = trimmed.toLowerCase().replace(/[.,]/g, '').split(/\s+/).slice(0, 2);
  if (tokens.some((t) => NON_NAME_TOKENS.has(t))) return false;
  return true;
}

function splitName(raw: string): { firstName: string; lastName: string | null } | null {
  const HONORIFIC_RE = /^(Mr|Mrs|Ms|Mx|Dr|Prof|Professor|Rev|Reverend|Hon|Sr|Br)\.?\s+/i;
  // Comprehensive credential alternation. Any of these as a token after a comma
  // OR as a leading prefix is treated as a degree/post-nominal, not a name.
  const CREDENTIALS = [
    // Doctorate
    'Ph\\.?D\\.?', 'Ed\\.?D\\.?', 'Th\\.?D\\.?', 'Sc\\.?D\\.?', 'Pharm\\.?D\\.?',
    'D\\.?D\\.?S\\.?', 'D\\.?V\\.?M\\.?', 'D\\.?P\\.?T\\.?', 'D\\.?B\\.?A\\.?',
    'D\\.?Sc\\.?', 'D\\.?M\\.?A\\.?', 'D\\.?M\\.?D\\.?', 'D\\.?Min\\.?',
    'D\\.?N\\.?P\\.?', 'D\\.?Phil\\.?', 'D\\.?P\\.?A\\.?', 'D\\.?O\\.?',
    'D\\.?D\\.?', 'D\\.?S\\.?W\\.?', 'LL\\.?D\\.?', 'LL\\.?B\\.?', 'LL\\.?M\\.?',
    // Professional
    'M\\.?D\\.?', 'J\\.?D\\.?', 'Esq\\.?',
    // Masters
    'M\\.?B\\.?A\\.?', 'M\\.?A\\.?T\\.?', 'M\\.?P\\.?A\\.?', 'M\\.?P\\.?P\\.?',
    'M\\.?P\\.?H\\.?', 'M\\.?S\\.?W\\.?', 'M\\.?Sc\\.?', 'M\\.?Phil\\.?',
    'M\\.?Th\\.?', 'M\\.?Eng\\.?', 'M\\.?Div\\.?', 'M\\.?Ed\\.?',
    'M\\.?F\\.?A\\.?', 'M\\.?M\\.?', 'M\\.?Mus\\.?',
    'M\\.?A\\.?', 'M\\.?S\\.?',
    // Bachelors
    'B\\.?B\\.?A\\.?', 'B\\.?F\\.?A\\.?', 'B\\.?Sc\\.?', 'B\\.?Th\\.?',
    'B\\.?Ed\\.?', 'B\\.?A\\.?', 'B\\.?S\\.?',
    // Common all-caps (no dots)
    'MBA', 'MAT', 'BBA', 'PhD', 'JD', 'DDS', 'DVM', 'DPT', 'DSW',
    'MSW', 'MPH', 'MFA', 'MEd', 'MPA', 'MPP', 'BSN', 'MSN', 'MFT',
    // Other professional
    'C\\.?P\\.?A\\.?', 'R\\.?N\\.?', 'P\\.?E\\.?', 'A\\.?P\\.?R\\.?N\\.?',
    'L\\.?C\\.?S\\.?W\\.?', 'L\\.?M\\.?H\\.?C\\.?', 'L\\.?P\\.?C\\.?',
    'CPA', 'RN', 'PE', 'APRN', 'LCSW', 'LMHC', 'LPC', 'PMP', 'CFA',
  ];
  const CRED_PATTERN = `(?:${CREDENTIALS.join('|')})`;
  const DEGREE_PREFIX_RE = new RegExp(`^${CRED_PATTERN}(?:,?\\s+)`, 'i');
  // Trailing: requires a leading [\s,] so we don't eat the trailing letters of
  // a surname like "Williams" → "Willia" via the "MS" alternation.
  const DEGREE_SUFFIX_RE = new RegExp(`[\\s,]${CRED_PATTERN}(?:[\\s,]+${CRED_PATTERN})*\\.?\\s*$`, 'i');

  let cleaned = raw.replace(/\s+/g, ' ').trim();
  // Strip leading honorifics (may chain: "Dr. Mr. Foo")
  for (let i = 0; i < 2; i++) cleaned = cleaned.replace(HONORIFIC_RE, '');
  // Strip leading degree(s) — may chain: "Ph.D., M.D. Jane Doe"
  for (let i = 0; i < 3; i++) cleaned = cleaned.replace(DEGREE_PREFIX_RE, '');
  // Strip trailing degree(s) — may chain: "Smith, Ph.D., M.B.A."
  // Iterate so we collapse chains conservatively.
  let prev = '';
  while (cleaned !== prev) { prev = cleaned; cleaned = cleaned.replace(DEGREE_SUFFIX_RE, '').trim(); }

  // "Last, First Middle" form
  if (cleaned.includes(',')) {
    const [last, first] = cleaned.split(',').map((s) => s.trim());
    if (!first) return null;
    const firstTrim = first.split(/\s+/)[0];
    return { firstName: firstTrim, lastName: last || null };
  }
  const parts = cleaned.split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: null };
  return { firstName: parts[0], lastName: parts[parts.length - 1] };
}

function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  if (digits.length === 11 && digits[0] === '1') return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  return null;
}

function dedupeKey(c: { firstName: string; lastName: string | null; email: string | null }): string {
  if (c.email) return `email:${c.email.toLowerCase()}`;
  return `name:${(c.firstName + ' ' + (c.lastName ?? '')).toLowerCase().trim()}`;
}

/**
 * Extract structured contact entries from the given directory HTML.
 *
 * Tried strategies in order of confidence:
 *   1. JSON-LD <script type="application/ld+json"> Person entities.
 *   2. Schema.org Microdata (itemtype Person).
 *   3. Heuristic: for each mailto: link, walk up to a card container and
 *      scrape adjacent name/title/phone/linkedin text.
 */
export function extractContacts(html: string, baseUrl: string): ScrapedContact[] {
  const dom = new JSDOM(html, { url: baseUrl });
  const doc = dom.window.document;

  const seen = new Map<string, ScrapedContact>();
  const add = (c: ScrapedContact | null) => {
    if (!c) return;
    if (!nameLooksReal(`${c.firstName} ${c.lastName ?? ''}`)) return;
    // Drop departmental mailboxes (info@, contact@, library@, …) — these get
    // matched against page-section headings rather than real people.
    if (isDepartmentalEmail(c.email)) return;
    const key = dedupeKey(c);
    const prior = seen.get(key);
    if (!prior) { seen.set(key, c); return; }
    // Merge — prefer non-null values from richer source.
    const ranks = { jsonld: 3, microdata: 2, 'mailto-card': 1 } as const;
    const winner = ranks[c.source] > ranks[prior.source] ? c : prior;
    const loser = winner === c ? prior : c;
    seen.set(key, {
      firstName: winner.firstName,
      lastName: winner.lastName ?? loser.lastName,
      email: winner.email ?? loser.email,
      phone: winner.phone ?? loser.phone,
      title: winner.title ?? loser.title,
      linkedinUrl: winner.linkedinUrl ?? loser.linkedinUrl,
      source: winner.source,
    });
  };

  // 1. JSON-LD
  for (const script of doc.querySelectorAll('script[type="application/ld+json"]')) {
    let data: unknown;
    try { data = JSON.parse(script.textContent || ''); } catch { continue; }
    const items = Array.isArray(data) ? data : [data];
    const flat: unknown[] = [];
    const walk = (node: unknown) => {
      if (!node || typeof node !== 'object') return;
      flat.push(node);
      const obj = node as Record<string, unknown>;
      const graph = obj['@graph'];
      if (Array.isArray(graph)) for (const g of graph) walk(g);
    };
    for (const i of items) walk(i);
    for (const node of flat) {
      const obj = node as Record<string, unknown>;
      const t = obj['@type'];
      const types = Array.isArray(t) ? t : [t];
      if (!types.some((x) => typeof x === 'string' && /Person/i.test(x))) continue;
      const nameRaw = typeof obj.name === 'string' ? obj.name : null;
      if (!nameRaw) continue;
      const split = splitName(nameRaw);
      if (!split) continue;
      const sameAs = Array.isArray(obj.sameAs) ? obj.sameAs : (typeof obj.sameAs === 'string' ? [obj.sameAs] : []);
      const linkedin = sameAs.find((s) => typeof s === 'string' && /linkedin\.com\/in\//i.test(s)) as string | undefined;
      add({
        firstName: split.firstName,
        lastName: split.lastName,
        email: typeof obj.email === 'string' ? obj.email.replace(/^mailto:/i, '').trim().toLowerCase() : null,
        phone: typeof obj.telephone === 'string' ? normalizePhone(obj.telephone) : null,
        title: typeof obj.jobTitle === 'string' ? obj.jobTitle.trim() : null,
        linkedinUrl: linkedin ?? null,
        source: 'jsonld',
      });
    }
  }

  // 2. Microdata
  for (const el of doc.querySelectorAll('[itemtype$="schema.org/Person"], [itemtype$="/Person"]')) {
    const propText = (prop: string) => {
      const e = el.querySelector(`[itemprop="${prop}"]`);
      if (!e) return null;
      const v = e.getAttribute('content') || e.textContent;
      return v ? v.trim() : null;
    };
    const nameRaw = propText('name');
    if (!nameRaw) continue;
    const split = splitName(nameRaw);
    if (!split) continue;
    const linkedinEl = el.querySelector('a[href*="linkedin.com/in/"]');
    add({
      firstName: split.firstName,
      lastName: split.lastName,
      email: propText('email'),
      phone: (() => { const p = propText('telephone'); return p ? normalizePhone(p) : null; })(),
      title: propText('jobTitle') ?? propText('title'),
      linkedinUrl: linkedinEl ? linkedinEl.getAttribute('href') : null,
      source: 'microdata',
    });
  }

  // 3. Heuristic: anchor extraction around mailto: links + Cloudflare-protected emails.
  const cardCandidates = new Set<Element>();
  // mailto links
  for (const a of doc.querySelectorAll('a[href^="mailto:"]')) {
    const card = closestCard(a);
    if (card) cardCandidates.add(card);
  }
  // cloudflare-protected emails
  for (const a of doc.querySelectorAll('a.__cf_email__, [data-cfemail]')) {
    const card = closestCard(a);
    if (card) cardCandidates.add(card);
  }

  for (const card of cardCandidates) {
    const fullText = (card.textContent || '').replace(/\s+/g, ' ').trim();
    if (fullText.length < 10) continue;

    // Email
    let email: string | null = null;
    const mailto = card.querySelector('a[href^="mailto:"]');
    if (mailto) {
      const href = mailto.getAttribute('href') || '';
      email = href.replace(/^mailto:/i, '').split('?')[0].trim().toLowerCase();
    }
    if (!email) {
      const cf = card.querySelector('[data-cfemail]');
      if (cf) {
        const decoded = decodeCfEmail(cf.getAttribute('data-cfemail') || '');
        if (decoded) email = decoded.toLowerCase();
      }
    }
    if (!email) {
      const deob = deobfuscateText(fullText);
      const m = deob.match(EMAIL_RE);
      if (m) email = m[0].toLowerCase();
    }

    // Name — try heading first, then mailto link text, then bold/strong.
    let nameRaw: string | null = null;
    const heading = card.querySelector('h1, h2, h3, h4, h5, h6, .name, [class*="name"]');
    if (heading && heading.textContent) {
      const h = heading.textContent.replace(/\s+/g, ' ').trim();
      if (nameLooksReal(h)) nameRaw = h;
    }
    if (!nameRaw && mailto && mailto.textContent) {
      const t = mailto.textContent.replace(/\s+/g, ' ').trim();
      if (nameLooksReal(t)) nameRaw = t;
    }
    if (!nameRaw) {
      const strong = card.querySelector('strong, b');
      if (strong && strong.textContent) {
        const s = strong.textContent.replace(/\s+/g, ' ').trim();
        if (nameLooksReal(s)) nameRaw = s;
      }
    }
    if (!nameRaw) continue;

    const split = splitName(nameRaw);
    if (!split) continue;

    // Title — element with class containing title/position/role, OR the line
    // immediately after the heading.
    let title: string | null = null;
    const titleEl = card.querySelector('[class*="title"], [class*="position"], [class*="role"], [class*="job"]');
    if (titleEl && titleEl.textContent && titleEl !== heading) {
      const t = titleEl.textContent.replace(/\s+/g, ' ').trim();
      if (t.length > 0 && t.length < 120 && t !== nameRaw) title = t;
    }
    if (!title && heading) {
      // Next sibling element's text as title fallback.
      let sib = heading.nextElementSibling;
      while (sib && sib.tagName === 'BR') sib = sib.nextElementSibling;
      if (sib && sib.textContent) {
        const t = sib.textContent.replace(/\s+/g, ' ').trim();
        if (t && t.length < 120 && t !== nameRaw && !/@/.test(t) && !PHONE_RE.test(t)) title = t;
      }
    }

    // Phone
    const phoneAnchor = card.querySelector('a[href^="tel:"]');
    let phone: string | null = null;
    if (phoneAnchor) {
      const href = phoneAnchor.getAttribute('href') || '';
      phone = normalizePhone(href.replace(/^tel:/i, ''));
    }
    if (!phone) {
      const m = fullText.match(PHONE_RE);
      if (m) phone = normalizePhone(m[0]);
    }

    // LinkedIn
    const liEl = card.querySelector('a[href*="linkedin.com/in/"]');
    const linkedinUrl = liEl ? (liEl.getAttribute('href') || '').match(LINKEDIN_RE)?.[0] ?? null : null;

    add({
      firstName: split.firstName,
      lastName: split.lastName,
      email,
      phone,
      title,
      linkedinUrl,
      source: 'mailto-card',
    });
  }

  return [...seen.values()];
}

/**
 * Walk up from a contact-bearing element to find a "card" container — the
 * smallest ancestor that looks like a person row (has multiple children, a
 * heading, and isn't the whole page).
 */
function closestCard(el: Element): Element | null {
  let cur: Element | null = el;
  for (let i = 0; i < 7 && cur; i++) {
    const parent: Element | null = cur.parentElement;
    if (!parent) break;
    // Stop walking up if we'd hit a top-level layout container.
    if (['BODY', 'MAIN', 'ARTICLE', 'SECTION'].includes(parent.tagName) && i > 1) return cur;
    // A "card" typically has 2+ children and contains a heading.
    if (cur.children.length >= 2 && cur.querySelector('h1, h2, h3, h4, h5, h6, strong, b, .name')) return cur;
    cur = parent;
  }
  return cur;
}
