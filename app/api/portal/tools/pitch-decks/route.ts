import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { pitchDecks } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';
import { slugify } from '@/lib/publishing/slug';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  // Service access check
  const authResult = await authorizePortal({ action: 'read', requireService: 'pitch-decks' });
  if (isAuthError(authResult)) return authResult.response;

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  const decks = await db
    .select()
    .from(pitchDecks)
    .where(eq(pitchDecks.clientId, client.id))
    .orderBy(desc(pitchDecks.updatedAt));

  return NextResponse.json({ success: true, data: decks });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  // Service access check
  const authResult = await authorizePortal({ action: 'write', requireService: 'pitch-decks' });
  if (isAuthError(authResult)) return authResult.response;

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  const { title, description, sourceUrl, brandingProfileId } = await req.json();
  if (!title?.trim()) return NextResponse.json({ success: false, message: 'Title is required' }, { status: 400 });

  // Generate slug from title, then guarantee uniqueness within this tenant by
  // checking for existing collisions and incrementing a numeric suffix.
  // The schema has no DB-level unique constraint on slug so we must do this
  // defensively in application code. Two concurrent creates with the same
  // title will read distinct existing-slug sets and produce distinct suffixes.
  const baseSlug = slugify(title.trim());
  const existing = await db
    .select({ slug: pitchDecks.slug })
    .from(pitchDecks)
    .where(eq(pitchDecks.clientId, client.id));
  const existingSet = new Set(existing.map((r) => r.slug));

  let slug = baseSlug;
  if (existingSet.has(slug)) {
    // Append a base-36 timestamp so same-second creates get different base
    // tokens, then walk a counter until we find a free slot.
    const token = Date.now().toString(36);
    slug = `${baseSlug}-${token}`;
    let counter = 2;
    while (existingSet.has(slug)) {
      slug = `${baseSlug}-${token}-${counter}`;
      counter++;
    }
  }

  const [deck] = await db.insert(pitchDecks).values({
    clientId: client.id,
    title: title.trim(),
    slug,
    description: description?.trim() || null,
    sourceUrl: sourceUrl?.trim() || null,
    brandingProfileId: brandingProfileId ?? null,
    createdBy: userId,
  }).returning();

  return NextResponse.json({ success: true, data: deck });
}
