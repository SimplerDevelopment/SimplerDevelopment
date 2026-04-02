import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';
import { db } from '@/lib/db';
import { brandingProfiles } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';

async function getProfile(profileId: number, clientId: number) {
  const [profile] = await db
    .select()
    .from(brandingProfiles)
    .where(and(eq(brandingProfiles.id, profileId), eq(brandingProfiles.clientId, clientId)))
    .limit(1);
  return profile;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ profileId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const client = await getPortalClient(parseInt(session.user.id, 10));
  if (!client) return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  const { profileId } = await params;
  const profile = await getProfile(parseInt(profileId), client.id);
  if (!profile) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  return NextResponse.json({ success: true, data: profile });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ profileId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const client = await getPortalClient(parseInt(session.user.id, 10));
  if (!client) return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  const { profileId } = await params;
  const id = parseInt(profileId);
  const existing = await getProfile(id, client.id);
  if (!existing) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const body = await req.json();

  // If setting as default, unset others
  if (body.isDefault && !existing.isDefault) {
    await db.update(brandingProfiles)
      .set({ isDefault: false, updatedAt: new Date() })
      .where(and(eq(brandingProfiles.clientId, client.id), eq(brandingProfiles.isDefault, true)));
  }

  const [updated] = await db.update(brandingProfiles).set({
    name: body.name?.trim() || existing.name,
    isDefault: body.isDefault ?? existing.isDefault,
    primaryColor: body.primaryColor ?? existing.primaryColor,
    secondaryColor: body.secondaryColor ?? existing.secondaryColor,
    accentColor: body.accentColor ?? existing.accentColor,
    backgroundColor: body.backgroundColor ?? existing.backgroundColor,
    textColor: body.textColor ?? existing.textColor,
    navTemplate: body.navTemplate ?? existing.navTemplate,
    navPosition: body.navPosition ?? existing.navPosition,
    navBackground: body.navBackground ?? existing.navBackground,
    navTextColor: body.navTextColor ?? existing.navTextColor,
    headingFont: body.headingFont ?? existing.headingFont,
    bodyFont: body.bodyFont ?? existing.bodyFont,
    typography: body.typography !== undefined ? body.typography : existing.typography,
    logoUrl: body.logoUrl !== undefined ? body.logoUrl : existing.logoUrl,
    logoAlt: body.logoAlt !== undefined ? body.logoAlt : existing.logoAlt,
    logoSquareUrl: body.logoSquareUrl !== undefined ? body.logoSquareUrl : existing.logoSquareUrl,
    logoRectUrl: body.logoRectUrl !== undefined ? body.logoRectUrl : existing.logoRectUrl,
    logoText: body.logoText !== undefined ? body.logoText : existing.logoText,
    logoIconUrl: body.logoIconUrl !== undefined ? body.logoIconUrl : existing.logoIconUrl,
    darkMode: body.darkMode !== undefined ? body.darkMode : existing.darkMode,
    borderRadius: body.borderRadius !== undefined ? body.borderRadius : existing.borderRadius,
    linkColor: body.linkColor !== undefined ? body.linkColor : existing.linkColor,
    linkHoverColor: body.linkHoverColor !== undefined ? body.linkHoverColor : existing.linkHoverColor,
    buttonStyle: body.buttonStyle !== undefined ? body.buttonStyle : existing.buttonStyle,
    faviconUrl: body.faviconUrl !== undefined ? body.faviconUrl : existing.faviconUrl,
    ogImageUrl: body.ogImageUrl !== undefined ? body.ogImageUrl : existing.ogImageUrl,
    updatedAt: new Date(),
  }).where(eq(brandingProfiles.id, id)).returning();

  return NextResponse.json({ success: true, data: updated });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ profileId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const client = await getPortalClient(parseInt(session.user.id, 10));
  if (!client) return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  const { profileId } = await params;
  const id = parseInt(profileId);
  const existing = await getProfile(id, client.id);
  if (!existing) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  await db.delete(brandingProfiles).where(eq(brandingProfiles.id, id));

  return NextResponse.json({ success: true });
}
