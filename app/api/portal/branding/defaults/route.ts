import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';
import { getBrandDefaults } from '@/lib/branding';

/**
 * GET /api/portal/branding/defaults?profileId=42
 * Returns the BrandDefaultsContext for the authenticated client + optional
 * profile id. Client editors (pitch decks, email campaigns) fetch this on
 * mount so newly-created blocks can pre-fill from messaging.
 */
export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }
    const client = await getPortalClient(parseInt(session.user.id, 10));
    if (!client) {
      return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });
    }

    const url = new URL(req.url);
    const profileIdRaw = url.searchParams.get('profileId');
    const profileId = profileIdRaw ? parseInt(profileIdRaw, 10) : null;

    const brandDefaults = await getBrandDefaults({
      clientId: client.id,
      brandingProfileId: profileId && !Number.isNaN(profileId) ? profileId : null,
    });

    return NextResponse.json({ success: true, data: brandDefaults });
  } catch (err) {
    console.error('[branding-defaults] failed', err);
    return NextResponse.json(
      { success: false, message: err instanceof Error ? err.message : 'Failed to load brand defaults' },
      { status: 500 },
    );
  }
}
