'use client';

/**
 * Client gate for the lunar signal stage.
 *
 * Same pattern and reason as StarFieldGate / HeroConsoleGate:
 * `dynamic(..., { ssr: false })` is only legal inside a Client Component, and
 * the marketing pages are deliberately Server Components with near-zero
 * hydration (see the header of app/(pages)/HomeClient.tsx).
 *
 * The `loading` fallback renders the same four illustrations in the same
 * positions, so the band is complete in the server HTML and the WebGL backdrop
 * simply appears behind it once the island hydrates. Nothing moves or reflows
 * on handover.
 */
import dynamic from 'next/dynamic';
import Image from 'next/image';

const FALLBACK = [
  { src: 'satellite', w: 789, h: 743, cls: 'absolute right-[24%] top-0 w-[34%] opacity-90' },
  { src: 'satellite-dish', w: 803, h: 800, cls: 'absolute bottom-[4%] left-0 w-[56%]' },
  { src: 'astronaut-pointing', w: 900, h: 875, cls: 'absolute bottom-[2%] left-[44%] w-[40%]' },
  { src: 'radio-tower', w: 491, h: 900, cls: 'absolute bottom-0 right-[8%] w-[26%]' },
] as const;

const SignalStage = dynamic(() => import('./SignalStage'), {
  ssr: false,
  loading: () => (
    <div className="relative h-full w-full" aria-hidden>
      {FALLBACK.map((a) => (
        <Image key={a.src} src={`/retro/${a.src}.webp`} alt="" width={a.w} height={a.h} className={`${a.cls} h-auto`} />
      ))}
    </div>
  ),
});

export default function SignalStageGate({ className }: { className?: string }) {
  return <SignalStage className={className} />;
}
