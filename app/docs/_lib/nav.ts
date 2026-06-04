import fs from 'fs/promises';
import path from 'path';

// Root of the committed markdown content that this route renders.
export const DOCS_ROOT = path.join(process.cwd(), 'docs');

export type NavItem = { label: string; slug: string }; // slug is route-relative to /docs ('' = index)
export type NavGroup = { label: string | null; items: NavItem[] };

/**
 * The sidebar. Slugs map 1:1 to markdown files under docs/ (see resolveDoc).
 * Order here is the order shown in the sidebar.
 */
export const NAV: NavGroup[] = [
  { label: null, items: [{ label: 'Overview', slug: '' }] },
  {
    label: 'REST API (v1)',
    items: [
      { label: 'Choose your API', slug: 'api' },
      { label: 'Authentication', slug: 'api/authentication' },
      { label: 'CMS Content', slug: 'api/cms-content' },
      { label: 'Media', slug: 'api/media' },
      { label: 'Blocks', slug: 'api/blocks' },
      { label: 'Commerce', slug: 'api/commerce' },
      { label: 'Site Configuration', slug: 'api/site-config' },
    ],
  },
  {
    label: 'Public API',
    items: [
      { label: 'Booking & Gift Certificates', slug: 'api/booking' },
      { label: 'Live Chat', slug: 'api/chat' },
      { label: 'Public Content & A/B', slug: 'api/public-content' },
    ],
  },
  {
    label: 'MCP (AI Agent) API',
    items: [
      { label: 'Connect an AI Agent', slug: 'mcp' },
      { label: 'MCP Overview', slug: 'api/mcp/overview' },
      { label: 'Content & Storefront', slug: 'api/mcp/content-tools' },
      { label: 'CRM, Services & Tickets', slug: 'api/mcp/crm-tools' },
      { label: 'Email, Surveys & Decks', slug: 'api/mcp/marketing-tools' },
      { label: 'Projects, Sprints & Kanban', slug: 'api/mcp/project-tools' },
      { label: 'Company Brain', slug: 'api/mcp/brain-tools' },
      { label: 'Bookings, Integrations & Billing', slug: 'api/mcp/platform-tools' },
    ],
  },
];

/** Every routable slug, flattened — drives generateStaticParams. */
export const ALL_SLUGS: string[] = NAV.flatMap((g) => g.items.map((i) => i.slug));

/** Turn a route slug string into the params array Next expects ('' -> []). */
export function slugToParam(slug: string): string[] {
  return slug ? slug.split('/') : [];
}

/** GitHub-ish slugify — kept identical between heading ids and the TOC so anchors line up. */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Strip inline markdown (code/bold/italic/links) down to plain text for the TOC. */
function cleanInline(s: string): string {
  return s
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .trim();
}

export type TocEntry = { depth: 2 | 3; text: string; id: string };

/** Pull h2/h3 headings out of raw markdown (ignoring fenced code) for the "On this page" rail. */
export function extractToc(markdown: string): TocEntry[] {
  const out: TocEntry[] = [];
  let inFence = false;
  for (const line of markdown.split('\n')) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = /^(#{2,3})\s+(.+?)\s*#*\s*$/.exec(line);
    if (!m) continue;
    const text = cleanInline(m[2]);
    if (!text) continue;
    out.push({ depth: m[1].length as 2 | 3, text, id: slugify(text) });
  }
  return out;
}

/** Resolve a route slug to its markdown file + the doc's directory (relative to docs/, for link rewriting). */
export async function resolveDoc(
  slugArr: string[],
): Promise<{ filePath: string; docDir: string } | null> {
  const slug = slugArr.join('/');
  if (!slug) return { filePath: path.join(DOCS_ROOT, 'index.md'), docDir: '' };

  const direct = path.join(DOCS_ROOT, `${slug}.md`);
  if (await exists(direct)) {
    return { filePath: direct, docDir: path.posix.dirname(slug) === '.' ? '' : path.posix.dirname(slug) };
  }
  const indexFile = path.join(DOCS_ROOT, slug, 'README.md');
  if (await exists(indexFile)) return { filePath: indexFile, docDir: slug };

  return null;
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}
