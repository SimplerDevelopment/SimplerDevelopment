'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useState } from 'react';
import type { UserAppNavMeta } from '@/lib/plugins/load-user-apps';
import type { SerializableEntitlements } from '@/app/portal/PortalShell';

// The actual ~532-LoC palette ships as its own chunk. It only loads once the
// user has either pressed Cmd+K or hovered the keyboard such that we know
// they're a power user. Until then the portal pays nothing for it.
const CmdKPalette = dynamic(() => import('./CmdKPalette'), {
  ssr: false,
  loading: () => null,
});

interface CmdKLauncherProps {
  apps?: UserAppNavMeta[];
  entitlements?: SerializableEntitlements;
}

/**
 * Thin static client component that owns the global Cmd+K / Ctrl+K hotkey
 * and the `open` state for the command palette. The palette body itself
 * (search UI, brain hits, nav-tree flattener) is dynamic-imported so the
 * portal shell does not pay for it on first paint.
 *
 * Once the user opens the palette once, the chunk is cached and subsequent
 * opens are instant.
 */
export default function CmdKLauncher({ apps, entitlements }: CmdKLauncherProps) {
  const [open, setOpen] = useState(false);
  // Once true we've ever mounted the palette — keep it mounted afterwards so
  // re-opens are instant and any internal state (recent searches, etc.) is
  // preserved across opens within a session.
  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        e.stopPropagation();
        setOpen((prev) => !prev);
        setHasMounted(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const handleClose = useCallback(() => setOpen(false), []);

  if (!hasMounted) return null;
  return <CmdKPalette apps={apps} entitlements={entitlements} open={open} onClose={handleClose} />;
}
