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
}

export default function PitchDeckPresentation({ slides, theme, title }: Props) {
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

  // Google Fonts URL for the theme fonts
  const fontsUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(theme.headingFont)}:wght@400;600;700&family=${encodeURIComponent(theme.bodyFont)}:wght@300;400;500;600&display=swap`;

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
        {/* Slide counter */}
        <div className="absolute top-6 left-8 z-20 text-sm opacity-50 tracking-widest" style={{ fontFamily: theme.bodyFont }}>
          {String(current + 1).padStart(2, '0')}/{String(slides.length).padStart(2, '0')}
        </div>

        {/* SimplerDevelopment branding */}
        <div className="absolute top-5 right-8 z-20 flex items-center gap-2 opacity-40 hover:opacity-70 transition-opacity">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/iconLogo.png" alt="" className="h-7 w-7 brightness-0 invert" />
          <span className="text-xs tracking-wide" style={{ color: theme.textColor, fontFamily: theme.bodyFont }}>
            <b>Simpler</b> Development
          </span>
        </div>

        {/* Navigation hint */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 text-xs opacity-30" style={{ fontFamily: theme.bodyFont }}>
          Press arrow keys or spacebar &middot; Swipe or tap arrows on mobile
        </div>

        {/* Prev/Next buttons */}
        {current > 0 && (
          <button
            onClick={prev}
            className="absolute left-4 top-1/2 -translate-y-1/2 z-20 p-2 rounded-full transition-opacity opacity-30 hover:opacity-80"
            style={{ color: theme.textColor }}
          >
            <span className="material-icons text-3xl">chevron_left</span>
          </button>
        )}
        {current < slides.length - 1 && (
          <button
            onClick={next}
            className="absolute right-4 top-1/2 -translate-y-1/2 z-20 p-2 rounded-full transition-opacity opacity-30 hover:opacity-80"
            style={{ color: theme.textColor }}
          >
            <span className="material-icons text-3xl">chevron_right</span>
          </button>
        )}

        {/* Slide dots */}
        <div className="absolute bottom-6 right-8 z-20 flex items-center gap-1.5">
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => goTo(i)}
              className="w-2 h-2 rounded-full transition-all duration-300"
              style={{
                backgroundColor: i === current ? theme.accentColor : theme.textColor,
                opacity: i === current ? 1 : 0.2,
                transform: i === current ? 'scale(1.3)' : 'scale(1)',
              }}
            />
          ))}
        </div>

        {/* Slide content */}
        <div
          className="min-h-screen flex items-center justify-center px-8 md:px-16 lg:px-24 py-20 transition-all duration-400"
          style={{
            animation: isAnimating
              ? `slideIn${direction === 'next' ? 'Left' : 'Right'} 0.4s ease-out`
              : undefined,
          }}
        >
          <SlideRenderer slide={slide} theme={theme} />
        </div>

        {/* Decorative elements */}
        <div
          className="absolute top-0 right-0 w-72 h-72 rounded-full blur-[120px] opacity-10 pointer-events-none"
          style={{ backgroundColor: theme.accentColor }}
        />
        <div
          className="absolute bottom-0 left-0 w-96 h-96 rounded-full blur-[150px] opacity-5 pointer-events-none"
          style={{ backgroundColor: theme.primaryColor }}
        />
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

function SlideRenderer({ slide, theme }: { slide: Slide; theme: Theme }) {
  if (slide.type === 'cover') {
    return (
      <div className="text-center max-w-4xl space-y-6">
        {theme.logo && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={theme.logo} alt="" className="h-16 mx-auto mb-8 object-contain" />
        )}
        <h1 className="text-5xl md:text-7xl font-bold leading-tight" style={{ fontFamily: theme.headingFont, color: theme.accentColor }}>
          {slide.headline || 'Untitled'}
        </h1>
        {slide.subheadline && (
          <p className="text-xl md:text-2xl opacity-70 max-w-2xl mx-auto leading-relaxed" style={{ fontFamily: theme.bodyFont }}>
            {slide.subheadline}
          </p>
        )}
        {slide.body && (
          <p className="text-base opacity-50 max-w-xl mx-auto" style={{ fontFamily: theme.bodyFont }}>
            {slide.body}
          </p>
        )}
      </div>
    );
  }

  if (slide.type === 'metrics' && slide.stats && slide.stats.length > 0) {
    return (
      <div className="max-w-5xl w-full space-y-12 text-center">
        {slide.headline && (
          <h2 className="text-3xl md:text-5xl font-bold" style={{ fontFamily: theme.headingFont, color: theme.accentColor }}>
            {slide.headline}
          </h2>
        )}
        {slide.subheadline && (
          <p className="text-lg opacity-60 max-w-2xl mx-auto" style={{ fontFamily: theme.bodyFont }}>{slide.subheadline}</p>
        )}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {slide.stats.map((stat, i) => (
            <div key={i} className="space-y-2">
              <div className="text-4xl md:text-5xl font-bold" style={{ color: theme.accentColor, fontFamily: theme.headingFont }}>
                {stat.value}
              </div>
              <div className="text-sm opacity-60 uppercase tracking-wider" style={{ fontFamily: theme.bodyFont }}>
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (slide.type === 'process' && slide.steps && slide.steps.length > 0) {
    return (
      <div className="max-w-5xl w-full space-y-12 text-center">
        {slide.headline && (
          <h2 className="text-3xl md:text-5xl font-bold" style={{ fontFamily: theme.headingFont, color: theme.accentColor }}>
            {slide.headline}
          </h2>
        )}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-left">
          {slide.steps.map((step, i) => (
            <div key={i} className="space-y-3 p-6 rounded-2xl" style={{ border: `1px solid ${theme.textColor}15` }}>
              <div className="text-3xl font-bold opacity-30" style={{ color: theme.accentColor, fontFamily: theme.headingFont }}>
                {String(i + 1).padStart(2, '0')}
              </div>
              <h3 className="text-xl font-semibold" style={{ fontFamily: theme.headingFont }}>
                {step.title}
              </h3>
              <p className="text-sm opacity-60 leading-relaxed" style={{ fontFamily: theme.bodyFont }}>
                {step.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (slide.type === 'team' && slide.members && slide.members.length > 0) {
    return (
      <div className="max-w-5xl w-full space-y-12 text-center">
        {slide.headline && (
          <h2 className="text-3xl md:text-5xl font-bold" style={{ fontFamily: theme.headingFont, color: theme.accentColor }}>
            {slide.headline}
          </h2>
        )}
        {slide.subheadline && (
          <p className="text-lg opacity-60 max-w-2xl mx-auto" style={{ fontFamily: theme.bodyFont }}>{slide.subheadline}</p>
        )}
        <div className="flex flex-wrap justify-center gap-8">
          {slide.members.map((member, i) => (
            <div key={i} className="text-center space-y-3 w-40">
              <div className="w-24 h-24 rounded-full mx-auto flex items-center justify-center text-3xl font-bold"
                style={{ backgroundColor: theme.accentColor + '25', color: theme.accentColor, fontFamily: theme.headingFont }}>
                {member.name.split(' ').map(n => n[0]).join('')}
              </div>
              <div>
                <div className="font-semibold" style={{ fontFamily: theme.headingFont }}>{member.name}</div>
                <div className="text-sm opacity-50" style={{ fontFamily: theme.bodyFont }}>{member.role}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (slide.type === 'pricing' && slide.tiers && slide.tiers.length > 0) {
    return (
      <div className="max-w-5xl w-full space-y-12 text-center">
        {slide.headline && (
          <h2 className="text-3xl md:text-5xl font-bold" style={{ fontFamily: theme.headingFont, color: theme.accentColor }}>
            {slide.headline}
          </h2>
        )}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {slide.tiers.map((tier, i) => (
            <div key={i} className="p-6 rounded-2xl text-left space-y-4"
              style={{
                border: `1px solid ${tier.highlighted ? theme.accentColor : theme.textColor + '15'}`,
                backgroundColor: tier.highlighted ? theme.accentColor + '10' : 'transparent',
              }}>
              <div className="font-semibold text-lg" style={{ fontFamily: theme.headingFont }}>{tier.name}</div>
              <div className="text-3xl font-bold" style={{ color: theme.accentColor, fontFamily: theme.headingFont }}>{tier.price}</div>
              <ul className="space-y-2">
                {tier.features.map((f, j) => (
                  <li key={j} className="flex items-start gap-2 text-sm opacity-70" style={{ fontFamily: theme.bodyFont }}>
                    <span style={{ color: theme.accentColor }} className="mt-0.5">&#10003;</span>
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (slide.type === 'testimonial') {
    return (
      <div className="max-w-3xl text-center space-y-8">
        <div className="text-6xl opacity-20" style={{ color: theme.accentColor, fontFamily: theme.headingFont }}>&ldquo;</div>
        {slide.body && (
          <blockquote className="text-2xl md:text-3xl font-light leading-relaxed italic" style={{ fontFamily: theme.headingFont }}>
            {slide.body}
          </blockquote>
        )}
        {slide.headline && (
          <div>
            <div className="font-semibold" style={{ color: theme.accentColor, fontFamily: theme.headingFont }}>{slide.headline}</div>
            {slide.subheadline && (
              <div className="text-sm opacity-50 mt-1" style={{ fontFamily: theme.bodyFont }}>{slide.subheadline}</div>
            )}
          </div>
        )}
      </div>
    );
  }

  if (slide.type === 'cta') {
    return (
      <div className="max-w-3xl text-center space-y-8">
        {slide.headline && (
          <h2 className="text-4xl md:text-6xl font-bold leading-tight" style={{ fontFamily: theme.headingFont, color: theme.accentColor }}>
            {slide.headline}
          </h2>
        )}
        {slide.subheadline && (
          <p className="text-xl opacity-70 max-w-xl mx-auto" style={{ fontFamily: theme.bodyFont }}>
            {slide.subheadline}
          </p>
        )}
        {slide.body && (
          <p className="text-base opacity-50 max-w-lg mx-auto" style={{ fontFamily: theme.bodyFont }}>
            {slide.body}
          </p>
        )}
        {slide.bullets && slide.bullets.length > 0 && (
          <div className="flex flex-wrap justify-center gap-4 pt-4">
            {slide.bullets.map((b, i) => (
              <span key={i} className="px-5 py-2.5 rounded-full text-sm font-medium"
                style={{ backgroundColor: theme.accentColor + '20', color: theme.accentColor, fontFamily: theme.bodyFont }}>
                {b}
              </span>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Default: problem, solution, features, custom
  return (
    <div className="max-w-4xl w-full space-y-8">
      <div className="text-center space-y-4">
        {slide.headline && (
          <h2 className="text-3xl md:text-5xl font-bold" style={{ fontFamily: theme.headingFont, color: theme.accentColor }}>
            {slide.headline}
          </h2>
        )}
        {slide.subheadline && (
          <p className="text-xl opacity-60 max-w-2xl mx-auto" style={{ fontFamily: theme.bodyFont }}>
            {slide.subheadline}
          </p>
        )}
      </div>
      {slide.body && (
        <p className="text-center text-base opacity-60 max-w-2xl mx-auto leading-relaxed" style={{ fontFamily: theme.bodyFont }}>
          {slide.body}
        </p>
      )}
      {slide.bullets && slide.bullets.length > 0 && (
        <ul className="space-y-4 max-w-2xl mx-auto">
          {slide.bullets.map((b, i) => (
            <li key={i} className="flex items-start gap-4 text-lg" style={{ fontFamily: theme.bodyFont }}>
              <span className="text-xl mt-0.5 shrink-0" style={{ color: theme.accentColor }}>&#9670;</span>
              <span className="opacity-80">{b}</span>
            </li>
          ))}
        </ul>
      )}
      {slide.stats && slide.stats.length > 0 && (
        <div className="flex justify-center gap-8 pt-4">
          {slide.stats.map((stat, i) => (
            <div key={i} className="text-center">
              <div className="text-3xl font-bold" style={{ color: theme.accentColor, fontFamily: theme.headingFont }}>{stat.value}</div>
              <div className="text-sm opacity-50 mt-1">{stat.label}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
