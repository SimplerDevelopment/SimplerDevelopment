/**
 * Site-wide 404 link sweep (site 405). The live link audit found 9 internal
 * links returning 404, all from the cardiff.co clone using nested/legacy paths
 * that don't exist on this site:
 *
 *  • post 795 (about) — an 8-card "industries" grid linking to nested
 *    `/industries/<x>` paths. The real pages live at top-level slugs, but the
 *    mapping is irregular (automotive→auto-repair, beauty→beauty-salon,
 *    healthcare→medical, agriculture has no `industries-` prefix), so each is
 *    remapped explicitly.
 *  • post 818 (industries hub) — one stray card linked off-domain to
 *    `https://cardiff.co/industries/manufacturing/`. This site has no
 *    manufacturing page, so it points to the `/industries` hub instead of a
 *    404 / the source site.
 *  • post 819 (learn-articles) — a featured-article card linked to
 *    `/blog/use-0-apr-credit-cards-for-short-term-business-funding`, an article
 *    that was never imported. Repointed to the closest live article on the same
 *    topic (business credit cards as a funding path). NOTE: card title still
 *    reads "...0% APR Credit Card Offers..." — destination title differs; left
 *    for an editor to reconcile (better than a 404).
 *
 * Plain string replacement on `posts.content`. Idempotent — re-running is a
 * no-op once the legacy paths are gone.
 */
import { db } from '../../../lib/db';
import { posts } from '../../../lib/db/schema/cms';
import { eq } from 'drizzle-orm';

const FIXES: Record<number, Array<[string, string]>> = {
  795: [
    ['/industries/construction', '/industries-construction'],
    ['/industries/restaurants', '/industries-restaurants'],
    ['/industries/trucking', '/industries-trucking'],
    ['/industries/retail', '/industries-retail'],
    ['/industries/healthcare', '/industries-medical'],
    ['/industries/beauty', '/industries-beauty-salon'],
    ['/industries/automotive', '/industries-auto-repair'],
    ['/industries/agriculture', '/agriculture'],
  ],
  818: [
    ['https://cardiff.co/industries/manufacturing/', '/industries'],
  ],
  819: [
    [
      '/blog/use-0-apr-credit-cards-for-short-term-business-funding',
      '/blog/can-a-business-credit-card-lead-to-bigger-funding',
    ],
  ],
  // post 826 (newsroom) — two CTA cards linked to bare `/articles` and `/faqs`,
  // which don't exist; the real pages are the learn hub's children.
  826: [
    ['"href":"/articles"', '"href":"/learn-articles"'],
    ['"href":"/faqs"', '"href":"/learn-faq"'],
  ],
};

async function main() {
  for (const [idStr, pairs] of Object.entries(FIXES)) {
    const id = Number(idStr);
    const [row] = await db.select({ content: posts.content }).from(posts).where(eq(posts.id, id));
    if (!row) { console.log(`post ${id}: NOT FOUND — skipped`); continue; }
    let content = row.content;
    let changed = 0;
    for (const [from, to] of pairs) {
      const n = content.split(from).length - 1;
      if (n > 0) { content = content.split(from).join(to); changed += n; }
    }
    if (content === row.content) { console.log(`post ${id}: no legacy links found — no-op`); continue; }
    await db.update(posts).set({ content }).where(eq(posts.id, id));
    console.log(`post ${id}: rewrote ${changed} link occurrence(s)`);
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
