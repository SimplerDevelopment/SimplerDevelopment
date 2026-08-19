'use client';

import type { CSSProperties } from 'react';

/**
 * SVG shape data for the Material Icons glyphs this file renders, extracted
 * from the installed react-icons/md package (24x24 viewBox, same coordinate
 * space react-icons uses). Generated — see the commit message for how.
 * Each entry is one or more shape descriptors: a <path> (the common case,
 * `tag` omitted) or a <circle> (`tag: 'circle'`). A `fill: 'none'` entry is a
 * zero-visual-impact bounding-box spacer some Material glyphs carry; `fillRule`
 * covers the handful of evenodd cutout glyphs (e.g. grid_view, horizontal_rule).
 *
 * WHY inline SVG instead of react-icons/md: react-icons/md is a single ~2MB
 * module with ~4,300 icon components. Turbopack chunk-groups that whole
 * barrel with any client module that reaches it — so importing even one
 * named icon from it pulled the entire barrel into every public tenant page's
 * module graph (verified via page_client-reference-manifest.js, not just
 * chunk presence — see the commit message). Inlining just the ~96 path
 * strings this file actually uses removes the import entirely.
 */
import { ICON_PATHS, ICON_MAP, type IconShape } from '@/lib/icons/material-icon-paths';


interface IconProps {
  /** Material Icons name (e.g. "rocket_launch") or react-icons component name ("MdRocketLaunch"). */
  name: string;
  size?: number | string;
  className?: string;
  style?: CSSProperties;
  'aria-hidden'?: boolean;
}

function renderShape(shape: IconShape, index: number) {
  if (shape.tag === 'circle') {
    return (
      <circle
        key={index}
        cx={shape.cx}
        cy={shape.cy}
        r={shape.r}
        fill={shape.fill}
        fillRule={shape.fillRule as 'evenodd' | 'nonzero' | undefined}
      />
    );
  }
  return (
    <path
      key={index}
      d={shape.d}
      fill={shape.fill}
      fillRule={shape.fillRule as 'evenodd' | 'nonzero' | undefined}
    />
  );
}

/**
 * Renders an inline SVG for the given Material Icons name, using path data
 * extracted from react-icons/md (see ICON_PATHS above) so the public render
 * path never imports that package. Falls back to the material-icons CSS font
 * when a name isn't mapped, so unknown icons keep working instead of
 * rendering blank.
 */
export function Icon({ name, size, className = '', style, 'aria-hidden': ariaHidden = true }: IconProps) {
  if (!name) return null;
  const mapKey = ICON_MAP[name] ?? ICON_MAP[name.replace(/[A-Z]/g, (c, i) => (i === 0 ? c.toLowerCase() : `_${c.toLowerCase()}`)).replace(/^md_/, '')];
  const shapes = mapKey ? ICON_PATHS[mapKey] : undefined;

  if (shapes) {
    // Mirrors react-icons' IconBase: width/height default to "1em" so the
    // rendered size tracks font-size, and callers set pixel/rem size via the
    // `size` prop below (converted to a fontSize style), not svg attrs.
    const sizeStyle = size !== undefined ? { fontSize: typeof size === 'number' ? `${size}px` : size } : undefined;
    return (
      <svg
        viewBox="0 0 24 24"
        width="1em"
        height="1em"
        stroke="currentColor"
        fill="currentColor"
        strokeWidth={0}
        className={className}
        style={{ ...sizeStyle, ...style }}
        aria-hidden={ariaHidden}
      >
        {shapes.map(renderShape)}
      </svg>
    );
  }

  // Fallback: material-icons font span (keeps existing icon names working)
  const fallbackSize = size !== undefined ? { fontSize: typeof size === 'number' ? `${size}px` : size } : undefined;
  return (
    <span
      className={`material-icons ${className}`}
      style={{ ...fallbackSize, ...style }}
      aria-hidden={ariaHidden}
    >
      {name}
    </span>
  );
}
