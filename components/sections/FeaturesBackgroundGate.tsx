'use client';

import dynamic from 'next/dynamic';
import { useInteractionReady } from '@/hooks/useInteractionReady';
import { use3DScene } from '@/hooks/use3DScene';

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
  const { supportsWebGL } = use3DScene();
  return interactionReady && supportsWebGL ? <FeaturesBackground /> : null;
}
