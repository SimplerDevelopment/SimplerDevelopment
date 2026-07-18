'use client';

import { StoreBannerBlock } from '@/types/blocks';
import { useEffect, useState } from 'react';
import { getElementCSS } from '@/lib/utils/elementStyles';
import { useBranding } from '@/contexts/BrandingContext';
import { sanitizeRichHtml } from '@/lib/security/sanitize-html';

interface StoreBannerBlockRenderProps {
  block: StoreBannerBlock;
}

export function StoreBannerBlockRender({ block }: StoreBannerBlockRenderProps) {
  const branding = useBranding();
  const [timeLeft, setTimeLeft] = useState<{ days: number; hours: number; minutes: number; seconds: number } | null>(null);

  useEffect(() => {
    if (!block.countdownDate) return;

    const target = new Date(block.countdownDate).getTime();

    function updateCountdown() {
      const now = Date.now();
      const diff = target - now;
      if (diff <= 0) {
        setTimeLeft(null);
        return;
      }
      setTimeLeft({
        days: Math.floor(diff / (1000 * 60 * 60 * 24)),
        hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
        minutes: Math.floor((diff / (1000 * 60)) % 60),
        seconds: Math.floor((diff / 1000) % 60),
      });
    }

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [block.countdownDate]);

  const bgStyle: React.CSSProperties = {};

  if (block.backgroundStyle === 'image' && block.backgroundImage) {
    bgStyle.backgroundImage = `url(${block.backgroundImage})`;
    bgStyle.backgroundSize = 'cover';
    bgStyle.backgroundPosition = 'center';
  } else if (block.backgroundStyle === 'gradient' || !block.backgroundStyle) {
    const accent = block.accentColor || branding?.primaryColor || 'hsl(var(--primary))';
    bgStyle.background = `linear-gradient(135deg, ${accent}, ${accent}dd)`;
  } else if (block.backgroundStyle === 'solid') {
    bgStyle.backgroundColor = block.accentColor || branding?.primaryColor || 'hsl(var(--primary))';
  }

  return (
    <section>
      <div className="container mx-auto px-4">
        <div
          className={`relative overflow-hidden text-white ${!branding?.borderRadius ? 'rounded-2xl' : ''}`}
          style={{ ...bgStyle, ...(branding?.borderRadius ? { borderRadius: branding.borderRadius } : {}) }}
        >
          {block.backgroundStyle === 'image' && (
            <div className="absolute inset-0 bg-black/50" />
          )}
          <div className="relative z-10 px-8 py-12 md:py-16 text-center">
            <h2 className="text-3xl md:text-5xl font-bold mb-3" style={getElementCSS(block.elementStyles, 'title')} dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(block.title) }} />
            {block.subtitle && (
              <p className="text-lg md:text-xl opacity-90 mb-6 max-w-2xl mx-auto" style={getElementCSS(block.elementStyles, 'subtitle')} dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(block.subtitle) }} />
            )}

            {block.discountCode && (
              <div className="inline-flex items-center gap-3 bg-white/20 backdrop-blur-sm border border-white/30 rounded-lg px-6 py-3 mb-6">
                <span className="text-sm opacity-80">Use code:</span>
                <span className="font-mono font-bold text-xl tracking-wider" style={getElementCSS(block.elementStyles, 'discountCode')}>{block.discountCode}</span>
              </div>
            )}

            {timeLeft && (
              <div className="flex justify-center gap-4 mb-6">
                {[
                  { label: 'Days', value: timeLeft.days },
                  { label: 'Hours', value: timeLeft.hours },
                  { label: 'Minutes', value: timeLeft.minutes },
                  { label: 'Seconds', value: timeLeft.seconds },
                ].map((unit) => (
                  <div key={unit.label} className="bg-white/20 backdrop-blur-sm rounded-lg px-4 py-3 min-w-[70px]">
                    <div className="text-2xl md:text-3xl font-bold font-mono">
                      {String(unit.value).padStart(2, '0')}
                    </div>
                    <div className="text-xs opacity-80 uppercase tracking-wide">{unit.label}</div>
                  </div>
                ))}
              </div>
            )}

            {block.buttonText && block.buttonUrl && (
              <a
                href={block.buttonUrl}
                className={`inline-flex items-center px-8 py-3 bg-white text-gray-900 font-semibold hover:bg-white/90 transition-colors ${!branding?.borderRadius ? 'rounded-lg' : ''}`}
                style={{ ...getElementCSS(block.elementStyles, 'button'), ...(branding?.borderRadius ? { borderRadius: branding.borderRadius } : {}) }}
              >
                {block.buttonText}
              </a>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
