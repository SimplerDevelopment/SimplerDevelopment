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
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  if (!deck) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#1a1a2e] text-white">
        <span className="material-icons animate-spin text-2xl mr-3">refresh</span>
        Loading presenter view...
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
      <link href="https://fonts.googleapis.com/icon?family=Material+Icons" rel="stylesheet" />
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link
        href={`https://fonts.googleapis.com/css2?family=${encodeURIComponent(deck.theme.headingFont)}:wght@300;400;500;600;700;800&family=${encodeURIComponent(deck.theme.bodyFont)}:wght@300;400;500;600&display=swap`}
        rel="stylesheet"
      />

      <div className="min-h-screen bg-[#1a1a2e] text-white flex flex-col overflow-hidden">
        {/* Top bar */}
        <div className="flex items-center justify-between px-4 py-2 bg-[#16162a] border-b border-white/10 shrink-0">
          <div className="flex items-center gap-3">
            <span className="material-icons text-lg text-white/50">co_present</span>
            <span className="text-sm font-medium truncate max-w-[300px]">{deck.title}</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-white/60">
              Slide {current + 1} of {deck.slides.length}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setRunning(r => !r)}
                className="p-1 rounded hover:bg-white/10 text-white/60 hover:text-white transition-colors"
                title={running ? 'Pause timer' : 'Resume timer'}
              >
                <span className="material-icons text-base">{running ? 'pause' : 'play_arrow'}</span>
              </button>
              <span className="text-lg font-mono font-medium tabular-nums">{timeStr}</span>
              <button
                onClick={() => { setElapsed(0); setRunning(true); }}
                className="p-1 rounded hover:bg-white/10 text-white/60 hover:text-white transition-colors"
                title="Reset timer"
              >
                <span className="material-icons text-base">restart_alt</span>
              </button>
            </div>
          </div>
        </div>

        {/* Main content */}
        <div className="flex-1 flex min-h-0">
          {/* Left: Current slide + navigation */}
          <div className="flex-1 flex flex-col p-4 min-w-0">
            {/* Current slide */}
            <div className="flex-1 rounded-lg overflow-hidden border border-white/10 relative min-h-0">
              <div className="absolute inset-0">
                <SlideBlockWrapper
                  slide={slide}
                  theme={deck.theme}
                  className="w-full h-full"
                />
              </div>
            </div>

            {/* Navigation controls */}
            <div className="flex items-center justify-center gap-3 mt-3 shrink-0">
              <button
                onClick={prev}
                disabled={current === 0}
                className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex items-center gap-1 text-sm"
              >
                <span className="material-icons text-base">chevron_left</span>
                Prev
              </button>
              <div className="flex items-center gap-1">
                {deck.slides.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setCurrent(i)}
                    className={`w-2 h-2 rounded-full transition-colors ${i === current ? 'bg-white' : 'bg-white/20 hover:bg-white/40'}`}
                  />
                ))}
              </div>
              <button
                onClick={next}
                disabled={current >= deck.slides.length - 1}
                className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex items-center gap-1 text-sm"
              >
                Next
                <span className="material-icons text-base">chevron_right</span>
              </button>
            </div>
          </div>

          {/* Right: Next slide preview + Notes */}
          <div className="w-[380px] shrink-0 flex flex-col p-4 pl-0 gap-4 min-h-0">
            {/* Next slide preview */}
            <div className="shrink-0">
              <div className="text-xs text-white/40 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <span className="material-icons text-sm">skip_next</span>
                Up Next
              </div>
              {nextSlide ? (
                <div className="rounded-lg overflow-hidden border border-white/10 aspect-[16/9] relative">
                  <div className="absolute inset-0" style={{ transform: 'scale(1)', transformOrigin: 'top left' }}>
                    <SlideBlockWrapper
                      slide={nextSlide}
                      theme={deck.theme}
                      className="w-full h-full"
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
              <div className="flex-1 min-h-0 overflow-y-auto rounded-lg border border-white/10 bg-white/5 p-4">
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
