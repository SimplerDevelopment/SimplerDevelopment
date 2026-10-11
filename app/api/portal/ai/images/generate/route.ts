/**
 * AI images — POST /api/portal/ai/images/generate
 *
 * Body: { siteId: number, prompt: string, alt?: string }
 * Renders one image via the AI image call-site (gpt-image-1, BYOK-aware),
 * stores it in S3 + the media library, and returns its URL + media id.
 * Draft-side only: callers decide where to attach it (post cover, LinkedIn).
 * Envelope: { success, data | message }.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { resolveClientSite } from '@/lib/portal-client';
import { authorizePortalSite, isAuthError } from '@/lib/portal-auth';
import { generateContentImage, MAX_IMAGE_PROMPT_CHARS } from '@/lib/ai/images';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  siteId: z.number().int().positive(),
  prompt: z.string().min(3).max(MAX_IMAGE_PROMPT_CHARS * 2),
  alt: z.string().max(200).optional(),
});

export async function POST(request: Request) {
  const session = await auth();
  const sessionUserId = session?.user?.id ? parseInt(session.user.id, 10) : NaN;
  if (!session?.user?.id || !Number.isSafeInteger(sessionUserId)) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const json = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, message: 'Invalid body', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const site = await resolveClientSite(sessionUserId, parsed.data.siteId);
  if (!site) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  const authorization = await authorizePortalSite({ siteId: site.id, action: 'write' });
  if (isAuthError(authorization)) return authorization.response;

  try {
    const img = await generateContentImage({
      clientId: site.clientId,
      prompt: parsed.data.prompt,
      websiteId: site.id,
      uploadedBy: sessionUserId,
      alt: parsed.data.alt,
    });
    return NextResponse.json({ success: true, data: img }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Image generation failed';
    return NextResponse.json({ success: false, message }, { status: 502 });
  }
}
