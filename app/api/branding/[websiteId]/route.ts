import { NextRequest, NextResponse } from 'next/server';
import { getBrandingByWebsiteId, brandingToCssVars } from '@/lib/branding';

/**
 * Public branding endpoint — returns resolved branding for a website.
 * Used by client site rendering and the block editor iframe.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ websiteId: string }> },
) {
  try {
    const { websiteId } = await params;
    const id = parseInt(websiteId);
    if (isNaN(id)) {
      return NextResponse.json({ success: false, error: 'Invalid websiteId' }, { status: 400 });
    }

    const branding = await getBrandingByWebsiteId(id);
    const cssVars = brandingToCssVars(branding);

    return NextResponse.json({
      success: true,
      data: branding,
      cssVars,
    });
  } catch (error) {
    console.error('[GET /api/branding/[websiteId]]', error);
    return NextResponse.json({ success: false, error: 'Failed to load branding' }, { status: 500 });
  }
}
