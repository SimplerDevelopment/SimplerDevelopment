'use client';

import dynamic from 'next/dynamic';
import { useInteractionReady } from '@/hooks/useInteractionReady';

// HeroVisual pulls in framer-motion and is purely decorative, so load it lazily
// and only after interaction — keeps framer-motion off the homepage's initial
// bundle and out of hydration entirely.
const HeroVisual = dynamic(
  () => import('@/components/sections/HeroVisual').then((mod) => ({ default: mod.HeroVisual })),
  { ssr: false, loading: () => null },
);

/** Client island that mounts the decorative HeroVisual only after engagement. */
export function HeroVisualGate() {
  const interactionReady = useInteractionReady();
  return interactionReady ? <HeroVisual /> : null;
}
