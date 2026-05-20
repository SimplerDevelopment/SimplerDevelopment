import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { clientWebsites, websiteDomains } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { generateUnlockToken, normalizeCode } from '@/lib/preview-unlock';

// Hostnames where each tenant lives on its OWN host (subdomain or custom
// domain). On any other host — localhost, Vercel previews, agency white-label
// portals — we keep the unlock flow on the same host the visitor is on, and
// reach the tenant via the internal `/sites/<domain>/` rewrite.
const PROD_APP_HOSTS = new Set(['simplerdevelopment.com', 'www.simplerdevelopment.com']);

function bareHost(host: string): string {
  return host.split(':')[0].toLowerCase();
}

function isProductionAppHost(host: string): boolean {
  return PROD_APP_HOSTS.has(bareHost(host));
}

// Best tenant subdomain/custom-domain (used when the visitor is on the prod
// marketing site so we can hand them off to the pretty canonical URL).
async function resolveTenantHost(site: {
  id: number;
  subdomain: string | null;
  domain: string | null;
}): Promise<string | null> {
  if (site.subdomain) return `${site.subdomain}.simplerdevelopment.com`;
  if (site.domain) return site.domain;
  const [extra] = await db
    .select({ domain: websiteDomains.domain })
    .from(websiteDomains)
    .where(eq(websiteDomains.websiteId, site.id))
    .limit(1);
  return extra?.domain ?? null;
}

export async function POST(req: Request) {
  let body: { code?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: 'Invalid request body.' }, { status: 400 });
  }

  const raw = typeof body.code === 'string' ? body.code : '';
  const code = normalizeCode(raw);
  if (!code) {
    return NextResponse.json({ success: false, message: 'Please enter an access code.' }, { status: 400 });
  }

  const [site] = await db
    .select({
      id: clientWebsites.id,
      name: clientWebsites.name,
      subdomain: clientWebsites.subdomain,
      domain: clientWebsites.domain,
      active: clientWebsites.active,
    })
    .from(clientWebsites)
    .where(and(eq(clientWebsites.previewCode, code), eq(clientWebsites.active, true)))
    .limit(1);

  if (!site) {
    return NextResponse.json({ success: false, message: 'That access code is not valid.' }, { status: 404 });
  }

  const tenantHost = await resolveTenantHost(site);
  if (!tenantHost) {
    return NextResponse.json(
      { success: false, message: 'This site is not yet reachable. Please contact your account manager.' },
      { status: 409 },
    );
  }

  const token = generateUnlockToken(site.id);

  // Decide where to send the visitor based on the host they're currently on.
  // - On simplerdevelopment.com (prod marketing): hand them off to the
  //   tenant's pretty subdomain URL — cookie lands on that host.
  // - Everywhere else (localhost, *.vercel.app, white-label custom domains):
  //   stay on the same host and reach the tenant via /sites/<domain>/. The
  //   unlock cookie lands on the current host, which is what the renderer
  //   reads on the very next request.
  const requestHost = req.headers.get('host') || '';
  const requestProto = req.headers.get('x-forwarded-proto') || (requestHost.startsWith('localhost') ? 'http' : 'https');

  let url: string;
  if (isProductionAppHost(requestHost)) {
    url = `https://${tenantHost}/api/sites/unlock?s=${site.id}&t=${token}`;
  } else {
    const next = encodeURIComponent(`/sites/${tenantHost}/`);
    url = `${requestProto}://${requestHost}/api/sites/unlock?s=${site.id}&t=${token}&next=${next}`;
  }

  return NextResponse.json({ success: true, data: { name: site.name, url } });
}
