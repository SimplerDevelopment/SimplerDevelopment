// Public trigger-link redirect resolver. No auth, no site resolver — slugs
// are unique platform-wide. The middleware lets `/go/...` through on the
// main app hostname; links rendered on a tenant site CTA must point at the
// app domain (e.g. `https://simplerdevelopment.com/go/<slug>`) so the
// rewrite rule doesn't shadow this route.
//
// Each visit writes one row to `trigger_link_clicks`. We do NOT block on the
// insert if it fails — the redirect is the user-visible promise; tracking is
// best-effort. Failures are surfaced via console.error so they show up in
// observability.

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { triggerLinks, triggerLinkClicks } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

function pickClientIp(req: Request): string | null {
  // Trust the Vercel/Railway/Cloudflare hop chain. Take the first non-empty
  // forwarded address; fall back to the remote-addr-style headers.
  const xff = req.headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  return (
    req.headers.get('x-real-ip') ||
    req.headers.get('cf-connecting-ip') ||
    null
  );
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  if (!slug) {
    return new NextResponse('Not Found', { status: 404 });
  }

  const [link] = await db
    .select()
    .from(triggerLinks)
    .where(eq(triggerLinks.slug, slug))
    .limit(1);

  if (!link) {
    return new NextResponse('Not Found', { status: 404 });
  }

  // Best-effort click logging — never block the redirect on insert failure.
  try {
    await db.insert(triggerLinkClicks).values({
      linkId: link.id,
      clientId: link.clientId,
      ip: pickClientIp(req),
      userAgent: req.headers.get('user-agent'),
      referer: req.headers.get('referer'),
    });
  } catch (err) {
    console.error('[trigger-links] click insert failed', { slug, err });
  }

  // 302 (default) — allows the destination to evolve without leaking stale
  // cached redirects to client browsers.
  return NextResponse.redirect(link.destinationUrl, 302);
}
