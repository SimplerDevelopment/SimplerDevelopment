// POST /api/portal/tools/pitch-decks/[id]/fork — duplicate a deck into a new
// DRAFT tied to the original via parentDeckId. Portal-REST mirror of the
// decks_fork MCP tool (slides + theme + metadata copied; the parent is
// untouched). Tenant-scoped by clientId.
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { pitchDecks } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { hasServiceAccess } from '@/lib/portal-auth';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });
  if (!(await hasServiceAccess(client.id, 'pitch-decks'))) return NextResponse.json({ success: false, message: 'This feature requires an active pitch-decks subscription.', requiresService: 'pitch-decks', upsellUrl: '/portal/services' }, { status: 403 });

  const deckId = parseInt((await params).id, 10);
  if (Number.isNaN(deckId))
    return NextResponse.json({ success: false, message: 'Invalid ID' }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const titleSuffix = typeof body.titleSuffix === 'string' ? body.titleSuffix : ' (fork)';

  const [source] = await db
    .select()
    .from(pitchDecks)
    .where(and(eq(pitchDecks.id, deckId), eq(pitchDecks.clientId, client.id)))
    .limit(1);
  if (!source) return NextResponse.json({ success: false, message: 'Deck not found' }, { status: 404 });

  const baseSlug = source.slug.replace(/-fork-[a-z0-9]+$/, '');
  const forkSlug = `${baseSlug}-fork-${Date.now().toString(36)}`;

  const [fork] = await db
    .insert(pitchDecks)
    .values({
      clientId: client.id,
      title: `${source.title}${titleSuffix}`,
      slug: forkSlug,
      description: source.description,
      status: 'draft',
      slides: source.slides as never,
      formatVersion: source.formatVersion,
      theme: source.theme as never,
      sourceUrl: source.sourceUrl,
      brandingProfileId: source.brandingProfileId,
      seoTitle: source.seoTitle,
      seoDescription: source.seoDescription,
      ogImage: source.ogImage,
      canonicalUrl: source.canonicalUrl,
      noIndex: source.noIndex,
      parentDeckId: source.id,
      createdBy: userId,
    })
    .returning();

  return NextResponse.json({ success: true, data: fork }, { status: 201 });
}
