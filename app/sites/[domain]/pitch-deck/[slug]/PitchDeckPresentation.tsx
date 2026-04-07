'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { PitchDeckSlideV2, PitchDeckTheme, PitchDeckDecisionOption } from '@/lib/db/schema';
import { SlideBlockWrapper } from '@/components/pitch-deck/SlideBlockWrapper';
import { SurveySlideRenderer } from '@/components/pitch-deck/SurveySlideRenderer';
import { DecisionSlideRenderer } from '@/components/pitch-deck/DecisionSlideRenderer';
import type { SurveySlideField } from '@/components/pitch-deck/SurveySlideRenderer';
import { isFieldVisible as evalFieldVisible } from '@/lib/survey-logic';

/** Survey data passed from the server page */
export interface SurveyDataForDeck {
  id: number;
  title: string;
  slug: string;
  fields: SurveySlideField[];
  requireEmail?: boolean;
  thankYouTitle?: string;
  thankYouMessage?: string;
  redirectUrl?: string | null;
}

/**
 * A "virtual slide" — either a normal block slide, decision slide, or survey question slide.
 */
type VirtualSlide =
  | { kind: 'block'; slide: PitchDeckSlideV2 }
  | { kind: 'decision'; slide: PitchDeckSlideV2; options: PitchDeckDecisionOption[] }
  | { kind: 'survey-question'; surveyId: number; field: SurveySlideField; surveyTitle: string }
  | { kind: 'survey-thanks'; surveyId: number; thankYouTitle: string; thankYouMessage: string };

interface Props {
  slides: PitchDeckSlideV2[];
  theme: PitchDeckTheme;
  title: string;
  isDraft?: boolean;
  surveys?: Record<number, SurveyDataForDeck>;
}

/** Expand a slide (possibly a survey marker) into virtual slides */
function expandSlide(slide: PitchDeckSlideV2, surveys: Record<number, SurveyDataForDeck>): VirtualSlide[] {
  if (slide.decisionSlide && slide.decisionOptions?.length) {
    return [{ kind: 'decision', slide, options: slide.decisionOptions }];
  }
  if (slide.surveySlide && slide.surveyId && surveys[slide.surveyId]) {
    const survey = surveys[slide.surveyId];
    const fields = [...survey.fields].sort((a, b) => a.order - b.order);
    const questionFields = fields.filter(f => f.type !== 'page_break');
    const result: VirtualSlide[] = questionFields.map(field => ({
      kind: 'survey-question' as const, surveyId: survey.id, field, surveyTitle: survey.title,
    }));
    result.push({
      kind: 'survey-thanks', surveyId: survey.id,
      thankYouTitle: survey.thankYouTitle || 'Thank you!',
      thankYouMessage: survey.thankYouMessage || '',
    });
    return result;
  }
  return [{ kind: 'block', slide }];
}

