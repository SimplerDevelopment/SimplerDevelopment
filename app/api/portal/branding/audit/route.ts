import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';
import { db } from '@/lib/db';
import { brandingProfiles, brandingMessaging } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { auditBranding } from '@/lib/branding/audit';
import { messagingRowToContext } from '@/lib/branding/block-defaults';

/**
 * POST /api/portal/branding/audit
 * Body: { profileId: number }
 * Returns: { success: true, report: AuditReport }
 *
 * Runs the pure rule-based audit against the given branding profile and
 * its associated messaging row. No AI call — fast, deterministic.
 */
export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }
    const client = await getPortalClient(parseInt(session.user.id, 10));
    if (!client) {
      return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });
    }

    const { profileId } = await req.json();
    const id = parseInt(String(profileId), 10);
    if (!id || Number.isNaN(id)) {
      return NextResponse.json({ success: false, message: 'profileId is required' }, { status: 400 });
    }

    const [profile] = await db
      .select()
      .from(brandingProfiles)
      .where(and(eq(brandingProfiles.id, id), eq(brandingProfiles.clientId, client.id)))
      .limit(1);
    if (!profile) {
      return NextResponse.json({ success: false, message: 'Profile not found' }, { status: 404 });
    }

    // Prefer profile-scoped messaging, fall back to the client's default row.
    let [messagingRow] = await db
      .select()
      .from(brandingMessaging)
      .where(and(eq(brandingMessaging.clientId, client.id), eq(brandingMessaging.brandingProfileId, id)))
      .limit(1);
    if (!messagingRow) {
      [messagingRow] = await db
        .select()
        .from(brandingMessaging)
        .where(eq(brandingMessaging.clientId, client.id))
        .orderBy(brandingMessaging.id)
        .limit(1);
    }

    const report = auditBranding({
      profile: {
        name: profile.name,
        primaryColor: profile.primaryColor ?? undefined,
        secondaryColor: profile.secondaryColor ?? undefined,
        accentColor: profile.accentColor ?? undefined,
        backgroundColor: profile.backgroundColor ?? undefined,
        textColor: profile.textColor ?? undefined,
        navBackground: profile.navBackground ?? undefined,
        navTextColor: profile.navTextColor ?? undefined,
        linkColor: profile.linkColor ?? undefined,
        headingFont: profile.headingFont ?? undefined,
        bodyFont: profile.bodyFont ?? undefined,
        logoUrl: profile.logoUrl ?? undefined,
        logoSquareUrl: profile.logoSquareUrl ?? undefined,
        logoRectUrl: profile.logoRectUrl ?? undefined,
        logoIconUrl: profile.logoIconUrl ?? undefined,
        faviconUrl: profile.faviconUrl ?? undefined,
        ogImageUrl: profile.ogImageUrl ?? undefined,
        buttonStyle: profile.buttonStyle as { primaryBg?: string; primaryText?: string } | null,
      },
      messaging: messagingRowToContext(messagingRow),
    });

    return NextResponse.json({ success: true, report });
  } catch (err) {
    console.error('[branding-audit] failed', err);
    return NextResponse.json(
      { success: false, message: err instanceof Error ? err.message : 'Audit failed' },
      { status: 500 },
    );
  }
}
