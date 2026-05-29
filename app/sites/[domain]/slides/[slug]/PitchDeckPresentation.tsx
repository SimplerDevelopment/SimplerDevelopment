'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type {
  PitchDeckSlideV2,
  PitchDeckTheme,
  PitchDeckDecisionOption,
  SurveyRecommendationConfig,
} from '@/lib/db/schema';
import { SlideBlockWrapper } from '@/components/pitch-deck/SlideBlockWrapper';
import { SurveySlideRenderer } from '@/components/pitch-deck/SurveySlideRenderer';
import { DecisionSlideRenderer } from '@/components/pitch-deck/DecisionSlideRenderer';
import { SurveyRecommendationRenderer } from '@/components/pitch-deck/SurveyRecommendationRenderer';
import type { SurveySlideField } from '@/components/pitch-deck/SurveySlideRenderer';
import { isFieldVisible as evalFieldVisible } from '@/lib/survey-logic';
import { BrandingProvider } from '@/contexts/BrandingContext';
import type { ResolvedBranding } from '@/lib/branding-types';

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
  /** Source of truth for the recommendation slide. Set on the survey row, not
   *  the deck slide — see migration 0049. */
  recommendation?: SurveyRecommendationConfig | null;
}

/**
 * A "virtual slide" — either a normal block slide, decision slide, or survey question slide.
 */
type VirtualSlide =
  | { kind: 'block'; slide: PitchDeckSlideV2 }
  | { kind: 'decision'; slide: PitchDeckSlideV2; options: PitchDeckDecisionOption[] }
  | { kind: 'survey-question'; surveyId: number; field: SurveySlideField; surveyTitle: string }
  | { kind: 'survey-contact'; surveyId: number; surveyTitle: string }
  | { kind: 'survey-thanks'; surveyId: number; thankYouTitle: string; thankYouMessage: string }
  | { kind: 'survey-recommendation'; surveyId: number; config: SurveyRecommendationConfig };

interface Props {
  slides: PitchDeckSlideV2[];
  theme: PitchDeckTheme;
  title: string;
  isDraft?: boolean;
  surveys?: Record<number, SurveyDataForDeck>;
  /**
   * Resolved branding for the deck's brandingProfileId (or client default).
   * Wraps the slide tree in BrandingProvider so blocks that read useBranding()
   * — Hero gradient, Button/CTA presets, FeaturedContent — pick up the deck's
   * brand colors, fonts, and typography instead of Tailwind fallbacks.
   */
  branding?: ResolvedBranding | null;
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
    const result: VirtualSlide[] = [];
    // If email is required, inject a single contact slide (email + name + company)
    if (survey.requireEmail) {
      result.push({ kind: 'survey-contact', surveyId: survey.id, surveyTitle: survey.title });
    }
    for (const field of questionFields) {
      result.push({ kind: 'survey-question', surveyId: survey.id, field, surveyTitle: survey.title });
    }
    // Source of truth: survey.recommendation. Falls back to the legacy
    // slide-level field for decks created before migration 0049 — once those
    // are backfilled the fallback can be removed.
    const recommendation = survey.recommendation ?? slide.surveyRecommendation;
    // Skip the standalone thank-you slide when a recommendation is configured
    // — the recommendation slide is itself the post-submit landing screen, so
    // a "Got it." interstitial just adds a redundant click.
    if (!recommendation) {
      result.push({
        kind: 'survey-thanks', surveyId: survey.id,
        thankYouTitle: survey.thankYouTitle || 'Thank you!',
        thankYouMessage: survey.thankYouMessage || '',
      });
    }
    if (recommendation) {
      result.push({
        kind: 'survey-recommendation',
        surveyId: survey.id,
        config: recommendation,
      });
    }
    return result;
  }
  return [{ kind: 'block', slide }];
}

/**
 * A "full-bleed HTML slide" is one that contains exactly one html-embed block
 * configured to span the full slide width. We auto-suppress the deck chrome
 * (slide counter, default content padding) on these slides so the uploaded
 * HTML can take over the viewport.
 */
function isFullBleedHtmlSlide(slide: PitchDeckSlideV2): boolean {
  if (!slide.blocks || slide.blocks.length !== 1) return false;
  const block = slide.blocks[0];
  if (block.type !== 'html-embed') return false;
  return (block.width ?? 'full') === 'full';
}

