import { getClientSiteNavItemsCached } from '@/lib/site-data-cache';
import type { NavItem } from '@/lib/actions/client-sites';

interface BlockLike {
  type?: string;
  initialItems?: NavItem[];
  blocks?: BlockLike[];
  columns?: Array<{ blocks?: BlockLike[] }>;
}

// Walk the block tree, find every `navigation` block, and attach the site's
// live nav tree as `initialItems` so it's part of the initial server-rendered
// response — mirrors prefetchHtmlEmbeds's mutate-in-place-then-restringify
// shape (see prefetch-embeds.ts). Before this, NavigationBlockRender rendered
// a skeleton and fetched client-side on every page load, which was the
// dominant CLS source on the IntegraTouch site (ITM-016) and kept nav links
// out of the SSR HTML entirely (SEO). Failures leave `initialItems` unset so
// the renderer falls back to its client fetch.
export async function prefetchNavigationData(siteId: number, content: string): Promise<string> {
  let parsed: { blocks?: BlockLike[] };
  try {
    parsed = JSON.parse(content);
  } catch {
    return content;
  }
  if (!parsed || !Array.isArray(parsed.blocks)) return content;

  await attachNavItems(siteId, parsed.blocks);
  return JSON.stringify(parsed);
}

async function attachNavItems(siteId: number, blocks: BlockLike[]): Promise<void> {
  const navBlocks: BlockLike[] = [];
  function walk(list: BlockLike[]): void {
    for (const b of list) {
      if (b?.type === 'navigation') navBlocks.push(b);
      if (Array.isArray(b?.blocks)) walk(b.blocks);
      if (Array.isArray(b?.columns)) {
        for (const col of b.columns) {
          if (Array.isArray(col?.blocks)) walk(col.blocks);
        }
      }
    }
  }
  walk(blocks);
  if (navBlocks.length === 0) return;

  try {
    // getClientSiteNavItemsCached is React's request-scoped cache() around
    // the server action — N navigation blocks on one page (e.g. header +
    // footer) cost a single DB query, and generateMetadata/page rendering
    // sharing the same request also dedup against it for free.
    const items = await getClientSiteNavItemsCached(siteId);
    for (const b of navBlocks) b.initialItems = items;
  } catch (err) {
    console.warn('[prefetch-navigation] nav fetch failed for site', siteId, err instanceof Error ? err.message : err);
  }
}
