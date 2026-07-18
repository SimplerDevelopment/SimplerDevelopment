/**
 * Iframe host for a registered plugin's UI.
 *
 * Middleware mints a 10-minute user-context tenancy JWT and drops it into
 * the `sd-plugin-tenant` cookie scoped to `.simplerdevelopment.com`. This
 * page resolves the plugin's hostUrl + the requested sub-path and renders
 * a full-bleed <iframe> pointing at the plugin host. The browser sends the
 * apex-scoped cookie on the iframe's cross-subdomain request, and the
 * plugin host's middleware verifies it the same way it would a header-side
 * JWT. The portal chrome (sidebar / cmd-K) stays around the iframe via the
 * normal `PortalShell` layout chain.
 *
 * We previously reverse-proxied the plugin's HTML into the portal at this
 * path; that broke /_next/static/* asset URLs (resolved against the portal
 * origin) and meant the plugin replaced the entire document instead of
 * sitting inside the layout. The iframe approach keeps each side's
 * Next.js tree rendering its own pages.
 */

import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';
import {
  findActivePluginBySlug,
  isClientEntitledToApp,
} from '@/lib/plugins/entitlement';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function PluginAppIframePage({
  params,
}: {
  params: Promise<{ appId: string; slug?: string[] }>;
}) {
  const { appId, slug } = await params;

  const session = await auth();
  if (!session?.user?.id) redirect('/portal/login');
  const userId = parseInt(String(session.user.id), 10);
  if (!Number.isFinite(userId)) redirect('/portal/login');

  const client = await getPortalClient(userId);
  if (!client) redirect('/portal/dashboard');

  const app = await findActivePluginBySlug(appId);
  if (!app) notFound();

  const entitled = await isClientEntitledToApp(client.id, app);
  if (!entitled) notFound();

  const subPath =
    slug && slug.length > 0
      ? '/' + slug.map(encodeURIComponent).join('/')
      : '/';
  const host = app.hostUrl.replace(/\/$/, '');
  const iframeSrc = `${host}${subPath}`;

  return (
    <div className="h-[calc(100vh-1rem)] w-full">
      <iframe
        src={iframeSrc}
        title={app.name}
        className="block h-full w-full border-0 bg-background"
        // Allow scripts/forms/same-origin storage so the plugin's UI works
        // normally. We deliberately omit `allow-top-navigation` — the plugin
        // cannot break out of the iframe.
        sandbox="allow-scripts allow-forms allow-same-origin allow-popups allow-popups-to-escape-sandbox"
        referrerPolicy="same-origin"
      />
    </div>
  );
}
