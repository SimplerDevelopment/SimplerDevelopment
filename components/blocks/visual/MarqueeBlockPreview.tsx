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

  return (
    <div style={{ overflow: 'hidden', position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap, padding: '8px 0', animation: 'none' }}>
        {items.map((item) => {
          if (item.type === 'image' && item.imageUrl) {
            return (
              <img
                key={item.id}
                src={item.imageUrl}
                alt={item.imageAlt || ''}
                style={{ height: '40px', width: 'auto', objectFit: 'contain', flexShrink: 0, ...getElementCSS(block.elementStyles, 'image') }}
              />
            );
          }
          if (item.type === 'icon' && item.content) {
            return (
              <span key={item.id} className="material-icons" style={{ fontSize: '2rem', flexShrink: 0, ...getElementCSS(block.elementStyles, 'icon') }}>
                {item.content}
              </span>
            );
          }
          return (
            <span key={item.id} style={{ whiteSpace: 'nowrap', flexShrink: 0, ...getElementCSS(block.elementStyles, 'text') }}>
              {item.content || '(empty)'}
            </span>
          );
        })}
        {/* Duplicate to show the scroll illusion */}
        {items.map((item) => {
          if (item.type === 'image' && item.imageUrl) {
            return <img key={`d-${item.id}`} src={item.imageUrl} alt="" style={{ height: '40px', width: 'auto', objectFit: 'contain', flexShrink: 0, opacity: 0.4, ...getElementCSS(block.elementStyles, 'image') }} />;
          }
          if (item.type === 'icon' && item.content) {
            return <span key={`d-${item.id}`} className="material-icons" style={{ fontSize: '2rem', flexShrink: 0, opacity: 0.4, ...getElementCSS(block.elementStyles, 'icon') }}>{item.content}</span>;
          }
          return <span key={`d-${item.id}`} style={{ whiteSpace: 'nowrap', flexShrink: 0, opacity: 0.4, ...getElementCSS(block.elementStyles, 'text') }}>{item.content || ''}</span>;
        })}
      </div>
      {isSelected && (
        <div style={{ position: 'absolute', top: '4px', right: '4px', background: 'rgba(0,0,0,0.5)', color: '#fff', fontSize: '10px', padding: '2px 8px', borderRadius: '8px' }}>
          {block.direction || 'left'} / {block.speed || 50}px/s / {items.length} items
        </div>
      )}
    </div>
  );
}
