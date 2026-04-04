'use client';

import Marquee from 'react-fast-marquee';
import { MarqueeBlock } from '@/types/blocks';
import { getElementCSS } from '@/lib/utils/elementStyles';

interface MarqueeBlockRenderProps {
  block: MarqueeBlock;
}

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

  if (items.length === 0) return null;

  const isVertical = direction === 'up' || direction === 'down';

  return (
    <div style={isVertical && height ? { height, overflow: 'hidden' } : undefined}>
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
        {items.map((item) => {
          const wrapper = (content: React.ReactNode) =>
            item.link ? (
              <a key={item.id} href={item.link} style={{ textDecoration: 'none', color: 'inherit', display: 'inline-flex', alignItems: 'center', marginRight: gap }}>
                {content}
              </a>
            ) : (
              <span key={item.id} style={{ display: 'inline-flex', alignItems: 'center', marginRight: gap }}>
                {content}
              </span>
            );

          if (item.type === 'image' && item.imageUrl) {
            return wrapper(
              <img
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
            return wrapper(
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
          return wrapper(
            <span
              style={{
                whiteSpace: 'nowrap',
                ...getElementCSS(block.elementStyles, 'text'),
              }}
            >
              {item.content || ''}
            </span>
          );
        })}
      </Marquee>
    </div>
  );
}
