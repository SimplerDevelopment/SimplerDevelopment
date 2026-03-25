import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { pitchDecks } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

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

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  const { title, description, sourceUrl } = await req.json();
  if (!title?.trim()) return NextResponse.json({ success: false, message: 'Title is required' }, { status: 400 });

  // Generate slug from title
  const baseSlug = title.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const slug = `${baseSlug}-${Date.now().toString(36)}`;

  const [deck] = await db.insert(pitchDecks).values({
    clientId: client.id,
    title: title.trim(),
    slug,
    description: description?.trim() || null,
    sourceUrl: sourceUrl?.trim() || null,
    createdBy: userId,
  }).returning();

  return NextResponse.json({ success: true, data: deck });
}
