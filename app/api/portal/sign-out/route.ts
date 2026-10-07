import { NextResponse } from 'next/server';

/** Clear host cookies and the configured shared domain, including legacy names. */
export async function POST() {
  const response = NextResponse.json({ success: true });
  // Mirror lib/auth.ts: production ignores inherited insecure-cookie flags.
  const secure = process.env.NODE_ENV === 'production';
  const domain = process.env.AUTH_COOKIE_DOMAIN?.trim()
    || (process.env.VERCEL_ENV === 'production' ? '.simplerdevelopment.com' : undefined);
  const domains = domain ? [undefined, domain, domain.replace(/^\./, '')] : [undefined];
  const bases = ['authjs.session-token', 'authjs.csrf-token', 'authjs.callback-url'];
  const names = [...bases, ...bases.map((name) => `__Secure-${name}`), 'sd-active-client'];

  for (const name of names) {
    for (const scope of new Set(domains)) {
      // ResponseCookies keys entries by name, so using one collection would
      // overwrite host/domain variants. Append each serialized cookie header.
      const cookieResponse = new NextResponse();
      cookieResponse.cookies.set(name, '', {
        expires: new Date(0), path: '/', secure, domain: scope,
      });
      response.headers.append('Set-Cookie', cookieResponse.headers.get('Set-Cookie')!);
    }
  }
  return response;
}
