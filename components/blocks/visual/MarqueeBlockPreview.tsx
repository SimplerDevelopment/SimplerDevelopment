'use client';

import { MarqueeBlock } from '@/types/blocks';
import { getElementCSS } from '@/lib/utils/elementStyles';

interface MarqueeBlockPreviewProps {
  block: MarqueeBlock;
  isSelected: boolean;
  onChange: (updates: Partial<MarqueeBlock>) => void;
}

export function MarqueeBlockPreview({ block, isSelected }: MarqueeBlockPreviewProps) {
  const items = block.items || [];
  const gap = block.gap || '40px';

  if (items.length === 0) {
    return (
      <div style={{ padding: '24px', textAlign: 'center', background: '#f1f5f9', borderRadius: '8px', color: '#94a3b8', fontSize: '14px' }}>
        No marquee items. Add items in the settings panel.
      </div>
    );
  }

  // Mirrors the production renderer's per-item link wrapping (MarqueeBlockRender wraps each item in <a> when item.link is set)
  // Preview intentionally does NOT animate (would interfere with selection / be visually noisy in the canvas).
  // Also intentionally skips the gradient overlay since react-fast-marquee renders it inside the marquee component itself.
  const renderItem = (item: typeof items[number], opacity = 1) => {
    let inner: React.ReactNode;
    if (item.type === 'image' && item.imageUrl) {
      inner = (
        <img
          src={item.imageUrl}
          alt={item.imageAlt || ''}
          style={{ height: '40px', width: 'auto', objectFit: 'contain', ...getElementCSS(block.elementStyles, 'image') }}
        />
      );
    } else if (item.type === 'icon' && item.content) {
      inner = (
        <span className="material-icons" style={{ fontSize: '2rem', ...getElementCSS(block.elementStyles, 'icon') }}>
          {item.content}
        </span>
      );
    } else {
      inner = (
        <span style={{ whiteSpace: 'nowrap', ...getElementCSS(block.elementStyles, 'text') }}>
          {item.content || '(empty)'}
        </span>
      );
    }
    const wrapStyle: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', flexShrink: 0, opacity };
    return item.link ? (
      <a href={item.link} onClick={(e) => e.preventDefault()} style={{ ...wrapStyle, textDecoration: 'none', color: 'inherit' }}>
        {inner}
      </a>
    ) : (
      <span style={wrapStyle}>{inner}</span>
    );
  };

  return (
    <div style={{ overflow: 'hidden', position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap, padding: '8px 0' }}>
        {items.map((item) => (
          <span key={item.id}>{renderItem(item, 1)}</span>
        ))}
        {/* Duplicate (faded) to indicate the scroll repeats in production */}
        {items.map((item) => (
          <span key={`d-${item.id}`}>{renderItem(item, 0.4)}</span>
        ))}
      </div>
      {isSelected && (
        <div style={{ position: 'absolute', top: '4px', right: '4px', background: 'rgba(0,0,0,0.5)', color: '#fff', fontSize: '10px', padding: '2px 8px', borderRadius: '8px' }}>
          {block.direction || 'left'} / {block.speed || 50}px/s / {items.length} items / loop {block.loop ?? 0}
        </div>
      )}
    </div>
  );
}
