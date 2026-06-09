'use client';

import dynamic from 'next/dynamic';
import { useInteractionReady } from '@/hooks/useInteractionReady';

const FeaturesBackground = dynamic(
  () =>
    import('@/components/three/FeaturesBackground').then((mod) => ({
      default: mod.FeaturesBackground,
    })),
  { ssr: false, loading: () => null },
);

/**
 * Client island that mounts the decorative WebGL wave background behind the
 * features grid only after engagement. Keeps the surrounding section a Server
 * Component.
 */
export function FeaturesBackgroundGate() {
  const interactionReady = useInteractionReady();
  return interactionReady ? <FeaturesBackground /> : null;
}
