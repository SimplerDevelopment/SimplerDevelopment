// Server-component wrapper around the existing `'use client'` portal layout.
// Resolves the active client on the server (via NextAuth + portal-client),
// loads the set of plugin apps that client is entitled to see, and passes
// the resolved list down into the client layout. The client layout in turn
// forwards `apps` to PortalSidebar + CmdKPalette so the "Apps" group lights
// up everywhere it's relevant in one round-trip.
//
// IMPORTANT: this file intentionally NEVER redirects unauthenticated users
// to `/portal/login`. The existing client layout already special-cases
// `/portal/login` and renders a centered-card login form — bouncing here
// would create a redirect loop on the login page itself. When the user has
// no session we just render the layout with an empty apps list and let
// downstream page-level auth handle the gating.
//
// Likewise we never throw on a DB / manifest error in `loadUserApps` — if
// the plugin registry blows up we degrade to "no Apps group" instead of
// blanking out the entire portal.

import { cookies } from 'next/headers';
import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';
import { loadUserApps, type UserAppNavMeta } from '@/lib/plugins/load-user-apps';
import { getClientEntitlements } from '@/lib/billing/entitlements';
import PortalLayoutClient from './PortalLayoutClient';

/** Serializable entitlements passed across the server→client boundary. */
export interface SerializableEntitlements {
  domains: string[];
  gatingBypassed: boolean;
}

// The Apps group in the sidebar must reflect the CURRENT active client. The
// active client is selected via the `sd-active-client` cookie; if this layout
// is statically rendered or its render is reused across tenants on a soft
// nav, users see another tenant's apps. Force dynamic rendering on every
// request to keep the entitlement check honest.
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

export default async function PortalShell({ children }: { children: React.ReactNode }) {
  // Touch the cookie store before any cache lookups so Next.js treats this
  // render as dynamic even if a future refactor drops the auth() call.
  await cookies();
  let apps: UserAppNavMeta[] = [];
  let entitlements: SerializableEntitlements = { domains: [], gatingBypassed: true };

  try {
    const session = await auth();
    const userIdRaw = session?.user?.id;
    if (userIdRaw) {
      const userId = parseInt(String(userIdRaw), 10);
      if (!Number.isNaN(userId)) {
        const client = await getPortalClient(userId);
        if (client) {
          apps = await loadUserApps(client.id);
          const ent = await getClientEntitlements(client.id, client);
          entitlements = {
            domains: [...ent.domains],
            gatingBypassed: ent.gatingBypassed,
          };
        }
      }
    }
  } catch {
    // Entitlement / plugin registry failure must never knock out the portal.
    // Fall through with bypass=true so all nav items are visible.
    apps = [];
    entitlements = { domains: [], gatingBypassed: true };
  }

  return <PortalLayoutClient apps={apps} entitlements={entitlements}>{children}</PortalLayoutClient>;
}
