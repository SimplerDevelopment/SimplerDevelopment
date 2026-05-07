import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { posts, pitchDecks, bookingPages, crmProposals } from '@/lib/db/schema';
import { and, eq, desc, asc } from 'drizzle-orm';
import { getPortalClient, resolveClientSite } from '@/lib/portal-client';

/**
 * Unified link suggestions for the html-render block's URL fields. Returns
 * relative paths that resolve against whatever origin the deck/page is being
 * viewed at:
 *   - posts:     /{slug}        (only when ?siteId is given)
 *   - decks:     /pitch-deck/{slug}
 *   - bookings:  /book/{slug}
 *   - proposals: /proposal/{clientToken}
 *
 * Slim payload — title + url only — so the picker stays snappy on clients
 * with hundreds of entries.
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  const url = new URL(req.url);
  const siteIdParam = url.searchParams.get('siteId');
  const siteId = siteIdParam ? parseInt(siteIdParam, 10) : null;

  let postRows: Array<{ id: number; title: string; slug: string; postType: string }> = [];
  if (siteId) {
    const site = await resolveClientSite(userId, siteId);
    if (site) {
      postRows = await db
        .select({ id: posts.id, title: posts.title, slug: posts.slug, postType: posts.postType })
        .from(posts)
        .where(eq(posts.websiteId, site.id))
        .orderBy(asc(posts.title));
    }
  }

  const [deckRows, bookingRows, proposalRows] = await Promise.all([
    db.select({ id: pitchDecks.id, title: pitchDecks.title, slug: pitchDecks.slug, status: pitchDecks.status })
      .from(pitchDecks)
      .where(eq(pitchDecks.clientId, client.id))
      .orderBy(desc(pitchDecks.updatedAt)),
    db.select({ id: bookingPages.id, title: bookingPages.title, slug: bookingPages.slug })
      .from(bookingPages)
      .where(eq(bookingPages.clientId, client.id))
      .orderBy(desc(bookingPages.updatedAt)),
    db.select({ id: crmProposals.id, title: crmProposals.title, clientToken: crmProposals.clientToken, status: crmProposals.status })
      .from(crmProposals)
      .where(eq(crmProposals.clientId, client.id))
      .orderBy(desc(crmProposals.updatedAt)),
  ]);

  return NextResponse.json({
    success: true,
    data: {
      posts: postRows.map(r => ({
        id: r.id,
        label: r.title,
        sublabel: r.postType,
        url: `/${r.slug}`,
      })),
      decks: deckRows.map(r => ({
        id: r.id,
        label: r.title,
        sublabel: r.status,
        url: `/pitch-deck/${r.slug}`,
      })),
      bookings: bookingRows.map(r => ({
        id: r.id,
        label: r.title,
        url: `/book/${r.slug}`,
      })),
      proposals: proposalRows.map(r => ({
        id: r.id,
        label: r.title,
        sublabel: r.status,
        url: `/proposal/${r.clientToken}`,
      })),
    },
  });
}
