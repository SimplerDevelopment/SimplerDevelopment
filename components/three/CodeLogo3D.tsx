'use client';

import dynamic from 'next/dynamic';
import { useTheme } from '@/hooks/useTheme';
import { useInteractionReady } from '@/hooks/useInteractionReady';

/**
 * Client wrapper that lazy-loads the WebGL scene with `ssr: false` so the
 * extruded `</>` logo Canvas can be dropped straight into a Server Component
 * page. The logo colour tracks the theme: white in dark mode, black in light.
 *
 * The Canvas is decorative, so it only mounts once the visitor engages with the
 * page (see useInteractionReady). Until then — and for passive headless loads
 * like Lighthouse — a static `</>` placeholder fills the same box, keeping the
 * initial load fast and layout-shift-free.
 */
const CodeLogo3DScene = dynamic(
  () => import('@/components/three/CodeLogo3DScene').then((mod) => ({ default: mod.CodeLogo3DScene })),
  { ssr: false },
);

export function CodeLogo3D({ className }: { className?: string }) {
  const { resolvedTheme } = useTheme();
  const interactionReady = useInteractionReady();
  const color = resolvedTheme === 'dark' ? '#ffffff' : '#000000';

  if (!interactionReady) {
    return (
      <div className={className} aria-hidden="true">
        <div className="flex h-full w-full items-center justify-center">
          <span className="select-none font-mono text-6xl font-bold text-primary/30 md:text-7xl">
            &lt;/&gt;
          </span>
        </div>
      </div>
    );
  }

  return <CodeLogo3DScene className={className} color={color} />;
}