export default function PitchDeckPresentation({ slides, theme, title, isDraft, surveys = {}, branding }: Props) {
  // Initial seed from the URL hash — covers direct URL access (e.g. /foo#6)
  // without flashing slide 0 first. A useEffect below re-reads the hash after
  // mount to correct stale reads on cross-deck next/link navigation, where the
  // previous deck's hash may not be cleared yet at render time.
  const [current, setCurrent] = useState(() => {
    if (typeof window === 'undefined') return 0;
    const hash = parseInt(window.location.hash.replace('#', ''), 10);
    return hash > 0 ? hash - 1 : 0;
  });
  const [direction, setDirection] = useState<'next' | 'prev'>('next');
  const [isAnimating, setIsAnimating] = useState(false);
  // Ref, not state — setting state on every tap triggered a re-render between
  // `touchend` and the synthetic `click`, which on iOS Safari can drop the
  // click event entirely. Symptom: anchors inside the deck required two taps
  // to navigate. Refs avoid the re-render.
  const touchStartRef = useRef<number | null>(null);

  // Survey state
  const [surveyAnswers, setSurveyAnswers] = useState<Record<number, Record<string, unknown>>>({});
  const [surveyErrors, setSurveyErrors] = useState<Record<string, string>>({});
  const [surveySubmitted, setSurveySubmitted] = useState<Set<number>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  // Path branching state — keyed by decision slide ID → chosen pathGroup
  const [activePath, setActivePath] = useState<string | null>(null);
  const [decisionChoices, setDecisionChoices] = useState<Record<string, string>>({});
  const [pendingAdvance, setPendingAdvance] = useState(false);

  // Group raw slides by pathGroup so we can recursively inject sub-paths
  // when a nested decision slide is chosen (e.g. welcome → "direct" path
  // → offering-selection → specific-offering detail).
  const slidesByPath = useMemo(() => {
    const groups: Record<string, PitchDeckSlideV2[]> = {};
    for (const slide of slides) {
      if (slide.pathGroup) {
        groups[slide.pathGroup] ??= [];
        groups[slide.pathGroup].push(slide);
      }
    }
    return groups;
  }, [slides]);

  // Build the active virtual slide sequence. Walks each main slide and, on
  // any decision slide where a choice has been made, recursively injects the
  // chosen path's slides — including any nested decisions on those slides.
  const virtualSlides = useMemo(() => {
    const result: VirtualSlide[] = [];

    function walk(slide: PitchDeckSlideV2) {
      const expanded = expandSlide(slide, surveys);
      result.push(...expanded);
      if (slide.decisionSlide && slide.decisionOptions?.length) {
        const chosenPath = decisionChoices[slide.id];
        if (chosenPath && slidesByPath[chosenPath]) {
          for (const pathSlide of slidesByPath[chosenPath]) {
            walk(pathSlide);
          }
        }
      }
    }

    for (const slide of slides.filter(s => !s.pathGroup)) {
      walk(slide);
    }
    return result;
  }, [slides, surveys, decisionChoices, slidesByPath]);

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
      if (vs.kind === 'survey-recommendation') {
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

  // Sync `current` from the URL hash on mount and on hashchange. Runs after
  // the URL has settled, so cross-deck navigation (where the previous deck's
  // hash may not be cleared yet at render time) can't seed a stale index.
  useEffect(() => {
    function applyHash() {
      const raw = parseInt(window.location.hash.replace('#', ''), 10);
      const idx = raw > 0 ? raw - 1 : 0;
      // Defer the read so we win any same-tick history.pushState from next/link.
      setCurrent(idx);
    }
    applyHash();
    window.addEventListener('hashchange', applyHash);
    return () => window.removeEventListener('hashchange', applyHash);
  }, []);

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
    if (!currentVS || currentVS.kind !== 'decision') return;
    setActivePath(pathGroup);
    setDecisionChoices(prev => ({ ...prev, [currentVS.slide.id]: pathGroup }));
    setPendingAdvance(true);
  }

  // After path injection, advance past the decision slide
  useEffect(() => {
    if (!pendingAdvance) return;
    setPendingAdvance(false);
    // visibleSlideIndices is now recalculated with the injected path
    if (current + 1 < visibleCount) {
      goTo(current + 1, 'next');
    }
  }, [pendingAdvance, visibleCount]); // eslint-disable-line react-hooks/exhaustive-deps

  // Validate current survey field before advancing
  function validateCurrentSurveyField(): boolean {
    if (currentVS?.kind === 'survey-contact') {
      const answers = surveyAnswers[currentVS.surveyId] || {};
      const email = ((answers.__email as string) || '').trim();
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        setSurveyErrors({ __email: 'Please enter a valid email address' });
        return false;
      }
      setSurveyErrors({});
      return true;
    }
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
      const allAnswers = { ...(surveyAnswers[surveyId] || {}) };
      // Extract synthetic email/name from the contact slide. Company stays in
      // answers (the API only knows email + name as top-level fields).
      const email = allAnswers.__email as string | undefined;
      const name = allAnswers.__name as string | undefined;
      const company = allAnswers.__company as string | undefined;
      delete allAnswers.__email;
      delete allAnswers.__name;
      delete allAnswers.__company;
      if (company) allAnswers.company = company;

      const res = await fetch(`/api/surveys/${survey.slug}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          formName: 'main',
          answers: allAnswers,
          email: email || undefined,
          name: name || undefined,
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
      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault(); next();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault(); prev();
      }
      // ArrowUp/ArrowDown left to browser default (scroll)
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [next, prev]);

  function handleTouchStart(e: React.TouchEvent) { touchStartRef.current = e.touches[0].clientX; }
  function handleTouchEnd(e: React.TouchEvent) {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (start === null) return;
    const diff = start - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) { if (diff > 0) next(); else prev(); }
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

  const fontsUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(theme.headingFont)}:wght@300;400;500;600;700;800&family=${encodeURIComponent(theme.bodyFont)}:wght@300;400;500;600&display=swap`;

  // Pull the underlying slide (if any) so we can apply its pageSettings to the
  // outer slide-stage. Block + decision slides both author against a real
  // PitchDeckSlideV2; the synthetic survey/thank-you/recommendation virtuals
  // do not — those slides intentionally fall back to the deck theme.
  // Ticket #19: pageSettings.backgroundImage / backgroundColor / etc. were
  // accepted by the editor and round-tripped through the API but never
  // applied as CSS. SlideBlockWrapper already paints the bg-image overlay for
  // block-kind slides, but decision/survey/thanks slides skip that wrapper —
  // and the outer slide-stage was rendering background:none either way.
  // Painting pageSettings on the slide-stage itself fixes both cases.
  const stageSlide: PitchDeckSlideV2 | undefined =
    currentVS?.kind === 'block' || currentVS?.kind === 'decision' ? currentVS.slide : undefined;
  const stageStyle: React.CSSProperties = stagePageSettingsStyle(stageSlide?.pageSettings, theme);

  const presentation = (
    <>
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link href={fontsUrl} rel="stylesheet" />

      {/* Defensive: legacy decks (e.g. cystrategies) shipped a self-injected
          mobile-nav overlay (`#cy-mob-nav`) inside their html-render content.
          Now that the deck has its own footer + side chevrons, that overlay
          duplicates the nav. Pre-set the script's idempotency flag so it
          returns early and hide the element if it ever did get appended. */}
      <script dangerouslySetInnerHTML={{ __html: 'window.__cyNavInit=true;' }} />
      <style dangerouslySetInnerHTML={{ __html: '#cy-mob-nav{display:none!important}' }} />

      {theme.customCss && <style dangerouslySetInnerHTML={{ __html: theme.customCss }} />}

      <div
        className="min-h-screen w-full overflow-hidden relative select-none deck-root"
        data-deck-id={title}
        style={{ backgroundColor: theme.backgroundColor, color: theme.textColor, fontFamily: theme.bodyFont }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {isDraft && (
          <div className="absolute top-0 left-0 right-0 z-30 bg-yellow-500/90 text-black text-center text-xs font-medium py-1 tracking-wide">
            DRAFT PREVIEW — This deck is not published
          </div>
        )}

        {/* Slide counter — suppressed when the deck opts out via theme.showSlideNumber=false
            or when the current slide is a single full-bleed html-embed (auto-stripped chrome).
            Hidden on mobile — the bottom footer carries the indicator there instead. */}
        {theme.showSlideNumber !== false &&
          !(currentVS?.kind === 'block' && isFullBleedHtmlSlide(currentVS.slide)) && (
          <div className="hidden md:block absolute top-6 left-8 z-20 text-sm opacity-40 tracking-widest font-light" style={{ fontFamily: theme.bodyFont }}>
            {String(current + 1).padStart(2, '0')}/{String(visibleCount).padStart(2, '0')}
          </div>
        )}

        {/* Navigation hint — desktop only (mobile users get the footer affordance). */}
        {current === 0 && currentVS?.kind === 'block' && (
          <div className="hidden md:block absolute bottom-6 left-1/2 -translate-x-1/2 z-20 text-xs opacity-20 tracking-wide" style={{ fontFamily: theme.bodyFont }}>
            Press arrow keys or spacebar &middot; Swipe on mobile
          </div>
        )}

        {/* Prev/Next arrow buttons — desktop only (mobile uses the bottom footer).
            Hidden on decision slides; survey slides manage their own Back/Next UI
            inside SurveySlideRenderer. Positioned `fixed` so they anchor to the
            viewport center regardless of how tall the current slide is. */}
        {current > 0 && !isOnDecisionSlide && currentVS?.kind !== 'survey-question' && (
          <button onClick={prev}
            aria-label="Previous slide"
            className="hidden md:inline-flex items-center justify-center fixed left-4 top-1/2 -translate-y-1/2 z-20 w-12 h-12 rounded-full transition-all opacity-80 hover:opacity-100 backdrop-blur-sm"
            style={{ color: '#ffffff', backgroundColor: '#374151' }}>
            <span className="material-icons text-3xl leading-none">chevron_left</span>
          </button>
        )}
        {current < visibleCount - 1 && !submitting && !isOnDecisionSlide && currentVS?.kind !== 'survey-question' && (
          <button onClick={next}
            aria-label="Next slide"
            className="hidden md:inline-flex items-center justify-center fixed right-4 top-1/2 -translate-y-1/2 z-20 w-12 h-12 rounded-full transition-all opacity-80 hover:opacity-100 backdrop-blur-sm"
            style={{ color: '#ffffff', backgroundColor: '#374151' }}>
            <span className="material-icons text-3xl leading-none">chevron_right</span>
          </button>
        )}

        {submitting && (
          <div className="hidden md:block absolute right-4 top-1/2 -translate-y-1/2 z-20 p-3">
            <span className="material-icons text-2xl animate-spin" style={{ color: theme.accentColor }}>autorenew</span>
          </div>
        )}

        {/* Progress bar — desktop only. The mobile footer has its own progress bar at its top edge. */}
        <div className="hidden md:block absolute bottom-0 left-0 right-0 h-[2px] z-20" style={{ backgroundColor: theme.textColor + '10' }}>
          <div className="h-full transition-all duration-500 ease-out" style={{
            width: `${((current + 1) / visibleCount) * 100}%`,
            backgroundColor: theme.accentColor,
          }} />
        </div>

        {/* Mobile-only footer nav: prev arrow / indicator / next arrow, with a
            2px progress bar pinned to the top edge. Hidden on slide kinds that
            manage their own Back/Next UI (decision, survey-question, survey-contact),
            and on single-slide decks where the nav has nothing to do. */}
        {visibleCount > 1
          && !isOnDecisionSlide
          && currentVS?.kind !== 'survey-question'
          && currentVS?.kind !== 'survey-contact' && (
          <div
            className="md:hidden fixed bottom-0 left-0 right-0 z-30 backdrop-blur-md"
            style={{
              backgroundColor: `${theme.backgroundColor}E6`,
              borderTop: `1px solid ${theme.textColor}15`,
              paddingBottom: 'max(env(safe-area-inset-bottom), 0.5rem)',
            }}
          >
            {/* Inline progress bar at the top edge of the footer */}
            <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ backgroundColor: `${theme.textColor}10` }}>
              <div className="h-full transition-all duration-500 ease-out" style={{
                width: `${((current + 1) / visibleCount) * 100}%`,
                backgroundColor: theme.accentColor,
              }} />
            </div>

            <div className="flex items-center justify-between px-4 pt-3 pb-2">
              <button
                type="button"
                onClick={prev}
                disabled={current === 0}
                aria-label="Previous slide"
                className="inline-flex items-center justify-center w-10 h-10 rounded-full transition-opacity disabled:opacity-25 disabled:pointer-events-none"
                style={{ color: theme.textColor, backgroundColor: `${theme.textColor}10` }}
              >
                <span className="material-icons text-2xl leading-none">chevron_left</span>
              </button>

              <div
                className="text-xs tracking-widest opacity-50 font-light tabular-nums"
                style={{ fontFamily: theme.bodyFont, color: theme.textColor }}
                aria-live="polite"
              >
                {String(current + 1).padStart(2, '0')} / {String(visibleCount).padStart(2, '0')}
              </div>

              <button
                type="button"
                onClick={next}
                disabled={current >= visibleCount - 1 || submitting}
                aria-label="Next slide"
                className="inline-flex items-center justify-center w-10 h-10 rounded-full transition-opacity disabled:opacity-25 disabled:pointer-events-none"
                style={{ color: theme.textColor, backgroundColor: `${theme.textColor}10` }}
              >
                {submitting ? (
                  <span className="material-icons text-2xl leading-none animate-spin">autorenew</span>
                ) : (
                  <span className="material-icons text-2xl leading-none">chevron_right</span>
                )}
              </button>
            </div>
          </div>
        )}


        {/* Per-slide custom CSS — only active for the current block slide.
            Injected unscoped, so authors can write plain selectors that only
            take effect while their slide is in view. */}
        {currentVS?.kind === 'block' && currentVS.slide.customCss && (
          <style dangerouslySetInnerHTML={{ __html: currentVS.slide.customCss }} />
        )}

        {/* Slide content. Reserve bottom padding on mobile equal to the footer
            height so centered content isn't visually clipped behind the footer. */}
        <div
          className={`min-h-screen flex items-center justify-center slide-stage md:pb-0 ${visibleCount > 1 ? 'pb-16' : ''}`}
          data-slide-id={currentVS?.kind === 'block' ? currentVS.slide.id : undefined}
          style={{
            ...stageStyle,
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
              presentation
              fullBleed={isFullBleedHtmlSlide(currentVS.slide)}
            />
          )}

          {currentVS?.kind === 'decision' && (
            <DecisionSlideRenderer
              title={currentVS.slide.label || 'Choose your path'}
              options={currentVS.options}
              theme={theme}
              onChoose={handleDecisionChoice}
              cover={currentVS.slide.decisionCover}
            />
          )}

          {currentVS?.kind === 'survey-question' && (
            <SurveySlideRenderer
              field={currentVS.field}
              answers={surveyAnswers[currentVS.surveyId] || {}}
              onAnswer={(fieldId, value) => handleSurveyAnswer(currentVS.surveyId, fieldId, value)}
              theme={theme}
              error={surveyErrors[currentVS.field.id]}
              surveyTitle={currentVS.surveyTitle}
              onNext={next}
              onBack={prev}
              showBack
              isLastQuestion={isLastQuestionBeforeSubmit()}
              isSubmitting={submitting}
            />
          )}

          {currentVS?.kind === 'survey-contact' && (
            <ContactSlide
              theme={theme}
              surveyTitle={currentVS.surveyTitle}
              answers={surveyAnswers[currentVS.surveyId] || {}}
              onAnswer={(fieldId, value) => handleSurveyAnswer(currentVS.surveyId, fieldId, value)}
              error={surveyErrors.__email}
              onNext={next}
              onBack={prev}
              showBack
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

          {currentVS?.kind === 'survey-recommendation' && (
            <SurveyRecommendationRenderer
              config={currentVS.config}
              answers={surveyAnswers[currentVS.surveyId] || {}}
              theme={theme}
            />
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

  return branding
    ? <BrandingProvider branding={branding}>{presentation}</BrandingProvider>
    : presentation;
}

/**
 * Build the inline-style block applied to the slide-stage container from a
 * slide's `pageSettings`. Robust to either a raw URL (`https://…`) or an
 * already-wrapped CSS value (`url(https://…)`) — ticket #19 surfaced authors
 * shipping both. When `backgroundColor` is authored on the slide, it wins
 * over the brand theme; when only `backgroundImage` is set the theme color
 * still shows underneath while the image loads / where it doesn't cover.
 */
function stagePageSettingsStyle(
  pageSettings: import('@/types/blocks').PageSettings | undefined,
  _theme: PitchDeckTheme,
): React.CSSProperties {
  if (!pageSettings) return {};
  const style: React.CSSProperties = {};
  if (pageSettings.backgroundColor) {
    style.backgroundColor = pageSettings.backgroundColor;
  }
  if (pageSettings.backgroundImage) {
    const raw = pageSettings.backgroundImage.trim();
    // Accept either `url(...)` (already wrapped) or a bare URL/data-URI.
    style.backgroundImage = /^url\(/i.test(raw) ? raw : `url(${raw})`;
    style.backgroundSize = pageSettings.backgroundSize || 'cover';
    style.backgroundPosition = pageSettings.backgroundPosition || 'center';
    style.backgroundRepeat = pageSettings.backgroundRepeat || 'no-repeat';
  }
  return style;
}

/**
 * Single-slide email + name + company collector. Mirrors SurveySlideRenderer's
 * outer DOM (.w-full.flex.flex-col → .max-w-3xl) so deck-level customCss that
 * targets the survey question chrome (eyebrow / question / nav buttons) also
 * styles this slide consistently.
 */
function ContactSlide({
  theme,
  surveyTitle,
  answers,
  onAnswer,
  error,
  onNext,
  onBack,
  showBack,
}: {
  theme: PitchDeckTheme;
  surveyTitle: string;
  answers: Record<string, unknown>;
  onAnswer: (fieldId: string, value: unknown) => void;
  error?: string;
  onNext: () => void;
  onBack: () => void;
  showBack: boolean;
}) {
  const inputStyle: React.CSSProperties = {
    fontFamily: theme.bodyFont,
    color: theme.textColor,
    backgroundColor: `${theme.textColor}10`,
    borderColor: `${theme.textColor}30`,
    ['--tw-ring-color' as string]: theme.accentColor,
  };
  const inputCls = 'w-full px-4 py-3 border rounded-lg text-base focus:outline-none focus:ring-2 focus:border-transparent placeholder:opacity-40';

  const nextBg = theme.nextButtonColor ?? theme.accentColor;
  const nextFg = theme.nextButtonTextColor ?? theme.backgroundColor;
  const backBg = theme.backButtonColor ?? `${theme.textColor}15`;
  const backFg = theme.backButtonTextColor ?? theme.textColor;

  return (
    <div className="w-full flex flex-col items-center justify-center min-h-screen px-8">
      <div className="w-full max-w-3xl space-y-8">
        <div className="flex items-center gap-2 opacity-40">
          <span className="material-icons text-sm" style={{ color: theme.accentColor }}>assignment</span>
          <span className="text-xs tracking-wide" style={{ fontFamily: theme.bodyFont, color: theme.textColor }}>
            {surveyTitle}
          </span>
        </div>

        <h2
          className="text-2xl md:text-3xl font-semibold leading-tight"
          style={{ fontFamily: theme.headingFont, color: theme.textColor }}
        >
          Tell us a bit about you
        </h2>

        <p className="text-base opacity-50" style={{ fontFamily: theme.bodyFont, color: theme.textColor }}>
          So we know who we&rsquo;re talking to.
        </p>

        <div className="pt-2 space-y-4">
          <input
            type="email"
            placeholder="you@example.com"
            value={(answers.__email as string) || ''}
            onChange={(e) => onAnswer('__email', e.target.value)}
            className={inputCls}
            style={inputStyle}
            autoFocus
            aria-label="Email"
          />
          <input
            type="text"
            placeholder="Your name"
            value={(answers.__name as string) || ''}
            onChange={(e) => onAnswer('__name', e.target.value)}
            className={inputCls}
            style={inputStyle}
            aria-label="Name"
          />
          <input
            type="text"
            placeholder="Company"
            value={(answers.__company as string) || ''}
            onChange={(e) => onAnswer('__company', e.target.value)}
            className={inputCls}
            style={inputStyle}
            aria-label="Company"
          />
        </div>

        {error && (
          <div
            className="flex items-center gap-2 text-sm px-4 py-2 rounded-lg"
            style={{ backgroundColor: '#ef444420', color: '#ef4444' }}
          >
            <span className="material-icons text-base">error</span>
            {error}
          </div>
        )}

        <div className="flex items-center justify-between pt-6">
          {showBack ? (
            <button
              type="button"
              onClick={onBack}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium transition-all hover:opacity-80"
              style={{ color: backFg, backgroundColor: backBg }}
            >
              <span className="material-icons text-lg">arrow_back</span>
              Back
            </button>
          ) : <div />}
          <button
            type="button"
            onClick={onNext}
            className="flex items-center gap-1.5 px-6 py-2.5 rounded-lg text-sm font-medium transition-all hover:opacity-90"
            style={{ backgroundColor: nextBg, color: nextFg }}
          >
            Next
            <span className="material-icons text-lg">arrow_forward</span>
          </button>
        </div>
      </div>
    </div>
  );
}