export default function PitchDeckPresentation({ slides, theme, title, isDraft, surveys = {} }: Props) {
  const [current, setCurrent] = useState(() => {
    if (typeof window === 'undefined') return 0;
    const hash = parseInt(window.location.hash.replace('#', ''), 10);
    return hash > 0 ? hash - 1 : 0;
  });
  const [direction, setDirection] = useState<'next' | 'prev'>('next');
  const [isAnimating, setIsAnimating] = useState(false);
  const [touchStart, setTouchStart] = useState<number | null>(null);

  // Survey state
  const [surveyAnswers, setSurveyAnswers] = useState<Record<number, Record<string, unknown>>>({});
  const [surveyErrors, setSurveyErrors] = useState<Record<string, string>>({});
  const [surveySubmitted, setSurveySubmitted] = useState<Set<number>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  // Path branching state
  const [activePath, setActivePath] = useState<string | null>(null);
  const [pathHistory, setPathHistory] = useState<string[]>([]); // tracks chosen paths for back navigation

  // Pre-compute path group slide maps
  const pathGroupSlides = useMemo(() => {
    const groups: Record<string, VirtualSlide[]> = {};
    for (const slide of slides) {
      if (slide.pathGroup) {
        if (!groups[slide.pathGroup]) groups[slide.pathGroup] = [];
        groups[slide.pathGroup].push(...expandSlide(slide, surveys));
      }
    }
    return groups;
  }, [slides, surveys]);

  // Build the active virtual slide sequence
  const virtualSlides = useMemo(() => {
    const result: VirtualSlide[] = [];
    // Main sequence = slides without a pathGroup
    const mainSlides = slides.filter(s => !s.pathGroup);

    for (let i = 0; i < mainSlides.length; i++) {
      const slide = mainSlides[i];
      const expanded = expandSlide(slide, surveys);
      result.push(...expanded);

      // If this is a decision slide and a path is active, inject the path slides right after
      if (slide.decisionSlide && slide.decisionOptions?.length) {
        // Check if any chosen path should be injected after this decision
        const chosenForThis = pathHistory.find(pg =>
          slide.decisionOptions!.some(opt => opt.pathGroup === pg)
        );
        if (chosenForThis && pathGroupSlides[chosenForThis]) {
          result.push(...pathGroupSlides[chosenForThis]);
        }
      }
    }
    return result;
  }, [slides, surveys, pathHistory, pathGroupSlides]);

  // Filter visible slides (survey conditional logic)
  const visibleSlideIndices = useMemo(() => {
    const indices: number[] = [];
    for (let i = 0; i < virtualSlides.length; i++) {
      const vs = virtualSlides[i];
      if (vs.kind === 'survey-question') {
        const answers = surveyAnswers[vs.surveyId] || {};
        if (!evalFieldVisible(vs.field, answers)) continue;
      }
      if (vs.kind === 'survey-thanks') {
        if (!surveySubmitted.has(vs.surveyId)) continue;
      }
      indices.push(i);
    }
    return indices;
  }, [virtualSlides, surveyAnswers, surveySubmitted]);

  const visibleCount = visibleSlideIndices.length;
  const currentVirtualIdx = visibleSlideIndices[current] ?? 0;
  const currentVS = virtualSlides[currentVirtualIdx];
  const isOnDecisionSlide = currentVS?.kind === 'decision';

  const goTo = useCallback((visibleIdx: number, dir?: 'next' | 'prev') => {
    if (visibleIdx < 0 || visibleIdx >= visibleCount || isAnimating) return;
    setDirection(dir || (visibleIdx > current ? 'next' : 'prev'));
    setIsAnimating(true);
    setCurrent(visibleIdx);
    window.history.replaceState(null, '', `#${visibleIdx + 1}`);
    setTimeout(() => setIsAnimating(false), 400);
  }, [current, visibleCount, isAnimating]);

  // Decision slide handler — user picks a path
  function handleDecisionChoice(pathGroup: string) {
    setActivePath(pathGroup);
    setPathHistory(prev => [...prev, pathGroup]);
    // After state update, the virtualSlides will re-expand with the path injected.
    // We need to advance to the next slide (first slide of the path).
    // Use a timeout to let the useMemo recalculate.
    setTimeout(() => {
      goTo(current + 1, 'next');
    }, 50);
  }

  // Validate current survey field before advancing
  function validateCurrentSurveyField(): boolean {
    if (!currentVS || currentVS.kind !== 'survey-question') return true;
    const field = currentVS.field;
    const answers = surveyAnswers[currentVS.surveyId] || {};
    if (field.required && field.type !== 'heading') {
      const val = answers[field.id];
      if (val === undefined || val === null || val === '') {
        setSurveyErrors({ [field.id]: `${field.label} is required` });
        return false;
      }
    }
    setSurveyErrors({});
    return true;
  }

  function isLastQuestionBeforeSubmit(): boolean {
    if (!currentVS || currentVS.kind !== 'survey-question') return false;
    const surveyId = currentVS.surveyId;
    const nextVisibleIdx = current + 1;
    if (nextVisibleIdx >= visibleCount) return true;
    const nextVirtualIdx = visibleSlideIndices[nextVisibleIdx];
    const nextVS = virtualSlides[nextVirtualIdx];
    if (!nextVS) return true;
    if (nextVS.kind !== 'survey-question' || nextVS.surveyId !== surveyId) return true;
    return false;
  }

  function getNextVisibleIndex(): number {
    if (currentVS?.kind === 'survey-question') {
      const field = currentVS.field;
      const answers = surveyAnswers[currentVS.surveyId] || {};
      if (field.goToPage && (field.type === 'select' || field.type === 'radio')) {
        const val = String(answers[field.id] || '');
        if (val && field.goToPage[val] !== undefined) {
          const targetPage = field.goToPage[val];
          let surveyQuestionIdx = 0;
          for (let vi = 0; vi < visibleSlideIndices.length; vi++) {
            const vs = virtualSlides[visibleSlideIndices[vi]];
            if (vs.kind === 'survey-question' && vs.surveyId === currentVS.surveyId) {
              if (surveyQuestionIdx === targetPage) return vi;
              surveyQuestionIdx++;
            }
          }
        }
      }
    }
    return current + 1;
  }

  async function submitSurvey(surveyId: number) {
    const survey = surveys[surveyId];
    if (!survey) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/surveys/${survey.slug}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          answers: surveyAnswers[surveyId] || {},
          source: 'pitch_deck',
          sourceId: title,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSurveySubmitted(prev => new Set(prev).add(surveyId));
        if (data.data?.redirectUrl) {
          window.location.href = data.data.redirectUrl;
          return;
        }
      }
    } catch {
      // Silently continue
    }
    setSubmitting(false);
  }

  const next = useCallback(async () => {
    // Block navigation on decision slides — user must click a choice
    if (isOnDecisionSlide) return;

    if (!validateCurrentSurveyField()) return;
    if (isLastQuestionBeforeSubmit() && currentVS?.kind === 'survey-question') {
      await submitSurvey(currentVS.surveyId);
    }
    const nextIdx = getNextVisibleIndex();
    goTo(nextIdx, 'next');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, currentVS, goTo, surveyAnswers, isOnDecisionSlide]);

  const prev = useCallback(() => {
    setSurveyErrors({});
    goTo(current - 1, 'prev');
  }, [current, goTo]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
        if (e.key === 'Enter') { e.preventDefault(); next(); }
        return;
      }
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ') {
        e.preventDefault(); next();
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault(); prev();
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [next, prev]);

  function handleTouchStart(e: React.TouchEvent) { setTouchStart(e.touches[0].clientX); }
  function handleTouchEnd(e: React.TouchEvent) {
    if (touchStart === null) return;
    const diff = touchStart - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) { if (diff > 0) next(); else prev(); }
    setTouchStart(null);
  }

  function handleSurveyAnswer(surveyId: number, fieldId: string, value: unknown) {
    setSurveyAnswers(prev => ({
      ...prev,
      [surveyId]: { ...(prev[surveyId] || {}), [fieldId]: value },
    }));
    setSurveyErrors(prev => {
      if (prev[fieldId]) { const n = { ...prev }; delete n[fieldId]; return n; }
      return prev;
    });
  }

  if (visibleCount === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: theme.backgroundColor, color: theme.textColor }}>
        <p style={{ fontFamily: theme.bodyFont }}>No slides in this presentation.</p>
      </div>
    );
  }

  // Survey question numbering
  const surveyQuestionCounts: Record<number, { total: number; currentNum: number }> = {};
  if (currentVS?.kind === 'survey-question') {
    const sid = currentVS.surveyId;
    let total = 0; let currentNum = 0; let foundCurrent = false;
    for (const vi of visibleSlideIndices) {
      const vs = virtualSlides[vi];
      if (vs.kind === 'survey-question' && vs.surveyId === sid && vs.field.type !== 'heading') {
        total++;
        if (!foundCurrent) currentNum++;
        if (vi === currentVirtualIdx) foundCurrent = true;
      }
    }
    surveyQuestionCounts[sid] = { total, currentNum };
  }

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
        {isDraft && (
          <div className="absolute top-0 left-0 right-0 z-30 bg-yellow-500/90 text-black text-center text-xs font-medium py-1 tracking-wide">
            DRAFT PREVIEW — This deck is not published
          </div>
        )}

        {/* Slide counter */}
        <div className="absolute top-6 left-8 z-20 text-sm opacity-40 tracking-widest font-light" style={{ fontFamily: theme.bodyFont }}>
          {String(current + 1).padStart(2, '0')}/{String(visibleCount).padStart(2, '0')}
        </div>

        {/* Branding */}
        <div className="absolute top-5 right-8 z-20 flex items-center gap-2 opacity-30 hover:opacity-60 transition-opacity">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/iconLogo.png" alt="" className="h-6 w-6 brightness-0 invert" />
          <span className="text-xs tracking-wide font-light" style={{ color: theme.textColor, fontFamily: theme.bodyFont }}>
            <b className="font-semibold">Simpler</b> Development
          </span>
        </div>

        {/* Navigation hint */}
        {current === 0 && currentVS?.kind === 'block' && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 text-xs opacity-20 tracking-wide" style={{ fontFamily: theme.bodyFont }}>
            Press arrow keys or spacebar &middot; Swipe on mobile
          </div>
        )}

        {/* Prev/Next arrow buttons — hidden on decision slides */}
        {current > 0 && !isOnDecisionSlide && (
          <button onClick={prev}
            className="absolute left-4 top-1/2 -translate-y-1/2 z-20 p-3 rounded-full transition-all opacity-0 hover:opacity-60"
            style={{ color: theme.textColor }}>
            <span className="material-icons text-3xl">chevron_left</span>
          </button>
        )}
        {current < visibleCount - 1 && !submitting && !isOnDecisionSlide && (
          <button onClick={next}
            className="absolute right-4 top-1/2 -translate-y-1/2 z-20 p-3 rounded-full transition-all opacity-0 hover:opacity-60"
            style={{ color: theme.textColor }}>
            <span className="material-icons text-3xl">chevron_right</span>
          </button>
        )}

        {submitting && (
          <div className="absolute right-4 top-1/2 -translate-y-1/2 z-20 p-3">
            <span className="material-icons text-2xl animate-spin" style={{ color: theme.accentColor }}>autorenew</span>
          </div>
        )}

        {/* Progress bar */}
        <div className="absolute bottom-0 left-0 right-0 h-[2px] z-20" style={{ backgroundColor: theme.textColor + '10' }}>
          <div className="h-full transition-all duration-500 ease-out" style={{
            width: `${((current + 1) / visibleCount) * 100}%`,
            backgroundColor: theme.accentColor,
          }} />
        </div>

        {/* Active path indicator */}
        {activePath && (
          <div className="absolute top-6 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 opacity-40">
            <span className="material-icons text-sm" style={{ color: theme.accentColor }}>fork_right</span>
            <span className="text-xs tracking-wide" style={{ fontFamily: theme.bodyFont, color: theme.textColor }}>
              {activePath.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
            </span>
          </div>
        )}

        {/* Slide content */}
        <div
          className="min-h-screen flex items-center justify-center"
          style={{
            animation: isAnimating
              ? `slideIn${direction === 'next' ? 'Left' : 'Right'} 0.4s ease-out`
              : undefined,
          }}
          onClick={(e) => {
            const btn = (e.target as HTMLElement).closest('[data-deck-action]') as HTMLElement | null;
            if (!btn) return;
            const action = btn.dataset.deckAction;
            if (action === 'next-slide') { next(); }
            else if (action === 'jump-to') {
              const target = parseInt(btn.dataset.deckTarget || '1', 10);
              if (target > 0 && target <= visibleCount) {
                goTo(target - 1, target - 1 > current ? 'next' : 'prev');
              }
            }
          }}
        >
          {currentVS?.kind === 'block' && (
            <SlideBlockWrapper
              slide={currentVS.slide}
              theme={theme}
              className="min-h-screen w-full flex items-center justify-center"
            />
          )}

          {currentVS?.kind === 'decision' && (
            <DecisionSlideRenderer
              title={currentVS.slide.label || 'Choose your path'}
              options={currentVS.options}
              theme={theme}
              onChoose={handleDecisionChoice}
            />
          )}

          {currentVS?.kind === 'survey-question' && (
            <SurveySlideRenderer
              field={currentVS.field}
              questionNumber={surveyQuestionCounts[currentVS.surveyId]?.currentNum ?? 1}
              totalQuestions={surveyQuestionCounts[currentVS.surveyId]?.total ?? 1}
              answers={surveyAnswers[currentVS.surveyId] || {}}
              onAnswer={(fieldId, value) => handleSurveyAnswer(currentVS.surveyId, fieldId, value)}
              theme={theme}
              error={surveyErrors[currentVS.field.id]}
              surveyTitle={currentVS.surveyTitle}
              onNext={next}
              onBack={current > 0 ? prev : undefined}
              showBack={current > 0}
              isLastQuestion={isLastQuestionBeforeSubmit()}
              isSubmitting={submitting}
            />
          )}

          {currentVS?.kind === 'survey-thanks' && (
            <div className="flex flex-col items-center justify-center min-h-screen px-8 text-center">
              <div className="w-20 h-20 rounded-full flex items-center justify-center mb-6"
                style={{ backgroundColor: `${theme.accentColor}20` }}>
                <span className="material-icons text-4xl" style={{ color: theme.accentColor }}>check_circle</span>
              </div>
              <h2 className="text-3xl md:text-4xl font-bold mb-4"
                style={{ fontFamily: theme.headingFont, color: theme.textColor }}>
                {currentVS.thankYouTitle}
              </h2>
              {currentVS.thankYouMessage && (
                <p className="text-lg opacity-60 max-w-xl" style={{ fontFamily: theme.bodyFont, color: theme.textColor }}>
                  {currentVS.thankYouMessage}
                </p>
              )}
            </div>
          )}
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
