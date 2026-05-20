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

import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';
import { loadUserApps, type UserAppNavMeta } from '@/lib/plugins/load-user-apps';
import PortalLayoutClient from './PortalLayoutClient';

export default async function PortalShell({ children }: { children: React.ReactNode }) {
  let apps: UserAppNavMeta[] = [];

  try {
    const session = await auth();
    const userIdRaw = session?.user?.id;
    if (userIdRaw) {
      const userId = parseInt(String(userIdRaw), 10);
      if (!Number.isNaN(userId)) {
        const client = await getPortalClient(userId);
        if (client) {
          apps = await loadUserApps(client.id);
        }
      }
    }
  } catch {
    // Plugin registry failure must never knock out the portal. Fall through
    // with an empty apps list — the user still gets the base nav tree.
    apps = [];
  }

  return <PortalLayoutClient apps={apps}>{children}</PortalLayoutClient>;
}
