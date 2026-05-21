/**
 * Top-level pitch-deck redirect.
 *
 * `/slides/<slug>` shouldn't exist on the marketing root (simplerdevelopment.com)
 * — decks are tenant-scoped under `app/sites/[domain]/slides/[slug]/`. But the
 * EditorHeader's Preview / View Live buttons generate relative `/slides/X` URLs,
 * so when clicked from the portal (which lives on simplerdevelopment.com) the
 * browser hit this path and 404'd.
 *
 * Fix: look up the deck by slug, find its owning tenant's primary domain, and
 * 302-redirect to `https://<tenant-domain>/slides/<slug>` (preserving the
 * `preview=1` query string). Works for custom domains AND subdomain.simplerdevelopment.com.
 */
import { redirect } from 'next/navigation';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { pitchDecks } from '@/lib/db/schema/tools';
import { clientWebsites } from '@/lib/db/schema/sites';

export const dynamic = 'force-dynamic'; // can't be statically generated — depends on DB lookup
export const runtime = 'nodejs';

type Params = { slug: string };
type SearchParams = Record<string, string | string[] | undefined>;
type PageProps = {
  params: Promise<Params>;
  searchParams: Promise<SearchParams>;
};

export default async function SlidesRedirect({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const sp = await searchParams;

  // Resolve deck by slug. There's a UNIQUE on (client_id, slug) but slugs are
  // currently sufficiently unique across tenants in practice — and even if
  // there were a clash, falling back to the first match is fine for a
  // preview redirect. We can tighten this later if it becomes a problem.
  const [deck] = await db
    .select({ id: pitchDecks.id, clientId: pitchDecks.clientId })
    .from(pitchDecks)
    .where(eq(pitchDecks.slug, slug))
    .limit(1);
  if (!deck) {
    // No matching deck — render the 404 the framework provides.
    redirect('/');
  }

  // Find the deck owner's primary website. Prefer the active site with a
  // custom domain set; otherwise fall back to the subdomain on
  // simplerdevelopment.com.
  const sites = await db
    .select({
      domain: clientWebsites.domain,
      subdomain: clientWebsites.subdomain,
      active: clientWebsites.active,
    })
    .from(clientWebsites)
    .where(and(eq(clientWebsites.clientId, deck.clientId), eq(clientWebsites.active, true)))
    .limit(5);

  // Prefer custom-domain site, fall back to subdomain.simplerdevelopment.com
  const primary =
    sites.find((s) => s.domain && !s.domain.endsWith('.simplerdevelopment.com')) ?? sites[0];
  const host = primary?.domain
    ? primary.domain
    : primary?.subdomain
      ? `${primary.subdomain}.simplerdevelopment.com`
      : null;
  if (!host) redirect('/');

  // Preserve the original query string (preview=1, etc.).
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === 'string') qs.set(k, v);
    else if (Array.isArray(v)) v.forEach((x) => qs.append(k, x));
  }
  const qsStr = qs.toString();
  redirect(`https://${host}/slides/${slug}${qsStr ? `?${qsStr}` : ''}`);
}
