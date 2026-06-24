'use client';

import { useState, useEffect, useCallback, useRef, use } from 'react';
import type { PitchDeckSlideV2, PitchDeckTheme } from '@/lib/db/schema';
import { SlideBlockWrapper } from '@/components/pitch-deck/SlideBlockWrapper';

interface Deck {
  id: number;
  title: string;
  slides: PitchDeckSlideV2[];
  theme: PitchDeckTheme;
}

export default function PresenterViewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [deck, setDeck] = useState<Deck | null>(null);
  const [current, setCurrent] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(true);
  const [mainZoom, setMainZoom] = useState(50);
  // Collapsible side panel for mobile/tablet (< lg breakpoint).
  // Desktop always renders the side panel; this state controls the bottom-sheet drawer below.
  const [sidePanelOpen, setSidePanelOpen] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mainSlideRef = useRef<HTMLDivElement>(null);
  // Swipe-to-navigate touch tracking
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    fetch(`/api/portal/tools/pitch-decks/${id}`)
      .then(r => r.json())
      .then(res => { if (res.success) setDeck(res.data); })
      .catch(() => {});
  }, [id]);

  // Timer
  useEffect(() => {
    if (running) {
      timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [running]);

  const next = useCallback(() => {
    if (deck) setCurrent(c => Math.min(c + 1, deck.slides.length - 1));
  }, [deck]);

  const prev = useCallback(() => {
    setCurrent(c => Math.max(c - 1, 0));
  }, []);

  // Keyboard navigation
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

  // Swipe gestures for touch devices. Threshold of 50px on the X axis and a
  // 2:1 horizontal-to-vertical ratio so vertical scrolling inside the slide
  // (e.g. long content) still works.
  function handleTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    touchStartRef.current = { x: t.clientX, y: t.clientY };
  }
  function handleTouchEnd(e: React.TouchEvent) {
    const start = touchStartRef.current;
    if (!start) return;
    touchStartRef.current = null;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 2) return;
    if (dx < 0) next();
    else prev();
  }

  if (!deck) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#1a1a2e] text-white">
        <span className="material-icons animate-spin text-2xl mr-3">refresh</span>
        Loading presenter view...
      </div>
    );
  }

  // A deck with no slides would make `deck.slides[current]` undefined and crash
  // the render at `slide.blocks` (the optional chain is on `.blocks`, not the
  // slide). Guard it with an empty state.
  if (deck.slides.length === 0) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#1a1a2e] text-white gap-2">
        <span className="material-icons text-4xl text-white/40">slideshow</span>
        <p className="text-white/70">This deck has no slides yet.</p>
      </div>
    );
  }

  const slide = deck.slides[current];
  const nextSlide = current < deck.slides.length - 1 ? deck.slides[current + 1] : null;
  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  const timeStr = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link
        href={`https://fonts.googleapis.com/css2?family=${encodeURIComponent(deck.theme.headingFont)}:wght@300;400;500;600;700;800&family=${encodeURIComponent(deck.theme.bodyFont)}:wght@300;400;500;600&display=swap`}
        rel="stylesheet"
      />

      <div className="min-h-screen bg-[#1a1a2e] text-white flex flex-col overflow-hidden">
        {/* Top bar — wraps on phone so the timer/counter don't overflow */}
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 sm:px-4 py-2 bg-[#16162a] border-b border-white/10 shrink-0">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <span className="material-icons text-lg text-white/50 shrink-0">co_present</span>
            <span className="text-sm font-medium truncate max-w-[160px] sm:max-w-[240px] md:max-w-[300px]">{deck.title}</span>
          </div>
          <div className="flex items-center gap-3 sm:gap-4">
            <span className="text-xs sm:text-sm text-white/60 tabular-nums">
              <span className="hidden sm:inline">Slide </span>{current + 1}<span className="hidden sm:inline"> of </span><span className="sm:hidden">/</span>{deck.slides.length}
            </span>
            <div className="flex items-center gap-1.5 sm:gap-2">
              <button
                onClick={() => setRunning(r => !r)}
                className="p-1.5 rounded hover:bg-white/10 text-white/60 hover:text-white transition-colors"
                title={running ? 'Pause timer' : 'Resume timer'}
              >
                <span className="material-icons text-base">{running ? 'pause' : 'play_arrow'}</span>
              </button>
              <span className="text-base sm:text-lg font-mono font-medium tabular-nums">{timeStr}</span>
              <button
                onClick={() => { setElapsed(0); setRunning(true); }}
                className="p-1.5 rounded hover:bg-white/10 text-white/60 hover:text-white transition-colors"
                title="Reset timer"
              >
                <span className="material-icons text-base">restart_alt</span>
              </button>
            </div>
          </div>
        </div>

        {/* Main content — stacks below lg; side-by-side at ≥1024px */}
        <div className="flex-1 flex flex-col lg:flex-row min-h-0">
          {/* Left: Current slide + navigation */}
          <div
            className="flex-1 flex flex-col p-3 sm:p-4 min-w-0 min-h-0"
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            {/* Current slide with zoom */}
            <div className="flex-1 rounded-lg overflow-hidden border border-white/10 relative min-h-0">
              <div className="absolute inset-0 overflow-auto flex items-center justify-center" ref={mainSlideRef}>
                <div style={{
                  transform: `scale(${mainZoom / 100})`,
                  transformOrigin: 'center center',
                  width: `${10000 / mainZoom}%`,
                  minHeight: `${10000 / mainZoom}%`,
                }}>
                  <SlideBlockWrapper
                    slide={slide}
                    theme={deck.theme}
                    className="w-full h-full"
                    fullBleed={slide.blocks?.length === 1 && slide.blocks[0].type === 'html-embed' && (slide.blocks[0].width ?? 'full') === 'full'}
                  />
                </div>
              </div>
            </div>

            {/* Zoom + Navigation controls — wraps on phone so nothing gets cut off */}
            <div className="flex flex-wrap items-center justify-between gap-2 mt-3 shrink-0">
              {/* Zoom controls */}
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setMainZoom(z => Math.max(25, z - 10))}
                  className="p-1.5 rounded hover:bg-white/10 text-white/60 hover:text-white transition-colors"
                  title="Zoom out"
                >
                  <span className="material-icons text-base">remove</span>
                </button>
                <button
                  onClick={() => setMainZoom(50)}
                  className="px-2 py-1 rounded hover:bg-white/10 text-white/60 hover:text-white transition-colors text-xs font-mono tabular-nums min-w-[40px] text-center"
                  title="Reset zoom"
                >
                  {mainZoom}%
                </button>
                <button
                  onClick={() => setMainZoom(z => Math.min(100, z + 10))}
                  className="p-1.5 rounded hover:bg-white/10 text-white/60 hover:text-white transition-colors"
                  title="Zoom in"
                >
                  <span className="material-icons text-base">add</span>
                </button>
                {/* Mobile-only Notes toggle, lives next to zoom so the top of the
                    drawer doesn't need its own row */}
                <button
                  onClick={() => setSidePanelOpen(o => !o)}
                  className="lg:hidden ml-2 inline-flex items-center gap-1 px-2.5 py-1.5 rounded hover:bg-white/10 text-white/70 hover:text-white transition-colors text-xs"
                  title="Show speaker notes & up-next"
                  aria-expanded={sidePanelOpen}
                >
                  <span className="material-icons text-sm">speaker_notes</span>
                  Notes
                </button>
              </div>

              {/* Navigation — touch-sized buttons (44px min height) */}
              <div className="flex items-center gap-2 sm:gap-3 order-last sm:order-none w-full sm:w-auto justify-center">
                <button
                  onClick={prev}
                  disabled={current === 0}
                  className="px-4 py-2.5 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex items-center gap-1 text-sm min-h-[44px]"
                >
                  <span className="material-icons text-base">chevron_left</span>
                  <span className="hidden sm:inline">Prev</span>
                </button>
                {/* Dot indicators — hide beyond ~20 slides on phone to avoid wrap chaos */}
                <div className="flex items-center gap-1 flex-wrap justify-center max-w-[40vw] sm:max-w-none">
                  {deck.slides.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setCurrent(i)}
                      aria-label={`Go to slide ${i + 1}`}
                      className={`w-2 h-2 rounded-full transition-colors ${i === current ? 'bg-white' : 'bg-white/20 hover:bg-white/40'}`}
                    />
                  ))}
                </div>
                <button
                  onClick={next}
                  disabled={current >= deck.slides.length - 1}
                  className="px-4 py-2.5 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex items-center gap-1 text-sm min-h-[44px]"
                >
                  <span className="hidden sm:inline">Next</span>
                  <span className="material-icons text-base">chevron_right</span>
                </button>
              </div>

              {/* Desktop-only spacer to balance the zoom controls */}
              <div className="hidden lg:block w-[120px]" />
            </div>
          </div>

          {/* Side panel: Next slide + Notes.
              - Desktop (≥lg): always-visible 380px right rail
              - Mobile/tablet: bottom drawer toggled by the "Notes" button */}
          <div
            className={`shrink-0 flex flex-col gap-3 sm:gap-4 min-h-0
              lg:w-[380px] lg:p-4 lg:pl-0
              border-t lg:border-t-0 border-white/10 bg-[#1a1a2e]
              transition-[max-height] duration-200 ease-out
              ${sidePanelOpen ? 'max-h-[55vh] p-3 sm:p-4' : 'max-h-0 overflow-hidden lg:overflow-visible'}
              lg:max-h-none lg:p-4 lg:pl-0`}
          >
            {/* Next slide preview */}
            <div className="shrink-0">
              <div className="text-xs text-white/40 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <span className="material-icons text-sm">skip_next</span>
                Up Next
              </div>
              {nextSlide ? (
                <div className="rounded-lg overflow-hidden border border-white/10 aspect-[16/9] relative">
                  <div className="absolute inset-0" style={{
                    transform: 'scale(0.25)',
                    transformOrigin: 'top left',
                    width: '400%',
                    height: '400%',
                  }}>
                    <SlideBlockWrapper
                      slide={nextSlide}
                      theme={deck.theme}
                      className="w-full h-full"
                      fullBleed={nextSlide.blocks?.length === 1 && nextSlide.blocks[0].type === 'html-embed' && (nextSlide.blocks[0].width ?? 'full') === 'full'}
                    />
                  </div>
                </div>
              ) : (
                <div
                  className="rounded-lg border border-white/10 aspect-[16/9] flex items-center justify-center"
                  style={{ backgroundColor: deck.theme.backgroundColor + '40' }}
                >
                  <span className="text-sm text-white/30">End of presentation</span>
                </div>
              )}
            </div>

            {/* Speaker notes */}
            <div className="flex-1 min-h-0 flex flex-col">
              <div className="text-xs text-white/40 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <span className="material-icons text-sm">speaker_notes</span>
                Speaker Notes
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto rounded-xl border border-white/10 bg-white/5 p-3 sm:p-4">
                {slide.notes ? (
                  <p className="text-sm leading-relaxed whitespace-pre-wrap text-white/80">{slide.notes}</p>
                ) : (
                  <p className="text-sm text-white/30 italic">No notes for this slide.</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-1 bg-white/5 shrink-0">
          <div
            className="h-full transition-all duration-300 ease-out"
            style={{
              width: `${((current + 1) / deck.slides.length) * 100}%`,
              backgroundColor: deck.theme.accentColor,
            }}
          />
        </div>
      </div>
    </>
  );
}
