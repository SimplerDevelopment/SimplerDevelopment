import Svg, { Path } from 'react-native-svg';

import { T } from '@/lib/theme';

/**
 * SdLogo — the SimplerDevelopment brand mark: a `</>` code-bracket motif
 * surrounded by sparkle stars. Ported verbatim from the site's
 * `public/iconLogo3d.svg` (viewBox 120×100) to react-native-svg so it scales
 * crisply at any size. Use for app/company branding (welcome, headers);
 * `AiAvatar`'s sparkle stays the in-chat *assistant* avatar.
 */

// The 7 paths from iconLogo3d.svg: `<`, `/`, `>`, then 4 sparkle stars.
const PATHS = [
  'M53.53,29.53 L33.05,50.00 L53.53,70.47 L58.47,65.53 L42.95,50.00 L58.47,34.47 Z',
  'M56.30,71.16 L70.30,31.16 L63.70,28.84 L49.70,68.84 Z',
  'M61.53,34.47 L77.05,50.00 L61.53,65.53 L66.47,70.47 L86.95,50.00 L66.47,29.53 Z',
  'M101.00,7.00 L103.12,16.88 L113.00,19.00 L103.12,21.12 L101.00,31.00 L98.88,21.12 L89.00,19.00 L98.88,16.88 Z',
  'M88.00,27.00 L88.71,30.29 L92.00,31.00 L88.71,31.71 L88.00,35.00 L87.29,31.71 L84.00,31.00 L87.29,30.29 Z',
  'M21.00,12.50 L22.20,17.80 L27.50,19.00 L22.20,20.20 L21.00,25.50 L19.80,20.20 L14.50,19.00 L19.80,17.80 Z',
  'M97.00,70.50 L97.85,74.15 L101.50,75.00 L97.85,75.85 L97.00,79.50 L96.15,75.85 L92.50,75.00 L96.15,74.15 Z',
];

const ASPECT = 120 / 100; // svg viewBox is 120 wide × 100 tall

export type SdLogoProps = {
  /** Rendered height in px; width follows the 1.2:1 viewBox aspect. */
  size?: number;
  /** Mark color. Defaults to the brand blue (`T.ai`); pass white on a dark/brand bg. */
  color?: string;
};

export function SdLogo({ size = 28, color = T.ai }: SdLogoProps) {
  return (
    <Svg width={size * ASPECT} height={size} viewBox="0 0 120 100">
      {PATHS.map((d, i) => (
        <Path key={i} d={d} fill={color} />
      ))}
    </Svg>
  );
}

export default SdLogo;
