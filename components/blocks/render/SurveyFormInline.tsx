'use client';

import { useState, useEffect, FormEvent, useCallback, useRef } from 'react';
import { isFieldVisible as evalFieldVisible, resolvePiping } from '@/lib/survey-logic';
import { SurveyRecommendationRenderer } from '@/components/pitch-deck/SurveyRecommendationRenderer';
import type { PitchDeckTheme } from '@/lib/db/schema';
import type { SurveyField, SurveyData, FileFieldState, SurveyFormInlineProps } from './SurveyFormInline.types';
import { DISPLAY_ONLY_TYPES } from './SurveyFormInline.types';
import {
  getOrCreatePartialSessionId,
  clearPartialSessionId,
  lightenColor, countSurveyPages, blockImplicitSubmit,
} from './SurveyFormInline.helpers';
import { renderField } from './SurveyFormInline.FieldRenderer';


export function SurveyFormInline({
  slug,
  showPageTitle = true,
  showDescription = true,
  showLogo = true,
  styleOverrides,
  source = 'block',
  sourceId = '',
}: SurveyFormInlineProps) {
  const [survey, setSurvey] = useState<SurveyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [thankYou, setThankYou] = useState({ title: '', message: '' });
  // PDF-01: stash the certificate context after submit so the thank-you
  // screen can render a "Download Certificate" button. `null` while the
  // survey is opt-out or before submit completes.
  const [certificate, setCertificate] = useState<{ responseId: number } | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [pageHistory, setPageHistory] = useState<number[]>([0]);
  // Disarms Submit briefly after every page change: a double-click on "Next"
  // lands its second click on the Submit button that replaces it on the last
  // page — respondents submitted before ever seeing the final page.
  const pageEnteredAtRef = useRef(Date.now());
  // RESP-02: stable across renders; lazy-initialised so SSR sees `null` and
  // hydration assigns once on the client.
  const sessionIdRef = useRef<string | null>(null);
  // RESP-03: per-field upload state. Keyed by field id so multiple file
  // fields on the same survey don't share state. An entry with `uploading:
  // true` blocks Submit / Next; the field's answer (the S3 URL) is stored
  // separately in `answers[field.id]` so the existing submit flow works
  // unchanged.
  const [fileFieldState, setFileFieldState] = useState<Record<string, FileFieldState>>({});
  const hasInflightUpload = Object.values(fileFieldState).some((s) => s.uploading);

  useEffect(() => {
    let cancelled = false;
    // Mint or recover the session id BEFORE loading the survey so the partial
    // fetch can ride alongside the same render-cycle.
    sessionIdRef.current = getOrCreatePartialSessionId(slug);

    (async () => {
      try {
        const surveyRes = await fetch(`/api/surveys/${slug}`);
        const surveyJson = await surveyRes.json();
        if (cancelled) return;
        if (!surveyJson.success) {
          setError(surveyJson.message || 'Survey not available');
          setLoading(false);
          return;
        }
        setSurvey(surveyJson.data);

        // Best-effort partial-resume. Silently skip on any error — the form
        // still works without resume.
        const sid = sessionIdRef.current;
        if (sid) {
          try {
            const partialRes = await fetch(
              `/api/surveys/${slug}/partial?sessionId=${encodeURIComponent(sid)}`,
            );
            const partialJson = await partialRes.json();
            if (!cancelled && partialJson?.success && partialJson.data) {
              const p = partialJson.data;
              if (p.answers && typeof p.answers === 'object') {
                setAnswers(p.answers as Record<string, unknown>);
              }
              if (typeof p.respondentEmail === 'string') setEmail(p.respondentEmail);
              if (typeof p.lastPage === 'number' && p.lastPage > 0) {
                const target = Math.min(p.lastPage, countSurveyPages(surveyJson.data.fields || []) - 1);
                setCurrentPage(target);
                setPageHistory([0, target]);
              }
            }
          } catch {
            // ignore — fresh form is the safe default
          }
        }
        setLoading(false);
      } catch {
        if (!cancelled) {
          setError('Failed to load survey');
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [slug]);

  /**
   * Fire-and-forget save of the in-progress answers. Called after each page
   * transition once validation has passed. Network failures don't block
   * navigation — the worst case is the visitor can't resume next session.
   */
  const savePartial = useCallback(
    (overrides?: { lastPage?: number; respondentEmail?: string }) => {
      const sid = sessionIdRef.current;
      if (!sid || !survey) return;
      const payload = {
        sessionId: sid,
        answers,
        lastPage: overrides?.lastPage ?? currentPage,
        respondentEmail: overrides?.respondentEmail ?? (email || undefined),
        source,
        sourceId: sourceId || undefined,
      };
      // Don't await; don't surface errors to the user.
      void fetch(`/api/surveys/${slug}/partial`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true,
      }).catch(() => {});
    },
    [slug, survey, answers, currentPage, email, source, sourceId],
  );

  // Load Google Fonts dynamically when branding specifies custom fonts
  useEffect(() => {
    if (!survey?.branding) return;
    const fonts = [survey.branding.headingFont, survey.branding.bodyFont].filter(Boolean);
    if (fonts.length === 0) return;
    const families = [...new Set(fonts)].map(f => f.replace(/ /g, '+')).join('&family=');
    const id = 'survey-brand-fonts';
    if (document.getElementById(id)) return;
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?family=${families}&display=swap`;
    document.head.appendChild(link);
  }, [survey?.branding]);

  const getPages = useCallback(() => {
    if (!survey) return [];
    const allFields = [...(survey.fields || [])].sort((a, b) => a.order - b.order);
    const pages: SurveyField[][] = [[]];
    for (const field of allFields) {
      if (field.type === 'page_break') {
        pages.push([]);
      } else {
        pages[pages.length - 1].push(field);
      }
    }
    return pages;
  }, [survey]);

  const pages = getPages();
  const totalPages = pages.length;
  const isMultiPage = totalPages > 1;
  const pageIndex = Math.min(currentPage, Math.max(totalPages - 1, 0));
  const isLastPage = pageIndex >= totalPages - 1;

  function setAnswer(fieldId: string, value: unknown) {
    setAnswers(prev => ({ ...prev, [fieldId]: value }));
  }

  /**
   * RESP-03: POST a selected file to the public upload endpoint and store
   * the returned URL as the field's answer. Multiple uploads on the same
   * field replace the previous answer.
   */
  const handleFileUpload = useCallback(
    async (fieldId: string, file: File) => {
      setFileFieldState((prev) => ({
        ...prev,
        [fieldId]: { uploading: true, filename: file.name, error: undefined },
      }));
      try {
        const fd = new FormData();
        fd.append('file', file);
        const res = await fetch(`/api/surveys/${slug}/upload`, {
          method: 'POST',
          body: fd,
        });
        const json = await res.json();
        if (!res.ok || !json?.success) {
          const msg = json?.message || `Upload failed (HTTP ${res.status})`;
          setFileFieldState((prev) => ({
            ...prev,
            [fieldId]: { uploading: false, error: msg },
          }));
          // Clear any prior answer — partial state is worse than no state.
          setAnswers((prev) => {
            const next = { ...prev };
            delete next[fieldId];
            return next;
          });
          return;
        }
        const url = json.data?.url;
        const filename = json.data?.filename || file.name;
        setAnswers((prev) => ({ ...prev, [fieldId]: url }));
        setFileFieldState((prev) => ({
          ...prev,
          [fieldId]: { uploading: false, filename, error: undefined },
        }));
      } catch (err) {
        setFileFieldState((prev) => ({
          ...prev,
          [fieldId]: {
            uploading: false,
            error: err instanceof Error ? err.message : 'Upload failed',
          },
        }));
      }
    },
    [slug],
  );

  function isFieldVisible(field: SurveyField): boolean {
    return evalFieldVisible(field, answers);
  }

  function validateCurrentPage(): string | null {
    const pageFields = pages[pageIndex] || [];
    for (const field of pageFields) {
      if (!isFieldVisible(field)) continue;
      if (field.required && !DISPLAY_ONLY_TYPES.has(field.type)) {
        const val = answers[field.id];
        if (val === undefined || val === null || val === '') {
          // For a consent/agreement checkbox the label is a long paragraph that
          // already sits right next to the box — echoing it back as a banner is
          // redundant. Use a short, clear prompt instead.
          return field.type === 'checkbox'
            ? 'Please check the box to agree before continuing.'
            : `${field.label} is required`;
        }
      }
    }
    if (pageIndex === 0 && survey?.requireEmail && !email?.trim()) {
      return 'Email is required';
    }
    return null;
  }

  // Unlike validateCurrentPage(), this does NOT check isFieldVisible() first.
  // showIf and goToPage on the same field are not a supported combination: a
  // field hidden by a dependency can still carry a stale answer from before
  // it was hidden, and that stale answer will still trigger the jump here.
  function getNextPage(): number {
    const pageFields = pages[pageIndex] || [];
    for (const field of pageFields) {
      if (field.goToPage && (field.type === 'select' || field.type === 'radio')) {
        const val = String(answers[field.id] || '');
        if (val && field.goToPage[val] !== undefined) {
          return field.goToPage[val];
        }
      }
    }
    return pageIndex + 1;
  }

  function handleNext() {
    if (hasInflightUpload) {
      setError('Please wait for file uploads to finish');
      return;
    }
    const err = validateCurrentPage();
    if (err) { setError(err); return; }
    setError('');
    const next = getNextPage();
    // Persist progress for resume — fire-and-forget, lands at the destination
    // page so a returning visitor lands where they left off.
    savePartial({ lastPage: next });
    setCurrentPage(next);
    setPageHistory(prev => [...prev, next]);
    pageEnteredAtRef.current = Date.now();
  }

  function handleBack() {
    if (pageHistory.length <= 1) return;
    const newHistory = pageHistory.slice(0, -1);
    setPageHistory(newHistory);
    setCurrentPage(newHistory[newHistory.length - 1]);
    pageEnteredAtRef.current = Date.now();
    setError('');
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    // See pageEnteredAtRef — swallow the double-click-Next ghost submit.
    if (Date.now() - pageEnteredAtRef.current < 500) return;
    if (hasInflightUpload) {
      setError('Please wait for file uploads to finish');
      return;
    }
    const err = validateCurrentPage();
    if (err) { setError(err); return; }
    setSubmitting(true);
    setError('');

    const res = await fetch(`/api/surveys/${slug}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        formName: 'main',
        answers,
        email: email || undefined,
        name: name || undefined,
        source,
        sourceId: sourceId || undefined,
        // Echo the variant id back so the response is attributed to the
        // bucket this visitor saw — not whatever the dashboard computes
        // post-hoc. `null` / `undefined` is fine when no variants exist.
        variantId: survey?.variantId ?? undefined,
        // RESP-02: server closes out the partial row when sessionId is set,
        // so a returning visitor sees a fresh form instead of resuming a
        // submission they already completed.
        sessionId: sessionIdRef.current ?? undefined,
      }),
    });
    const data = await res.json();
    setSubmitting(false);

    if (!data.success) { setError(data.message || 'Failed to submit'); return; }

    // Mint a fresh session id for any subsequent submissions on this browser.
    clearPartialSessionId(slug);

    if (data.data.redirectUrl) {
      window.location.href = data.data.redirectUrl;
      return;
    }

    setThankYou({
      title: data.data.thankYouTitle || 'Thank you!',
      message: data.data.thankYouMessage || '',
    });
    // PDF-01: only offer the certificate when the survey has it enabled
    // AND the server echoed back a response id. Either piece missing →
    // no button is shown (the cert route would 404 anyway).
    if (data.data.certificateEnabled && typeof data.data.responseId === 'number') {
      setCertificate({ responseId: data.data.responseId });
    }
    setSubmitted(true);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin w-8 h-8 border-3 border-gray-300 border-t-blue-600 rounded-full" />
      </div>
    );
  }

  if (error && !survey) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <span className="material-icons text-4xl text-gray-300 mb-3 block">error_outline</span>
          <p className="text-gray-600 dark:text-gray-400">{error}</p>
        </div>
      </div>
    );
  }

  if (!survey) return null;

  const br = survey.branding;
  const st = survey.styling || {};
  const so = styleOverrides;
  // Cascade: block-level overrides → survey.styling → branding profile → defaults.
  const accent = so?.primaryColor || st.primaryColor || br?.primaryColor || survey.color || '#2563eb';
  const secondaryColor = so?.secondaryColor || st.secondaryColor || br?.secondaryColor;
  const accentColor = so?.accentColor || st.accentColor || br?.accentColor;
  const bgColor = so?.backgroundColor || st.backgroundColor || br?.backgroundColor;
  const txtColor = so?.textColor || st.textColor || br?.textColor;
  const labelColor = so?.labelColor || txtColor;
  const logoUrl = showLogo ? br?.logoUrl : undefined;
  const headingFont = so?.headingFont || st.headingFont || br?.headingFont;
  const bodyFont = so?.bodyFont || st.bodyFont || br?.bodyFont;
  const btnRadius = so?.buttonBorderRadius || st.buttonBorderRadius || br?.buttonStyle?.borderRadius || so?.borderRadius || st.borderRadius || br?.borderRadius;
  const btnBg = so?.buttonBg || st.buttonPrimaryBg || br?.buttonStyle?.primaryBg || accent;
  const btnText = so?.buttonText || st.buttonPrimaryText || br?.buttonStyle?.primaryText || '#ffffff';
  const inputOptionTextColor = st.inputOptionTextColor;
  const inputTextColor = so?.inputTextColor || st.inputTextColor || txtColor;
  const hasBranding = !!br || Object.keys(st).length > 0 || !!so;
  const hideCardChrome = so?.hideCardChrome === true;

  const cardBg = hideCardChrome
    ? 'transparent'
    : (so?.formBg || st.formBg
      || (hasBranding
        ? (bgColor && bgColor !== '#ffffff' ? lightenColor(bgColor, 0.05) : '#ffffff')
        : undefined));
  // Branding-tinted defaults: ${color}30 / ${color}40 append a hex alpha byte
  // (≈19%/25% opacity) so the card/input borders pick up the brand without
  // being aggressive. Explicit overrides skip the tint.
  const cardBorder = so?.formBorderColor
    ?? (secondaryColor ? `${secondaryColor}30` : undefined);
  const inputBorder = so?.inputBorderColor
    ?? (accentColor ? `${accentColor}40` : undefined);
  const inputBg = so?.inputBg || st.inputBg
    || (hasBranding ? (bgColor === '#ffffff' ? '#ffffff' : bgColor ? lightenColor(bgColor, 0.08) : undefined) : undefined);
  const inputFocusRing = so?.inputFocusRingColor || accent;
  const formRadius = so?.formBorderRadius || so?.borderRadius;
  const formPadding = so?.formPadding;
  const formShadow = hideCardChrome ? 'none' : so?.formShadow;
  // When hiding chrome we also need to neutralise the always-on Tailwind
  // `border border-gray-200 dark:border-gray-800` classes baked into the card
  // sections — done by forcing borderWidth to 0 in the inline style.
  const cardBorderWidth = hideCardChrome ? '0' : so?.formBorderWidth;

  const wrapperStyle: React.CSSProperties = {
    ...(txtColor ? { color: txtColor } : {}),
    ...(bodyFont ? { fontFamily: `"${bodyFont}", sans-serif` } : {}),
    ...(survey.cssVars || {}),
  };

  const headingStyle: React.CSSProperties | undefined = headingFont
    ? { fontFamily: `"${headingFont}", sans-serif` }
    : undefined;

  const cardStyle: React.CSSProperties = {
    ...(cardBg ? { backgroundColor: cardBg } : {}),
    ...(cardBorder && !hideCardChrome ? { borderColor: cardBorder } : {}),
    ...(cardBorderWidth !== undefined ? { borderWidth: cardBorderWidth } : {}),
    ...(formRadius ? { borderRadius: formRadius } : {}),
    ...(formPadding ? { padding: formPadding } : {}),
    ...(formShadow !== undefined ? { boxShadow: formShadow } : {}),
  };

  // Label color is exposed as a custom property so child labels can opt in
  // without restructuring the JSX tree (kept here in case downstream needs).
  const labelStyle: React.CSSProperties | undefined = labelColor
    ? { color: labelColor }
    : undefined;

  const inputStyle: React.CSSProperties = {
    '--tw-ring-color': inputFocusRing,
    ...(inputBorder ? { borderColor: inputBorder } : {}),
    ...(so?.inputBorderWidth ? { borderWidth: so.inputBorderWidth } : {}),
    ...(so?.inputBorderRadius ? { borderRadius: so.inputBorderRadius } : {}),
    ...(inputBg ? { backgroundColor: inputBg } : {}),
    ...(inputTextColor ? { color: inputTextColor } : (inputBg ? { color: '#111827' } : {})),
  } as React.CSSProperties;

  if (submitted) {
    // Render the recommendation (when configured) below the thank-you card,
    // using the same component the pitch deck uses. The renderer was designed
    // for a deck's themed full-screen context, so we wrap it in a self-
    // contained white card and force a light theme — keeps it readable on
    // either light or dark page backgrounds (the standalone survey page uses
    // bg-gray-50 dark:bg-gray-950, which would render dark-on-dark otherwise).
    const rec = survey.recommendation;
    const recCardBg = cardBg || '#ffffff';
    const recTextColor = txtColor || '#111827';
    const recTheme: PitchDeckTheme | null = rec ? {
      primaryColor: accent,
      accentColor: accentColor || accent,
      backgroundColor: recCardBg,
      textColor: recTextColor,
      headingFont: headingFont || 'Inter',
      bodyFont: bodyFont || 'Inter',
      logo: logoUrl,
    } : null;

    return (
      <div className="flex flex-col items-center justify-center py-20 px-4 gap-10" style={wrapperStyle}>
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-800 p-10 max-w-md w-full text-center" style={cardStyle}>
          {logoUrl && <img src={logoUrl} alt="Logo" className="h-8 object-contain mx-auto mb-4" />}
          <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: `${accent}15` }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h2
            className="text-xl font-bold text-gray-900 dark:text-white"
            style={{ ...headingStyle, ...(txtColor ? { color: txtColor } : {}) }}
          >
            {thankYou.title}
          </h2>
          {thankYou.message && (
            <p
              className="text-gray-600 dark:text-gray-400 mt-2"
              style={txtColor ? { color: txtColor, opacity: 0.75 } : undefined}
            >
              {thankYou.message}
            </p>
          )}
          {certificate && (
            <a
              href={`/api/surveys/${slug}/certificate?responseId=${certificate.responseId}`}
              className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 rounded-lg font-medium text-sm transition-opacity hover:opacity-90"
              style={{ backgroundColor: btnBg, color: btnText, ...(btnRadius ? { borderRadius: btnRadius } : {}) }}
            >
              <span className="material-icons text-lg">download</span>
              Download Certificate
            </a>
          )}
        </div>

        {rec && recTheme && (
          <div
            className="w-full max-w-3xl rounded-2xl shadow-lg border border-gray-200 dark:border-gray-800 overflow-hidden"
            style={{ backgroundColor: recCardBg, color: recTextColor }}
          >
            {/* The renderer assumes a full-screen deck slide (min-h-screen +
                large vertical padding). We override that here to fit a card. */}
            <div className="[&>div]:!min-h-0 [&>div]:!py-8 [&>div]:!items-stretch">
              <SurveyRecommendationRenderer config={rec} answers={answers} theme={recTheme} />
            </div>
          </div>
        )}
      </div>
    );
  }

  const currentFields = (pages[pageIndex] || []).filter(isFieldVisible);
  let questionOffset = 0;
  for (let p = 0; p < pageIndex; p++) {
    questionOffset += (pages[p] || []).filter(f => !DISPLAY_ONLY_TYPES.has(f.type) && isFieldVisible(f)).length;
  }

  return (
    <div className="py-8 px-4" style={wrapperStyle}>
      <div className="max-w-2xl mx-auto">
        {logoUrl && (
          <div className="flex justify-center mb-4">
            <img src={logoUrl} alt="Logo" className="h-8 object-contain" />
          </div>
        )}
        {/* Header */}
        {showPageTitle && (
          <div className="bg-white dark:bg-gray-900 rounded-t-2xl shadow-sm border border-gray-200 dark:border-gray-800 border-b-0 p-6" style={cardStyle}>
            <div className="h-1.5 rounded-full mb-6" style={{ backgroundColor: accent }} />
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white" style={{ ...headingStyle, ...(txtColor ? { color: txtColor } : {}) }}>{survey.title}</h1>
            {showDescription && survey.description && (
              <p className="text-gray-600 dark:text-gray-400 mt-2" style={txtColor ? { color: `${txtColor}bb` } : undefined}>{survey.description}</p>
            )}

            {isMultiPage && (
              <div className="mt-4">
                <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
                  <span>Page {pageIndex + 1} of {totalPages}</span>
                  <span>{Math.round(((pageIndex + 1) / totalPages) * 100)}%</span>
                </div>
                <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500 ease-out"
                    style={{ width: `${((pageIndex + 1) / totalPages) * 100}%`, backgroundColor: accent }}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} onKeyDown={blockImplicitSubmit}>
          <div className={`bg-white dark:bg-gray-900 shadow-sm border border-gray-200 dark:border-gray-800 ${showPageTitle ? 'border-t-0' : 'rounded-t-2xl'} p-6 space-y-6`} style={cardStyle}>
            {/* Email/Name on first page if required */}
            {pageIndex === 0 && survey.requireEmail && (
              <div className="space-y-4 pb-4 border-b border-gray-200 dark:border-gray-700">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1" style={labelStyle}>
                    Your Email <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:border-transparent"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1" style={labelStyle}>Your Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="John Doe"
                    className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:border-transparent"
                    style={inputStyle}
                  />
                </div>
              </div>
            )}

            {error && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 text-sm text-red-700 dark:text-red-400">
                {error}
              </div>
            )}

            {/* Current page fields */}
            {currentFields.map((field, idx) => {
              const qNum = DISPLAY_ONLY_TYPES.has(field.type) ? 0 : questionOffset + currentFields.slice(0, idx).filter(f => !DISPLAY_ONLY_TYPES.has(f.type)).length + 1;

              return (
                <div key={field.id}>
                  {field.type === 'heading' ? (
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white pt-2" style={{ ...headingStyle, ...(txtColor ? { color: txtColor } : {}) }}>{resolvePiping(field.label, answers)}</h3>
                  ) : field.type === 'image' ? (
                    <figure className="my-1">
                      <img src={field.mediaUrl} alt={field.label || ''} className="w-full rounded-lg border border-gray-200 dark:border-gray-700" />
                      {field.label && <figcaption className="text-xs text-gray-500 dark:text-gray-400 mt-1">{resolvePiping(field.label, answers)}</figcaption>}
                    </figure>
                  ) : field.type === 'video' ? (
                    <figure className="my-1">
                      <video src={field.mediaUrl} controls className="w-full rounded-lg border border-gray-200 dark:border-gray-700" />
                      {field.label && <figcaption className="text-xs text-gray-500 dark:text-gray-400 mt-1">{resolvePiping(field.label, answers)}</figcaption>}
                    </figure>
                  ) : (
                    <div className="space-y-1.5">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300" style={labelStyle}>
                        <span className="text-gray-400 mr-1.5" style={secondaryColor ? { color: secondaryColor } : undefined}>{qNum}.</span>
                        {resolvePiping(field.label, answers)}
                        {field.required && <span className="text-red-500 ml-0.5">*</span>}
                      </label>
                      {field.helpText && <p className="text-xs text-gray-500 dark:text-gray-400">{resolvePiping(field.helpText, answers)}</p>}

                      {renderField(field, answers, setAnswer, accent, inputStyle, inputOptionTextColor, {
                        fileFieldState: fileFieldState[field.id],
                        onFileSelect: (file) => handleFileUpload(field.id, file),
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Navigation / Submit */}
          <div className="bg-white dark:bg-gray-900 rounded-b-2xl shadow-sm border border-gray-200 dark:border-gray-800 border-t-0 px-6 pb-6" style={cardStyle}>
            {error && !currentFields.length && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 text-sm text-red-700 dark:text-red-400 mb-4">
                {error}
              </div>
            )}
            <div className="flex items-center justify-between">
              {isMultiPage && pageIndex > 0 ? (
                <button
                  type="button"
                  onClick={handleBack}
                  className="flex items-center gap-1 px-4 py-2.5 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                  Back
                </button>
              ) : <div />}

              {isMultiPage && !isLastPage ? (
                <button
                  type="button"
                  onClick={handleNext}
                  disabled={hasInflightUpload}
                  className="flex items-center gap-1 px-6 py-2.5 rounded-lg font-medium text-sm transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ backgroundColor: btnBg, color: btnText, ...(btnRadius ? { borderRadius: btnRadius } : {}) }}
                >
                  {hasInflightUpload ? 'Uploading…' : 'Next'}
                  {!hasInflightUpload && (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                  )}
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={submitting || hasInflightUpload}
                  className="px-6 py-2.5 rounded-lg font-medium text-sm transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ backgroundColor: btnBg, color: btnText, ...(btnRadius ? { borderRadius: btnRadius } : {}) }}
                >
                  {submitting ? 'Submitting...' : hasInflightUpload ? 'Uploading…' : 'Submit'}
                </button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
