'use client';

import { StoreBannerBlock } from '@/types/blocks';

interface StoreBannerBlockPreviewProps {
  block: StoreBannerBlock;
  isSelected: boolean;
  onChange: (updates: Partial<StoreBannerBlock>) => void;
}

export function StoreBannerBlockPreview({ block, isSelected, onChange }: StoreBannerBlockPreviewProps) {
  const bgStyle: React.CSSProperties = {};

  if (block.backgroundStyle === 'image' && block.backgroundImage) {
    bgStyle.backgroundImage = `url(${block.backgroundImage})`;
    bgStyle.backgroundSize = 'cover';
    bgStyle.backgroundPosition = 'center';
  } else if (block.backgroundStyle === 'gradient' || !block.backgroundStyle) {
    const accent = block.accentColor || 'hsl(var(--primary))';
    bgStyle.background = `linear-gradient(135deg, ${accent}, ${accent}dd)`;
  } else if (block.backgroundStyle === 'solid') {
    bgStyle.backgroundColor = block.accentColor || 'hsl(var(--primary))';
  }

  return (
    <div className="py-8 my-8 px-6">
      <div className="relative rounded-2xl overflow-hidden text-white" style={bgStyle}>
        {block.backgroundStyle === 'image' && (
          <div className="absolute inset-0 bg-black/50" />
        )}
        <div className="relative z-10 px-8 py-12 md:py-16 text-center">
          <input
            type="text"
            value={block.title || ''}
            onChange={(e) => onChange({ title: e.target.value })}
            onClick={(e) => e.stopPropagation()}
            className="text-3xl md:text-5xl font-bold mb-3 w-full bg-transparent border-none focus:outline-none focus:border-b-2 border-white/50 text-center text-white placeholder-white/50"
            placeholder="Sale Title"
          />
          {(block.subtitle || isSelected) && (
            <input
              type="text"
              value={block.subtitle || ''}
              onChange={(e) => onChange({ subtitle: e.target.value })}
              onClick={(e) => e.stopPropagation()}
              className="text-lg md:text-xl mb-6 max-w-2xl mx-auto w-full bg-transparent border-none focus:outline-none focus:border-b border-white/30 text-center text-white/90 placeholder-white/40"
              placeholder="Add a subtitle"
            />
          )}

          {block.discountCode && (
            <div className="inline-flex items-center gap-3 bg-white/20 backdrop-blur-sm border border-white/30 rounded-lg px-6 py-3 mb-6">
              <span className="text-sm opacity-80">Use code:</span>
              <span className="font-mono font-bold text-xl tracking-wider">{block.discountCode}</span>
            </div>
          )}

          {block.countdownDate && (
            <div className="flex justify-center gap-4 mb-6">
              {['Days', 'Hours', 'Min', 'Sec'].map((label) => (
                <div key={label} className="bg-white/20 backdrop-blur-sm rounded-lg px-4 py-3 min-w-[70px]">
                  <div className="text-2xl md:text-3xl font-bold font-mono">00</div>
                  <div className="text-xs opacity-80 uppercase tracking-wide">{label}</div>
                </div>
              ))}
            </div>
          )}

          {block.buttonText && (
            <div className="inline-flex items-center px-8 py-3 bg-white text-gray-900 font-semibold rounded-lg">
              {block.buttonText}
            </div>
          )}
        </div>
      </div>

      <p className="text-center text-xs text-muted-foreground mt-4 italic">
        Preview: Store promotional banner. Countdown timer runs live on the published site.
      </p>
    </div>
  );
}
