import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { media } from '@/lib/db/schema';
import { resolveClientSite } from '@/lib/portal-client';
import { eq, and } from 'drizzle-orm';

export async function PUT(req: Request, { params }: { params: Promise<{ siteId: string; id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { siteId, id } = await params;
  const site = await resolveClientSite(parseInt(session.user.id, 10), parseInt(siteId));
  if (!site) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const body = await req.json();
  const { alt, caption } = body;

  const [updated] = await db
    .update(media)
    .set({
      ...(alt !== undefined && { alt: alt || null }),
      ...(caption !== undefined && { caption: caption || null }),
      updatedAt: new Date(),
    })
    .where(and(eq(media.id, parseInt(id)), eq(media.websiteId, site.id)))
    .returning();

  if (!updated) return NextResponse.json({ success: false, message: 'Media not found' }, { status: 404 });
  return NextResponse.json({ success: true, data: updated });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ siteId: string; id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { siteId, id } = await params;
  const site = await resolveClientSite(parseInt(session.user.id, 10), parseInt(siteId));
  if (!site) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const [deleted] = await db
    .delete(media)
    .where(and(eq(media.id, parseInt(id)), eq(media.websiteId, site.id)))
    .returning();

  if (!deleted) return NextResponse.json({ success: false, message: 'Media not found' }, { status: 404 });
  return NextResponse.json({ success: true, message: 'Media deleted' });
}
