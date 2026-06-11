'use client';

import dynamic from 'next/dynamic';
import { use3DScene } from '@/hooks/use3DScene';
import { useInteractionReady } from '@/hooks/useInteractionReady';

const HeroParticleNetwork = dynamic(
  () =>
    import('@/components/three/HeroParticleNetwork').then((mod) => ({
      default: mod.HeroParticleNetwork,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-primary/5 animate-pulse" />
    ),
  },
);

/**
 * Client island for the hero's decorative WebGL particle network. Kept tiny and
 * separate so the rest of the homepage can be a Server Component (no hydration).
 * The canvas only mounts after the visitor engages (useInteractionReady), so a
 * passive/headless load just renders the static gradient fallback.
 */
export function HeroBackground() {
  const { supportsWebGL } = use3DScene();
  const interactionReady = useInteractionReady();

  if (interactionReady && supportsWebGL) {
    return <HeroParticleNetwork className="w-full h-full" />;
  }
  return <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-primary/5" />;
}
