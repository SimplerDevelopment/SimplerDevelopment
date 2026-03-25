import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

// Hostnames that belong to the app itself (not client sites)
const APP_HOSTNAMES = new Set([
  'localhost',
  'localhost:3000',
  'localhost:3001',
  'localhost:3005',
  '127.0.0.1',
  '127.0.0.1:3000',
  'simplerdevelopment.com',
  'www.simplerdevelopment.com',
]);

function getAppHostname(): string | null {
  const url = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL;
  if (!url) return null;
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

function isAppHostname(host: string): boolean {
  if (APP_HOSTNAMES.has(host)) return true;
  const appHost = getAppHostname();
  if (appHost && host === appHost) return true;
  // Railway default domains
  if (host.endsWith('.up.railway.app')) return true;
  return false;
}

export async function middleware(req: NextRequest) {
  const host = req.headers.get('host') || '';

  // If this is a custom domain (not the app itself), rewrite to the sites renderer
  if (host && !isAppHostname(host)) {
    const { pathname } = req.nextUrl;

    // Don't rewrite API routes, static files, or Next.js internals
    if (
      pathname.startsWith('/api/') ||
      pathname.startsWith('/_next/') ||
      pathname.startsWith('/favicon.ico')
    ) {
      return NextResponse.next();
    }

    // Rewrite to internal /sites/[domain]/[...slug] route
    const domain = host.split(':')[0]; // strip port
    const url = req.nextUrl.clone();
    const slug = pathname === '/' ? '' : pathname;
    url.pathname = `/sites/${domain}${slug}`;
    return NextResponse.rewrite(url);
  }

  // For the app's own hostname, run the standard NextAuth middleware
  return (auth as unknown as (req: NextRequest) => Promise<NextResponse>)(req);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
