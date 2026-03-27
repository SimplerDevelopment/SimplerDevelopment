import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';
import { db } from '@/lib/db';
import { clientWebsites, siteBranding } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';

async function verifySiteAccess(siteId: string) {
  const session = await auth();
  if (!session?.user?.id) return null;

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return null;

  const [site] = await db
    .select({ id: clientWebsites.id })
    .from(clientWebsites)
    .where(and(eq(clientWebsites.id, parseInt(siteId)), eq(clientWebsites.clientId, client.id)))
    .limit(1);

  return site || null;
}

const DEFAULTS = {
  logoUrl: '',
  logoAlt: '',
  logoSquareUrl: '',
  logoRectUrl: '',
  logoText: '',
  logoIconUrl: '',
  primaryColor: '#2563eb',
  secondaryColor: '#1e40af',
  accentColor: '#f59e0b',
  backgroundColor: '#ffffff',
  textColor: '#111827',
  headingFont: '',
  bodyFont: '',
  navTemplate: 'classic',
  navPosition: 'top',
  navBackground: '#ffffff',
  navTextColor: '#111827',
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ siteId: string }> },
) {
  const { siteId } = await params;
  const site = await verifySiteAccess(siteId);
  if (!site) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const [branding] = await db
    .select()
    .from(siteBranding)
    .where(eq(siteBranding.websiteId, site.id))
    .limit(1);

  return NextResponse.json({ success: true, data: branding || { websiteId: site.id, ...DEFAULTS } });
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ siteId: string }> },
) {
  const { siteId } = await params;
  const site = await verifySiteAccess(siteId);
  if (!site) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const body = await req.json();

  const values = {
    websiteId: site.id,
    logoUrl: body.logoUrl ?? DEFAULTS.logoUrl,
    logoAlt: body.logoAlt ?? DEFAULTS.logoAlt,
    logoSquareUrl: body.logoSquareUrl ?? DEFAULTS.logoSquareUrl,
    logoRectUrl: body.logoRectUrl ?? DEFAULTS.logoRectUrl,
    logoText: body.logoText ?? DEFAULTS.logoText,
    logoIconUrl: body.logoIconUrl ?? DEFAULTS.logoIconUrl,
    primaryColor: body.primaryColor ?? DEFAULTS.primaryColor,
    secondaryColor: body.secondaryColor ?? DEFAULTS.secondaryColor,
    accentColor: body.accentColor ?? DEFAULTS.accentColor,
    backgroundColor: body.backgroundColor ?? DEFAULTS.backgroundColor,
    textColor: body.textColor ?? DEFAULTS.textColor,
    headingFont: body.headingFont ?? DEFAULTS.headingFont,
    bodyFont: body.bodyFont ?? DEFAULTS.bodyFont,
    typography: body.typography ?? null,
    darkMode: body.darkMode ?? null,
    navTemplate: body.navTemplate ?? DEFAULTS.navTemplate,
    navPosition: body.navPosition ?? DEFAULTS.navPosition,
    navBackground: body.navBackground ?? DEFAULTS.navBackground,
    navTextColor: body.navTextColor ?? DEFAULTS.navTextColor,
    updatedAt: new Date(),
  };

  const [existing] = await db
    .select({ id: siteBranding.id })
    .from(siteBranding)
    .where(eq(siteBranding.websiteId, site.id))
    .limit(1);

  let result;
  if (existing) {
    [result] = await db
      .update(siteBranding)
      .set(values)
      .where(eq(siteBranding.id, existing.id))
      .returning();
  } else {
    [result] = await db
      .insert(siteBranding)
      .values(values)
      .returning();
  }

  return NextResponse.json({ success: true, data: result });
}
