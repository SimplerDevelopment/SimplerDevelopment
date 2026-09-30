'use client';

/**
 * PUX-199: owns the global ⌘J / Ctrl+J hotkey and the `portal:open-ask`
 * event for the Ask panel — the same shape as CmdKLauncher, and like it the
 * panel body is a lazy chunk that mounts on first open. Studio-only.
 */

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useState } from 'react';
import { useFeatureFlag } from '@/components/portal/FeatureFlagsProvider';

const AskPanel = dynamic(() => import('./AskPanel'), { ssr: false, loading: () => null });

export default function AskLauncher() {
  const studio = useFeatureFlag('portal-redesign');
  const [open, setOpen] = useState(false);
  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => {
    if (!studio) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'j' || e.key === 'J')) {
        e.preventDefault(); e.stopPropagation();
        setOpen((prev) => !prev); setHasMounted(true);
      }
    };
    const onOpen = () => { setOpen(true); setHasMounted(true); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('portal:open-ask', onOpen);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('portal:open-ask', onOpen); };
  }, [studio]);

  const close = useCallback(() => setOpen(false), []);
  if (!studio || !hasMounted) return null;
  return <AskPanel open={open} onClose={close} />;
}
