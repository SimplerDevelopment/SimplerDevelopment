import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { discountCodes } from '@/lib/db/schema';
import { and, eq, desc } from 'drizzle-orm';
import { resolveClientSite } from '@/lib/portal-client';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ siteId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { siteId } = await params;
  const site = await resolveClientSite(parseInt(session.user.id, 10), parseInt(siteId));
  if (!site) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const codes = await db
    .select()
    .from(discountCodes)
    .where(eq(discountCodes.websiteId, site.id))
    .orderBy(desc(discountCodes.createdAt));

  return NextResponse.json({ success: true, data: codes });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ siteId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { siteId } = await params;
  const site = await resolveClientSite(parseInt(session.user.id, 10), parseInt(siteId));
  if (!site) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const body = await req.json();
  const { code, description, discountType, amount, minOrderAmount, maxUses, startsAt, expiresAt, active } = body;

  if (!code || !discountType || amount === undefined) {
    return NextResponse.json({ success: false, message: 'code, discountType, and amount are required' }, { status: 400 });
  }

  // Check code uniqueness within website
  const [existing] = await db
    .select({ id: discountCodes.id })
    .from(discountCodes)
    .where(and(eq(discountCodes.websiteId, site.id), eq(discountCodes.code, code.toUpperCase())))
    .limit(1);

  if (existing) {
    return NextResponse.json({ success: false, message: 'A discount with this code already exists' }, { status: 409 });
  }

  const [discount] = await db
    .insert(discountCodes)
    .values({
      websiteId: site.id,
      code: code.toUpperCase(),
      description: description || null,
      discountType,
      amount: parseInt(String(amount)),
      minOrderAmount: minOrderAmount != null ? parseInt(String(minOrderAmount)) : null,
      maxUses: maxUses != null ? parseInt(String(maxUses)) : null,
      startsAt: startsAt ? new Date(startsAt) : null,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      active: active ?? true,
    })
    .returning();

  return NextResponse.json({ success: true, data: discount }, { status: 201 });
}
