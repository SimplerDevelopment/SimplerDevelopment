import { NextRequest, NextResponse } from 'next/server';
import { signUnlockCookieValue, unlockCookieName, verifyUnlockToken } from '@/lib/preview-unlock';

// Handoff endpoint reached on the site's own host (subdomain or custom
// domain). The main app mints a token after a code unlock and redirects
// the visitor here; we validate the token, drop a same-host cookie that
// the site renderer's gate honors, then 302 to a clean URL.
export async function GET(req: NextRequest) {
  const siteIdRaw = req.nextUrl.searchParams.get('s');
  const token = req.nextUrl.searchParams.get('t');
  const next = req.nextUrl.searchParams.get('next') || '/';

  const siteId = siteIdRaw ? parseInt(siteIdRaw, 10) : NaN;
  if (!Number.isFinite(siteId) || siteId <= 0 || !token) {
    return new NextResponse('Invalid unlock link', { status: 400 });
  }
  if (!verifyUnlockToken(siteId, token)) {
    return new NextResponse('This unlock link has expired or is invalid.', { status: 403 });
  }

  // Only follow same-host paths to avoid being weaponized as an open
  // redirector ("…/api/sites/unlock?next=https://evil.com").
  const dest = next.startsWith('/') ? next : '/';
  const redirectUrl = new URL(dest, req.nextUrl.origin);

  const res = NextResponse.redirect(redirectUrl, 302);
  res.cookies.set({
    name: unlockCookieName(siteId),
    value: signUnlockCookieValue(siteId),
    httpOnly: true,
    secure: req.nextUrl.protocol === 'https:',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
  return res;
}
