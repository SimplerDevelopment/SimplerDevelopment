'use client';

import { useEffect, useRef, useState } from 'react';
import Marquee from 'react-fast-marquee';
import { MarqueeBlock, MarqueeItem } from '@/types/blocks';
import { getElementCSS } from '@/lib/utils/elementStyles';

// JUL9-007 (2026-08-26): evaluated dropping react-fast-marquee now that the
// custom CSS-keyframe vertical path below exists — decided to KEEP the
// library for horizontal (left/right). The MarqueeBlockSettings panel
// (components/blocks/visual/block-settings/panels/MarqueeSettings.tsx)
// exposes gradient/gradientColor/gradientWidth, pauseOnClick and autoFill as
// per-block settings regardless of direction, but the vertical branch below
// does not implement any of them yet:
//   - gradient edge fade: unimplemented — no overlay/mask is rendered in the
//     isVertical branch, vs. react-fast-marquee's `gradient` prop which
//     renders a `.rfm-overlay` with a CSS mask on each edge.
//   - pauseOnClick: unimplemented — no click handler is wired to the
//     vertical track; only pauseOnHover is honored via the CSS `:hover` rule.
//   - autoFill: the vertical track always renders exactly 2 copies of the
//     item list (correct for the seamless -50% translateY loop), but
//     react-fast-marquee's `autoFill` *dynamically* measures the container
//     vs. content and sets a multiplier = ceil(containerWidth / contentWidth)
//     so a short item list still visually fills a wide/tall container with
//     no gap (see node_modules react-fast-marquee dist/components/Marquee.js
//     `calculateWidth`/`multiplyChildren`). A fixed 2x duplication does not
//     replicate that for a small item count in a tall vertical container.
// Until these are ported, react-fast-marquee stays as the horizontal render
// path. Re-evaluate once the vertical path gains gradient/pauseOnClick/true
// autoFill parity — see card 1378 (board 153) for the full evaluation.

interface MarqueeBlockRenderProps {
  block: MarqueeBlock;
}

// Vertical (up/down) marquee — react-fast-marquee handles up/down by rotating
// its whole track 90°, which rotates the text glyphs sideways too. This
// custom CSS-keyframe scroller keeps items in normal horizontal text
// orientation: the item list is rendered twice (each item — including the
// last — carries a trailing marginBottom equal to `gap`, mirroring how the
// horizontal path below gives every item a trailing marginRight) so a
// translateY loop from 0% to -50% wraps seamlessly with no visible seam.
const VERTICAL_STYLES = `
.marquee-vertical-track {
  animation: marquee-vertical-scroll var(--marquee-duration, 20s) linear infinite;
  animation-direction: var(--marquee-anim-direction, normal);
  animation-iteration-count: var(--marquee-iteration-count, infinite);
}
.marquee-vertical[data-pause-on-hover="true"]:hover .marquee-vertical-track {
  animation-play-state: paused;
}
@keyframes marquee-vertical-scroll {
  0% { transform: translateY(0); }
  100% { transform: translateY(-50%); }
}
`;

export function MarqueeBlockRender({ block }: MarqueeBlockRenderProps) {
  const {
    items = [],
    direction = 'left',
    speed = 50,
    pauseOnHover = false,
    pauseOnClick = false,
    gradient = false,
    gradientColor = 'white',
    gradientWidth = 200,
    autoFill = true,
    gap = '40px',
    height,
    loop = 0,
  } = block;

  const isVertical = direction === 'up' || direction === 'down';

  // Mirrors react-fast-marquee's own speed→duration convention (duration =
  // trackSize / speed, see node_modules react-fast-marquee's Marquee.js),
  // just measured on the vertical axis instead of horizontal. Seeded with a
  // rough per-item estimate for the very first paint, then refined once the
  // real DOM height is available.
  const setRef = useRef<HTMLDivElement>(null);
  const [durationSeconds, setDurationSeconds] = useState(() => {
    const estimatedItemHeight = 48; // px — rough line/icon/image row height
    const estimated = Math.max(items.length * estimatedItemHeight, estimatedItemHeight);
    return estimated / (speed || 50);
  });

  useEffect(() => {
    if (!isVertical) return;
    const el = setRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      const h = el.getBoundingClientRect().height;
      if (h > 0) setDurationSeconds(h / (speed || 50));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [isVertical, speed, items.length, gap]);

  if (items.length === 0) return null;

  const renderItemContent = (item: MarqueeItem) => {
    if (item.type === 'image' && item.imageUrl) {
      return (
        <img decoding="async" loading="lazy"
          src={item.imageUrl}
          alt={item.imageAlt || ''}
          style={{
            height: '40px',
            width: 'auto',
            objectFit: 'contain',
            ...getElementCSS(block.elementStyles, 'image'),
          }}
        />
      );
    }

    if (item.type === 'icon' && item.content) {
      return (
        <span
          className="material-icons"
          style={{
            fontSize: '2rem',
            ...getElementCSS(block.elementStyles, 'icon'),
          }}
        >
          {item.content}
        </span>
      );
    }

    // text
    return (
      <span
        style={{
          whiteSpace: 'nowrap',
          ...getElementCSS(block.elementStyles, 'text'),
        }}
      >
        {item.content || ''}
      </span>
    );
  };

  const renderItemWrapper = (item: MarqueeItem, key: string, marginStyle: React.CSSProperties) => {
    const content = renderItemContent(item);
    return item.link ? (
      <a key={key} href={item.link} style={{ textDecoration: 'none', color: 'inherit', display: 'inline-flex', alignItems: 'center', ...marginStyle }}>
        {content}
      </a>
    ) : (
      <span key={key} style={{ display: 'inline-flex', alignItems: 'center', ...marginStyle }}>
        {content}
      </span>
    );
  };

  if (isVertical) {
    const trackStyle: React.CSSProperties & Record<string, string> = {
      display: 'flex',
      flexDirection: 'column',
      '--marquee-duration': `${durationSeconds}s`,
      '--marquee-anim-direction': direction === 'down' ? 'reverse' : 'normal',
      '--marquee-iteration-count': loop && loop > 0 ? String(loop) : 'infinite',
    };

    return (
      <div
        className="marquee-vertical"
        data-marquee-vertical="true"
        data-pause-on-hover={pauseOnHover ? 'true' : 'false'}
        style={{ height: height || '300px', overflow: 'hidden' }}
      >
        <style dangerouslySetInnerHTML={{ __html: VERTICAL_STYLES }} />
        <div className="marquee-vertical-track" style={trackStyle}>
          <div ref={setRef} style={{ display: 'flex', flexDirection: 'column' }}>
            {items.map((item) => renderItemWrapper(item, `v-a-${item.id}`, { marginBottom: gap }))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }} aria-hidden="true">
            {items.map((item) => renderItemWrapper(item, `v-b-${item.id}`, { marginBottom: gap }))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Marquee
        direction={direction}
        speed={speed}
        pauseOnHover={pauseOnHover}
        pauseOnClick={pauseOnClick}
        gradient={gradient}
        gradientColor={gradientColor}
        gradientWidth={gradientWidth}
        autoFill={autoFill}
        loop={loop}
        style={{ gap }}
      >
        {items.map((item) => renderItemWrapper(item, item.id, { marginRight: gap }))}
      </Marquee>
    </div>
  );
}
