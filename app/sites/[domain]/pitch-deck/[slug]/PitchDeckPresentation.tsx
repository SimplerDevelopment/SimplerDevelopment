'use client';

import { useState, useEffect, useCallback } from 'react';

interface Slide {
  id: string;
  type: string;
  headline?: string;
  subheadline?: string;
  body?: string;
  bullets?: string[];
  stats?: { label: string; value: string }[];
  steps?: { title: string; description: string }[];
  members?: { name: string; role: string; image?: string }[];
  tiers?: { name: string; price: string; features: string[]; highlighted?: boolean }[];
  columns?: number;
}

interface Theme {
  primaryColor: string;
  accentColor: string;
  backgroundColor: string;
  textColor: string;
  headingFont: string;
  bodyFont: string;
  logo?: string;
}

interface Props {
  slides: Slide[];
  theme: Theme;
  title: string;
  isDraft?: boolean;
}

export default function PitchDeckPresentation({ slides, theme, title, isDraft }: Props) {
  const [current, setCurrent] = useState(0);
  const [direction, setDirection] = useState<'next' | 'prev'>('next');
  const [isAnimating, setIsAnimating] = useState(false);
  const [touchStart, setTouchStart] = useState<number | null>(null);

  const goTo = useCallback((idx: number, dir?: 'next' | 'prev') => {
    if (idx < 0 || idx >= slides.length || isAnimating) return;
    setDirection(dir || (idx > current ? 'next' : 'prev'));
    setIsAnimating(true);
    setCurrent(idx);
    setTimeout(() => setIsAnimating(false), 400);
  }, [current, slides.length, isAnimating]);

  const next = useCallback(() => goTo(current + 1, 'next'), [current, goTo]);
  const prev = useCallback(() => goTo(current - 1, 'prev'), [current, goTo]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ') {
        e.preventDefault();
        next();
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        prev();
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [next, prev]);

  function handleTouchStart(e: React.TouchEvent) {
    setTouchStart(e.touches[0].clientX);
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (touchStart === null) return;
    const diff = touchStart - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) {
      if (diff > 0) next();
      else prev();
    }
    setTouchStart(null);
  }

  if (slides.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: theme.backgroundColor, color: theme.textColor }}>
        <p style={{ fontFamily: theme.bodyFont }}>No slides in this presentation.</p>
      </div>
    );
  }

  const slide = slides[current];
  const fontsUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(theme.headingFont)}:wght@300;400;500;600;700;800&family=${encodeURIComponent(theme.bodyFont)}:wght@300;400;500;600&display=swap`;

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link href={fontsUrl} rel="stylesheet" />
      <link href="https://fonts.googleapis.com/icon?family=Material+Icons" rel="stylesheet" />

      <div
        className="min-h-screen w-full overflow-hidden relative select-none"
        style={{ backgroundColor: theme.backgroundColor, color: theme.textColor, fontFamily: theme.bodyFont }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* Draft banner */}
        {isDraft && (
          <div className="absolute top-0 left-0 right-0 z-30 bg-yellow-500/90 text-black text-center text-xs font-medium py-1 tracking-wide">
            DRAFT PREVIEW — This deck is not published
          </div>
        )}

        {/* Slide counter */}
        <div className="absolute top-6 left-8 z-20 text-sm opacity-40 tracking-widest font-light" style={{ fontFamily: theme.bodyFont }}>
          {String(current + 1).padStart(2, '0')}/{String(slides.length).padStart(2, '0')}
        </div>

        {/* SimplerDevelopment branding */}
        <div className="absolute top-5 right-8 z-20 flex items-center gap-2 opacity-30 hover:opacity-60 transition-opacity">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/iconLogo.png" alt="" className="h-6 w-6 brightness-0 invert" />
          <span className="text-xs tracking-wide font-light" style={{ color: theme.textColor, fontFamily: theme.bodyFont }}>
            <b className="font-semibold">Simpler</b> Development
          </span>
        </div>

        {/* Navigation hint - only on first slide */}
        {current === 0 && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 text-xs opacity-20 tracking-wide" style={{ fontFamily: theme.bodyFont }}>
            Press arrow keys or spacebar &middot; Swipe on mobile
          </div>
        )}

        {/* Prev/Next buttons */}
        {current > 0 && (
          <button onClick={prev}
            className="absolute left-4 top-1/2 -translate-y-1/2 z-20 p-3 rounded-full transition-all opacity-0 hover:opacity-60"
            style={{ color: theme.textColor }}>
            <span className="material-icons text-3xl">chevron_left</span>
          </button>
        )}
        {current < slides.length - 1 && (
          <button onClick={next}
            className="absolute right-4 top-1/2 -translate-y-1/2 z-20 p-3 rounded-full transition-all opacity-0 hover:opacity-60"
            style={{ color: theme.textColor }}>
            <span className="material-icons text-3xl">chevron_right</span>
          </button>
        )}

        {/* Progress bar */}
        <div className="absolute bottom-0 left-0 right-0 h-[2px] z-20" style={{ backgroundColor: theme.textColor + '10' }}>
          <div className="h-full transition-all duration-500 ease-out" style={{
            width: `${((current + 1) / slides.length) * 100}%`,
            backgroundColor: theme.accentColor,
          }} />
        </div>

        {/* Slide content */}
        <div
          className="min-h-screen flex items-center justify-center"
          style={{
            animation: isAnimating
              ? `slideIn${direction === 'next' ? 'Left' : 'Right'} 0.4s ease-out`
              : undefined,
          }}
        >
          <SlideRenderer slide={slide} theme={theme} index={current} total={slides.length} />
        </div>
      </div>

      <style>{`
        @keyframes slideInLeft {
          from { opacity: 0; transform: translateX(60px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes slideInRight {
          from { opacity: 0; transform: translateX(-60px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </>
  );
}

/* ─── Slide type renderers ──────────────────────────────────────────────── */

function SlideRenderer({ slide, theme, index, total }: { slide: Slide; theme: Theme; index: number; total: number }) {
  const h = theme.headingFont;
  const b = theme.bodyFont;
  const ac = theme.accentColor;
  const tc = theme.textColor;
  const bg = theme.backgroundColor;

  // Grid helper: uses slide.columns if set, otherwise auto-detects
  function gridCols(itemCount: number, fallbackMap?: Record<number, string>): string {
    if (slide.columns) {
      const c = slide.columns;
      return `grid-cols-${Math.min(c, 2)} md:grid-cols-${c}`;
    }
    if (fallbackMap && fallbackMap[itemCount]) return fallbackMap[itemCount];
    if (itemCount <= 2) return 'grid-cols-1 md:grid-cols-2';
    if (itemCount <= 3) return 'grid-cols-1 md:grid-cols-3';
    if (itemCount <= 4) return 'grid-cols-2 md:grid-cols-4';
    return 'grid-cols-2 md:grid-cols-3';
  }

  // For centering the last row when items don't fill the grid, wrap in flex
  function needsFlexWrap(itemCount: number): boolean {
    const cols = slide.columns || (itemCount <= 3 ? 3 : itemCount <= 4 ? 4 : 3);
    return itemCount % cols !== 0;
  }

  // ── Cover ────────────────────────────────────────────────────────────
  if (slide.type === 'cover') {
    return (
      <div className="w-full min-h-screen flex items-center relative overflow-hidden">
        {/* Large decorative accent circle */}
        <div className="absolute -right-40 -top-40 w-[700px] h-[700px] rounded-full opacity-[0.07] pointer-events-none"
          style={{ background: `radial-gradient(circle, ${ac}, transparent 70%)` }} />
        <div className="absolute -left-20 -bottom-20 w-[400px] h-[400px] rounded-full opacity-[0.04] pointer-events-none"
          style={{ background: `radial-gradient(circle, ${ac}, transparent 70%)` }} />
        {/* Subtle grid pattern */}
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none"
          style={{ backgroundImage: `linear-gradient(${tc}15 1px, transparent 1px), linear-gradient(90deg, ${tc}15 1px, transparent 1px)`, backgroundSize: '60px 60px' }} />

        <div className="relative z-10 w-full max-w-5xl mx-auto px-12 md:px-20 py-20">
          {/* Accent line */}
          <div className="w-16 h-1 rounded-full mb-8" style={{ backgroundColor: ac }} />
          <h1 className="text-5xl md:text-7xl lg:text-8xl font-extrabold leading-[1.05] tracking-tight"
            style={{ fontFamily: h, color: tc }}>
            {slide.headline || 'Untitled'}
          </h1>
          {slide.subheadline && (
            <p className="text-xl md:text-2xl mt-8 max-w-2xl leading-relaxed font-light opacity-60"
              style={{ fontFamily: b }}>
              {slide.subheadline}
            </p>
          )}
          {slide.body && (
            <p className="text-base mt-6 max-w-xl leading-relaxed opacity-40" style={{ fontFamily: b }}>
              {slide.body}
            </p>
          )}
          {/* Decorative bottom-right corner marker */}
          <div className="absolute bottom-16 right-12 md:right-20 flex items-center gap-3 opacity-30">
            <div className="h-px w-12" style={{ backgroundColor: ac }} />
            <span className="text-xs uppercase tracking-[0.25em] font-medium" style={{ fontFamily: b, color: ac }}>
              {String(index + 1).padStart(2, '0')}
            </span>
          </div>
        </div>
      </div>
    );
  }

  // ── Problem ──────────────────────────────────────────────────────────
  if (slide.type === 'problem') {
    return (
      <div className="w-full min-h-screen flex items-center relative">
        {/* Dramatic red/warm accent glow */}
        <div className="absolute right-0 top-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full opacity-[0.06] pointer-events-none"
          style={{ background: `radial-gradient(circle, #ef4444, transparent 70%)` }} />

        <div className="relative z-10 w-full max-w-6xl mx-auto px-12 md:px-20 py-20 grid grid-cols-1 md:grid-cols-5 gap-12 items-center">
          {/* Left: headline + body */}
          <div className="md:col-span-3 space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium uppercase tracking-wider"
              style={{ backgroundColor: '#ef444420', color: '#f87171' }}>
              <span className="material-icons text-sm">warning</span>
              The Challenge
            </div>
            <h2 className="text-4xl md:text-5xl font-bold leading-tight" style={{ fontFamily: h }}>
              {slide.headline}
            </h2>
            {slide.body && (
              <p className="text-lg leading-relaxed opacity-60 max-w-lg" style={{ fontFamily: b }}>{slide.body}</p>
            )}
          </div>
          {/* Right: bullet cards */}
          {slide.bullets && slide.bullets.length > 0 && (
            <div className="md:col-span-2 space-y-3">
              {slide.bullets.map((bullet, i) => (
                <div key={i} className="p-4 rounded-xl flex items-start gap-3"
                  style={{ backgroundColor: tc + '08', borderLeft: `3px solid ${ac}` }}>
                  <span className="text-lg font-bold opacity-30 shrink-0" style={{ fontFamily: h, color: ac }}>
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span className="text-sm leading-relaxed opacity-80" style={{ fontFamily: b }}>{bullet}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Solution ─────────────────────────────────────────────────────────
  if (slide.type === 'solution') {
    return (
      <div className="w-full min-h-screen flex items-center relative">
        <div className="absolute left-0 top-0 w-[600px] h-[600px] rounded-full opacity-[0.06] pointer-events-none"
          style={{ background: `radial-gradient(circle, ${ac}, transparent 70%)` }} />

        <div className="relative z-10 w-full max-w-6xl mx-auto px-12 md:px-20 py-20 grid grid-cols-1 md:grid-cols-2 gap-16 items-center">
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium uppercase tracking-wider"
              style={{ backgroundColor: ac + '20', color: ac }}>
              <span className="material-icons text-sm">lightbulb</span>
              The Solution
            </div>
            <h2 className="text-4xl md:text-5xl font-bold leading-tight" style={{ fontFamily: h }}>
              {slide.headline}
            </h2>
            {slide.subheadline && (
              <p className="text-lg leading-relaxed opacity-60" style={{ fontFamily: b }}>{slide.subheadline}</p>
            )}
            {slide.body && (
              <p className="text-base leading-relaxed opacity-50" style={{ fontFamily: b }}>{slide.body}</p>
            )}
          </div>
          {slide.bullets && slide.bullets.length > 0 && (
            <div className="space-y-4">
              {slide.bullets.map((bullet, i) => (
                <div key={i} className="flex items-start gap-4 p-5 rounded-2xl transition-colors"
                  style={{ backgroundColor: tc + '06' }}>
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-sm font-bold"
                    style={{ backgroundColor: ac + '20', color: ac }}>
                    <span className="material-icons text-lg">check</span>
                  </div>
                  <span className="text-base leading-relaxed opacity-80 pt-2" style={{ fontFamily: b }}>{bullet}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Features ─────────────────────────────────────────────────────────
  if (slide.type === 'features') {
    const featureIcons = ['rocket_launch', 'auto_awesome', 'speed', 'psychology', 'hub', 'security', 'trending_up', 'bolt'];
    return (
      <div className="w-full min-h-screen flex items-center relative">
        <div className="relative z-10 w-full max-w-6xl mx-auto px-12 md:px-20 py-20 space-y-12">
          <div className="text-center space-y-4 max-w-3xl mx-auto">
            {slide.headline && (
              <h2 className="text-4xl md:text-5xl font-bold" style={{ fontFamily: h }}>{slide.headline}</h2>
            )}
            {slide.subheadline && (
              <p className="text-lg opacity-50" style={{ fontFamily: b }}>{slide.subheadline}</p>
            )}
          </div>
          {slide.bullets && slide.bullets.length > 0 && (() => {
            const cols = slide.columns || (slide.bullets!.length <= 3 ? 3 : slide.bullets!.length <= 4 ? 2 : 3);
            const w = `calc(${100 / cols}% - ${(cols - 1) * 20 / cols}px)`;
            return (
              <div className="flex flex-wrap justify-center gap-5">
                {slide.bullets!.map((bullet, i) => (
                  <div key={i} className="group p-6 rounded-2xl relative overflow-hidden shrink-0"
                    style={{ backgroundColor: tc + '06', border: `1px solid ${tc}10`, width: w, minWidth: '180px' }}>
                    <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ backgroundColor: ac + '40' }} />
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-4"
                      style={{ backgroundColor: ac + '15', color: ac }}>
                      <span className="material-icons text-xl">{featureIcons[i % featureIcons.length]}</span>
                    </div>
                    <p className="text-sm leading-relaxed opacity-80" style={{ fontFamily: b }}>{bullet}</p>
                  </div>
                ))}
              </div>
            );
          })()}
          {slide.body && (
            <p className="text-center text-base opacity-40 max-w-2xl mx-auto" style={{ fontFamily: b }}>{slide.body}</p>
          )}
        </div>
      </div>
    );
  }

  // ── Metrics ──────────────────────────────────────────────────────────
  if (slide.type === 'metrics' && slide.stats && slide.stats.length > 0) {
    return (
      <div className="w-full min-h-screen flex items-center relative">
        {/* Accent glow behind stats */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] rounded-full opacity-[0.05] pointer-events-none"
          style={{ background: `radial-gradient(ellipse, ${ac}, transparent 70%)` }} />

        <div className="relative z-10 w-full max-w-6xl mx-auto px-12 md:px-20 py-20 space-y-16">
          <div className="text-center space-y-4">
            {slide.headline && (
              <h2 className="text-4xl md:text-5xl font-bold" style={{ fontFamily: h }}>{slide.headline}</h2>
            )}
            {slide.subheadline && (
              <p className="text-lg opacity-50 max-w-2xl mx-auto" style={{ fontFamily: b }}>{slide.subheadline}</p>
            )}
          </div>
          <div className="flex flex-wrap justify-center gap-8">
            {slide.stats.map((stat, i) => {
              const cols = slide.columns || (slide.stats!.length <= 3 ? 3 : 4);
              const w = `calc(${100 / cols}% - ${(cols - 1) * 32 / cols}px)`;
              return (
                <div key={i} className="text-center p-8 rounded-2xl relative shrink-0"
                  style={{ backgroundColor: tc + '05', border: `1px solid ${tc}08`, width: w, minWidth: '200px' }}>
                  <div className="text-5xl md:text-6xl font-extrabold tracking-tight"
                    style={{ color: ac, fontFamily: h }}>
                    {stat.value}
                  </div>
                  <div className="mt-3 text-sm uppercase tracking-wider opacity-50 font-medium" style={{ fontFamily: b }}>
                    {stat.label}
                  </div>
                  <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-12 h-[2px] rounded-full" style={{ backgroundColor: ac + '40' }} />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // ── Process ──────────────────────────────────────────────────────────
  if (slide.type === 'process' && slide.steps && slide.steps.length > 0) {
    return (
      <div className="w-full min-h-screen flex items-center relative">
        <div className="relative z-10 w-full max-w-6xl mx-auto px-12 md:px-20 py-20 space-y-12">
          <div className="space-y-4">
            {slide.headline && (
              <h2 className="text-4xl md:text-5xl font-bold" style={{ fontFamily: h }}>{slide.headline}</h2>
            )}
            {slide.subheadline && (
              <p className="text-lg opacity-50 max-w-xl" style={{ fontFamily: b }}>{slide.subheadline}</p>
            )}
          </div>
          <div className="relative">
            {/* Connecting line */}
            <div className="hidden md:block absolute top-12 left-0 right-0 h-px" style={{ backgroundColor: tc + '10' }} />
            <div className={`grid gap-6 ${slide.steps.length <= 3 ? 'md:grid-cols-3' : slide.steps.length <= 4 ? 'md:grid-cols-4' : 'md:grid-cols-3'}`}>
              {slide.steps.map((step, i) => (
                <div key={i} className="relative">
                  {/* Step number circle */}
                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold mb-5 relative z-10"
                    style={{ backgroundColor: ac, color: bg, fontFamily: h }}>
                    {i + 1}
                  </div>
                  <div className="p-5 rounded-2xl" style={{ backgroundColor: tc + '05', border: `1px solid ${tc}08` }}>
                    <h3 className="text-lg font-semibold mb-2" style={{ fontFamily: h }}>{step.title}</h3>
                    <p className="text-sm opacity-60 leading-relaxed" style={{ fontFamily: b }}>{step.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Team ─────────────────────────────────────────────────────────────
  if (slide.type === 'team' && slide.members && slide.members.length > 0) {
    const gradients = [
      `linear-gradient(135deg, ${ac}40, ${ac}10)`,
      `linear-gradient(135deg, #8b5cf640, #8b5cf610)`,
      `linear-gradient(135deg, #10b98140, #10b98110)`,
      `linear-gradient(135deg, #f5972040, #f5972010)`,
      `linear-gradient(135deg, #ef444440, #ef444410)`,
      `linear-gradient(135deg, #ec489940, #ec489910)`,
    ];
    return (
      <div className="w-full min-h-screen flex items-center relative">
        <div className="relative z-10 w-full max-w-6xl mx-auto px-12 md:px-20 py-20 space-y-12">
          <div className="text-center space-y-4">
            {slide.headline && (
              <h2 className="text-4xl md:text-5xl font-bold" style={{ fontFamily: h }}>{slide.headline}</h2>
            )}
            {slide.subheadline && (
              <p className="text-lg opacity-50 max-w-2xl mx-auto" style={{ fontFamily: b }}>{slide.subheadline}</p>
            )}
          </div>
          <div className={`grid gap-6 justify-center ${slide.members.length <= 3 ? 'md:grid-cols-3 max-w-4xl mx-auto' : slide.members.length <= 4 ? 'grid-cols-2 md:grid-cols-4' : 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4'}`}>
            {slide.members.map((member, i) => (
              <div key={i} className="text-center p-6 rounded-2xl" style={{ backgroundColor: tc + '05' }}>
                <div className="w-20 h-20 rounded-2xl mx-auto mb-4 flex items-center justify-center text-2xl font-bold"
                  style={{ background: gradients[i % gradients.length], fontFamily: h }}>
                  {member.name.split(' ').map(n => n[0]).join('')}
                </div>
                <div className="font-semibold text-base" style={{ fontFamily: h }}>{member.name}</div>
                <div className="text-sm opacity-50 mt-1" style={{ fontFamily: b, color: ac }}>{member.role}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── Pricing ──────────────────────────────────────────────────────────
  if (slide.type === 'pricing' && slide.tiers && slide.tiers.length > 0) {
    return (
      <div className="w-full min-h-screen flex items-center relative">
        <div className="relative z-10 w-full max-w-6xl mx-auto px-12 md:px-20 py-20 space-y-12">
          <div className="text-center space-y-4">
            {slide.headline && (
              <h2 className="text-4xl md:text-5xl font-bold" style={{ fontFamily: h }}>{slide.headline}</h2>
            )}
            {slide.subheadline && (
              <p className="text-lg opacity-50 max-w-2xl mx-auto" style={{ fontFamily: b }}>{slide.subheadline}</p>
            )}
          </div>
          <div className={`grid gap-6 ${slide.tiers.length <= 3 ? 'md:grid-cols-3' : 'md:grid-cols-2 lg:grid-cols-4'}`}>
            {slide.tiers.map((tier, i) => {
              const highlighted = tier.highlighted || (slide.tiers!.length === 3 && i === 1);
              return (
                <div key={i} className="p-6 rounded-2xl text-left relative overflow-hidden flex flex-col"
                  style={{
                    backgroundColor: highlighted ? tc + '10' : tc + '05',
                    border: `1px solid ${highlighted ? ac : tc + '10'}`,
                  }}>
                  {highlighted && (
                    <div className="absolute top-0 left-0 right-0 h-1" style={{ backgroundColor: ac }} />
                  )}
                  {highlighted && (
                    <span className="inline-block self-start px-2.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider mb-3"
                      style={{ backgroundColor: ac + '20', color: ac }}>
                      Popular
                    </span>
                  )}
                  <div className="font-semibold text-lg mb-1" style={{ fontFamily: h }}>{tier.name}</div>
                  <div className="text-3xl font-extrabold mb-5" style={{ color: ac, fontFamily: h }}>{tier.price}</div>
                  <ul className="space-y-2.5 flex-1">
                    {tier.features.map((f, j) => (
                      <li key={j} className="flex items-start gap-2.5 text-sm" style={{ fontFamily: b }}>
                        <span className="material-icons text-sm mt-0.5 shrink-0" style={{ color: ac }}>check_circle</span>
                        <span className="opacity-70">{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // ── Testimonial ──────────────────────────────────────────────────────
  if (slide.type === 'testimonial') {
    return (
      <div className="w-full min-h-screen flex items-center relative">
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full opacity-[0.04] pointer-events-none"
          style={{ background: `radial-gradient(circle, ${ac}, transparent 70%)` }} />

        <div className="relative z-10 w-full max-w-4xl mx-auto px-12 md:px-20 py-20 text-center space-y-8">
          {/* Large decorative quote mark */}
          <div className="text-[120px] leading-none opacity-10 -mb-16" style={{ color: ac, fontFamily: 'Georgia, serif' }}>&ldquo;</div>
          {slide.body && (
            <blockquote className="text-2xl md:text-4xl font-light leading-relaxed" style={{ fontFamily: h }}>
              {slide.body}
            </blockquote>
          )}
          {slide.headline && (
            <div className="pt-4">
              <div className="w-12 h-px mx-auto mb-4" style={{ backgroundColor: ac }} />
              <div className="font-semibold text-lg" style={{ color: ac, fontFamily: h }}>{slide.headline}</div>
              {slide.subheadline && (
                <div className="text-sm opacity-40 mt-1" style={{ fontFamily: b }}>{slide.subheadline}</div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── CTA ──────────────────────────────────────────────────────────────
  if (slide.type === 'cta') {
    return (
      <div className="w-full min-h-screen flex items-center relative overflow-hidden">
        {/* Bold accent background */}
        <div className="absolute inset-0 opacity-[0.06] pointer-events-none"
          style={{ background: `radial-gradient(ellipse at center, ${ac}, transparent 60%)` }} />
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none"
          style={{ backgroundImage: `linear-gradient(${tc}15 1px, transparent 1px), linear-gradient(90deg, ${tc}15 1px, transparent 1px)`, backgroundSize: '60px 60px' }} />

        <div className="relative z-10 w-full max-w-4xl mx-auto px-12 md:px-20 py-20 text-center space-y-8">
          {slide.headline && (
            <h2 className="text-5xl md:text-7xl font-extrabold leading-tight tracking-tight" style={{ fontFamily: h }}>
              {slide.headline}
            </h2>
          )}
          {slide.subheadline && (
            <p className="text-xl md:text-2xl opacity-60 max-w-2xl mx-auto font-light leading-relaxed" style={{ fontFamily: b }}>
              {slide.subheadline}
            </p>
          )}
          {slide.body && (
            <p className="text-base opacity-40 max-w-lg mx-auto" style={{ fontFamily: b }}>{slide.body}</p>
          )}
          {slide.bullets && slide.bullets.length > 0 && (
            <div className="flex flex-wrap justify-center gap-3 pt-6">
              {slide.bullets.map((bull, i) => (
                <span key={i} className="px-6 py-3 rounded-full text-sm font-medium"
                  style={{ backgroundColor: ac + '15', color: ac, border: `1px solid ${ac}30`, fontFamily: b }}>
                  {bull}
                </span>
              ))}
            </div>
          )}
          {/* Decorative accent bar */}
          <div className="w-20 h-1 rounded-full mx-auto mt-4" style={{ backgroundColor: ac }} />
        </div>
      </div>
    );
  }

  // ── Custom / Default ─────────────────────────────────────────────────
  return (
    <div className="w-full min-h-screen flex items-center relative">
      <div className="relative z-10 w-full max-w-6xl mx-auto px-12 md:px-20 py-20">
        {/* Two-column if we have bullets, single column otherwise */}
        {slide.bullets && slide.bullets.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-16 items-center">
            <div className="space-y-6">
              {slide.headline && (
                <h2 className="text-4xl md:text-5xl font-bold leading-tight" style={{ fontFamily: h }}>
                  {slide.headline}
                </h2>
              )}
              {slide.subheadline && (
                <p className="text-lg opacity-50" style={{ fontFamily: b }}>{slide.subheadline}</p>
              )}
              {slide.body && (
                <p className="text-base opacity-50 leading-relaxed" style={{ fontFamily: b }}>{slide.body}</p>
              )}
            </div>
            <div className="space-y-3">
              {slide.bullets.map((bullet, i) => (
                <div key={i} className="flex items-start gap-4 p-4 rounded-xl"
                  style={{ backgroundColor: tc + '05' }}>
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-xs font-bold"
                    style={{ backgroundColor: ac + '20', color: ac, fontFamily: h }}>
                    {i + 1}
                  </div>
                  <span className="text-sm leading-relaxed opacity-80 pt-1" style={{ fontFamily: b }}>{bullet}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="text-center max-w-3xl mx-auto space-y-6">
            {slide.headline && (
              <h2 className="text-4xl md:text-5xl font-bold" style={{ fontFamily: h }}>{slide.headline}</h2>
            )}
            {slide.subheadline && (
              <p className="text-xl opacity-60" style={{ fontFamily: b }}>{slide.subheadline}</p>
            )}
            {slide.body && (
              <p className="text-base opacity-50 leading-relaxed max-w-2xl mx-auto" style={{ fontFamily: b }}>{slide.body}</p>
            )}
          </div>
        )}
        {slide.stats && slide.stats.length > 0 && (
          <div className="flex justify-center gap-10 mt-12 pt-8" style={{ borderTop: `1px solid ${tc}10` }}>
            {slide.stats.map((stat, i) => (
              <div key={i} className="text-center">
                <div className="text-4xl font-extrabold" style={{ color: ac, fontFamily: h }}>{stat.value}</div>
                <div className="text-xs uppercase tracking-wider opacity-40 mt-2 font-medium" style={{ fontFamily: b }}>{stat.label}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
