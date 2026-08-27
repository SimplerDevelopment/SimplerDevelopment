'use client';

// Client-side reader for per-client feature flags (PUX-135). The set is
// resolved on the server in app/portal/PortalShell.tsx (activeFlags(client))
// and crosses the boundary as SerializableEntitlements.flags; this context
// just makes it reachable from any client component under the portal shell
// without prop-drilling — the settings layout and the billing page are the
// first consumers (PUX-137).
//
// Fail closed: outside the provider (or before it mounts) every flag reads
// as off, matching PortalShell's own catch-branch. Never gate a *server*
// decision on this — use hasFlag(client, key) on the row instead.

import { createContext, useContext, useMemo } from 'react';
import type { FlagKey } from '@/lib/feature-flags';

const FeatureFlagsContext = createContext<ReadonlySet<string>>(new Set());

export function FeatureFlagsProvider({ flags, children }: { flags?: string[]; children: React.ReactNode }) {
  const set = useMemo(() => new Set(flags ?? []), [flags]);
  return <FeatureFlagsContext.Provider value={set}>{children}</FeatureFlagsContext.Provider>;
}

export function useFeatureFlag(key: FlagKey): boolean {
  return useContext(FeatureFlagsContext).has(key);
}
