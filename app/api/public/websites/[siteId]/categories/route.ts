import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { categories, clientWebsites } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';

export async function GET(_req: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const siteIdNum = parseInt(siteId);

  const [site] = await db
    .select({ id: clientWebsites.id })
    .from(clientWebsites)
    .where(and(eq(clientWebsites.id, siteIdNum), eq(clientWebsites.active, true)))
    .limit(1);

  if (!site) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const data = await db
    .select({
      id: categories.id,
      name: categories.name,
      slug: categories.slug,
      description: categories.description,
      color: categories.color,
    })
    .from(categories)
    .where(eq(categories.websiteId, siteIdNum))
    .orderBy(categories.name);

  return NextResponse.json({ success: true, data });
}
