import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';
import { db } from '@/lib/db';
import { brandingProfiles } from '@/lib/db/schema';
import { eq, and, desc } from 'drizzle-orm';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const client = await getPortalClient(parseInt(session.user.id, 10));
  if (!client) return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  const profiles = await db
    .select()
    .from(brandingProfiles)
    .where(eq(brandingProfiles.clientId, client.id))
    .orderBy(desc(brandingProfiles.isDefault), brandingProfiles.name);

  return NextResponse.json({ success: true, data: profiles });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const client = await getPortalClient(parseInt(session.user.id, 10));
  if (!client) return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  const body = await req.json();
  const name = body.name?.trim();
  if (!name) return NextResponse.json({ success: false, message: 'Name is required' }, { status: 400 });

  // If setting as default, unset others
  if (body.isDefault) {
    await db.update(brandingProfiles)
      .set({ isDefault: false, updatedAt: new Date() })
      .where(and(eq(brandingProfiles.clientId, client.id), eq(brandingProfiles.isDefault, true)));
  }

  const [profile] = await db.insert(brandingProfiles).values({
    clientId: client.id,
    name,
    isDefault: body.isDefault ?? false,
    primaryColor: body.primaryColor ?? '#2563eb',
    secondaryColor: body.secondaryColor ?? '#1e40af',
    accentColor: body.accentColor ?? '#f59e0b',
    backgroundColor: body.backgroundColor ?? '#ffffff',
    textColor: body.textColor ?? '#111827',
    navTemplate: body.navTemplate ?? 'classic',
    navPosition: body.navPosition ?? 'top',
    navBackground: body.navBackground ?? '#ffffff',
    navTextColor: body.navTextColor ?? '#111827',
    headingFont: body.headingFont ?? null,
    bodyFont: body.bodyFont ?? null,
    typography: body.typography ?? null,
    logoUrl: body.logoUrl ?? null,
    logoAlt: body.logoAlt ?? null,
    logoSquareUrl: body.logoSquareUrl ?? null,
    logoRectUrl: body.logoRectUrl ?? null,
    logoText: body.logoText ?? null,
    logoIconUrl: body.logoIconUrl ?? null,
    darkMode: body.darkMode ?? null,
  }).returning();

  return NextResponse.json({ success: true, data: profile }, { status: 201 });
}
