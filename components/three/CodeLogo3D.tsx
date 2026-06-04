'use client';

import dynamic from 'next/dynamic';
import { useTheme } from '@/hooks/useTheme';

/**
 * Client wrapper that lazy-loads the WebGL scene with `ssr: false` so the
 * extruded `</>` logo Canvas can be dropped straight into a Server Component
 * page. The logo colour tracks the theme: white in dark mode, black in light.
 */
const CodeLogo3DScene = dynamic(
  () => import('@/components/three/CodeLogo3DScene').then((mod) => ({ default: mod.CodeLogo3DScene })),
  { ssr: false },
);

export function CodeLogo3D({ className }: { className?: string }) {
  const { resolvedTheme } = useTheme();
  const color = resolvedTheme === 'dark' ? '#ffffff' : '#000000';

  return <CodeLogo3DScene className={className} color={color} />;
}
