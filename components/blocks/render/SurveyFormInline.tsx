'use client';

import { useState, useEffect, FormEvent, useCallback, useRef } from 'react';
import { isFieldVisible as evalFieldVisible, resolvePiping } from '@/lib/survey-logic';
import { SurveyRecommendationRenderer } from '@/components/pitch-deck/SurveyRecommendationRenderer';
import type { SurveyRecommendationConfig, PitchDeckTheme } from '@/lib/db/schema';
import { ALLOWED_SURVEY_UPLOAD_MIMES } from '@/lib/surveys/upload-validation';

/**
 * Mirror of the server allow-list, joined for use as the <input type="file">
 * `accept` attribute. UX hint only — the server is the gate.
 */
const SURVEY_FILE_ACCEPT_ATTR = ALLOWED_SURVEY_UPLOAD_MIMES.join(',');

interface FileFieldState {
  /** Upload in flight — Submit / Next stays disabled until cleared. */
  uploading: boolean;
  /** Filename displayed in the "uploaded" badge once the URL is stored. */
  filename?: string;
  /** Last error message — clears on next selection. */
  error?: string;
}

/**
 * RESP-02: per-(slug, browser) session identifier used to upsert the
 * `survey_partial_responses` row. Stored in localStorage so a returning
 * visitor on the same browser resumes where they left off; lost if they
 * clear storage or switch devices (acceptable for a public form).
 */
function partialSessionKey(slug: string): string {
  return `sd-survey-session:${slug}`;
}

function getOrCreatePartialSessionId(slug: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const key = partialSessionKey(slug);
    let id = window.localStorage.getItem(key);
    if (!id) {
      // crypto.randomUUID is widely supported in 2026 browsers; fall back to
      // a Math.random hex string only if it's somehow missing.
      id =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : Array.from({ length: 4 }, () =>
              Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, '0'),
            ).join('-');
      window.localStorage.setItem(key, id);
    }
    return id;
  } catch {
    return null;
  }
}

function clearPartialSessionId(slug: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(partialSessionKey(slug));
  } catch {
    // localStorage can throw in private-mode or quota-exceeded — best-effort.
  }
}

function lightenColor(hex: string, amount: number): string {
  const c = hex.replace('#', '');
  const r = Math.min(255, parseInt(c.slice(0, 2), 16) + Math.round(255 * amount));
  const g = Math.min(255, parseInt(c.slice(2, 4), 16) + Math.round(255 * amount));
  const b = Math.min(255, parseInt(c.slice(4, 6), 16) + Math.round(255 * amount));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

interface SurveyField {
  id: string;
  type: string;
  label: string;
  placeholder: string;
  helpText: string;
  required: boolean;
  options: string[];
  min?: number;
  max?: number;
  step?: number;
  showIf?: { fieldId: string; values: string[] };
  goToPage?: Record<string, number>;
  order: number;
  page?: number;
}

interface BrandingInfo {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  backgroundColor: string;
  textColor: string;
  headingFont: string;
  bodyFont: string;
  logoUrl: string;
  borderRadius?: string;
  buttonStyle?: {
    primaryBg?: string; primaryText?: string; primaryHoverBg?: string;
    borderRadius?: string;
  };
}

interface SurveyStyling {
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  backgroundColor?: string;
  textColor?: string;
  headingFont?: string;
  bodyFont?: string;
  borderRadius?: string;
  buttonPrimaryBg?: string;
  buttonPrimaryText?: string;
  buttonBorderRadius?: string;
  formBg?: string;
  inputBg?: string;
  inputTextColor?: string;
  inputOptionTextColor?: string;
  hideTitle?: boolean;
  hideLogo?: boolean;
}

interface SurveyData {
  id: number;
  title: string;
  description: string | null;
  fields: SurveyField[];
  color: string;
  requireEmail: boolean;
  /** PDF-01: when true, the thank-you screen offers a branded PDF certificate. */
  certificateEnabled?: boolean;
  thankYouTitle: string;
  thankYouMessage: string;
  redirectUrl: string | null;
  branding?: BrandingInfo | null;
  styling?: SurveyStyling | null;
  cssVars?: Record<string, string>;
  recommendation?: SurveyRecommendationConfig | null;
  /**
   * A/B variant id picked for this visitor. When non-null, `fields` already
   * reflects the variant's field set (the route swapped it in server-side).
   * The id is echoed back on submit so responses can be attributed to the
   * variant they were collected under.
   */
  variantId?: number | null;
  variantName?: string | null;
}

export interface SurveyFormInlineProps {
  slug: string;
  showPageTitle?: boolean;
  showDescription?: boolean;
  /** Show the survey's logo above the form. Defaults to true. */
  showLogo?: boolean;
  /** Block-level overrides — take precedence over survey.styling and branding. */
  styleOverrides?: {
    primaryColor?: string;
    backgroundColor?: string;
    textColor?: string;
    formBg?: string;
    inputBg?: string;
    headingFont?: string;
    bodyFont?: string;
    buttonBg?: string;
    buttonText?: string;
    buttonBorderRadius?: string;
    borderRadius?: string;
  };
  /** Optional source tracking */
  source?: string;
  sourceId?: string;
}

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
  // RESP-02: stable across renders; lazy-initialised so SSR sees `null` and
  // hydration assigns once on the client.
  const sessionIdRef = useRef<string | null>(null);
  const [resumed, setResumed] = useState(false);
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
                setCurrentPage(p.lastPage);
                setPageHistory([0, p.lastPage]);
              }
              setResumed(true);
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
  const isLastPage = currentPage >= totalPages - 1;

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
    const pageFields = pages[currentPage] || [];
    for (const field of pageFields) {
      if (!isFieldVisible(field)) continue;
      if (field.required && field.type !== 'heading') {
        const val = answers[field.id];
        if (val === undefined || val === null || val === '') {
          return `${field.label} is required`;
        }
      }
    }
    if (currentPage === 0 && survey?.requireEmail && !email?.trim()) {
      return 'Email is required';
    }
    return null;
  }

  function getNextPage(): number {
    const pageFields = pages[currentPage] || [];
    for (const field of pageFields) {
      if (field.goToPage && (field.type === 'select' || field.type === 'radio')) {
        const val = String(answers[field.id] || '');
        if (val && field.goToPage[val] !== undefined) {
          return field.goToPage[val];
        }
      }
    }
    return currentPage + 1;
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
  }

  function handleBack() {
    if (pageHistory.length <= 1) return;
    const newHistory = pageHistory.slice(0, -1);
    setPageHistory(newHistory);
    setCurrentPage(newHistory[newHistory.length - 1]);
    setError('');
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
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
  const secondaryColor = st.secondaryColor || br?.secondaryColor;
  const accentColor = st.accentColor || br?.accentColor;
  const bgColor = so?.backgroundColor || st.backgroundColor || br?.backgroundColor;
  const txtColor = so?.textColor || st.textColor || br?.textColor;
  const logoUrl = showLogo ? br?.logoUrl : undefined;
  const headingFont = so?.headingFont || st.headingFont || br?.headingFont;
  const bodyFont = so?.bodyFont || st.bodyFont || br?.bodyFont;
  const btnRadius = so?.buttonBorderRadius || st.buttonBorderRadius || br?.buttonStyle?.borderRadius || so?.borderRadius || st.borderRadius || br?.borderRadius;
  const btnBg = so?.buttonBg || st.buttonPrimaryBg || br?.buttonStyle?.primaryBg || accent;
  const btnText = so?.buttonText || st.buttonPrimaryText || br?.buttonStyle?.primaryText || '#ffffff';
  const inputOptionTextColor = st.inputOptionTextColor;
  const inputTextColor = st.inputTextColor || txtColor;
  const hasBranding = !!br || Object.keys(st).length > 0 || !!so;

  const cardBg = so?.formBg || st.formBg
    || (hasBranding
      ? (bgColor && bgColor !== '#ffffff' ? lightenColor(bgColor, 0.05) : '#ffffff')
      : undefined);
  const cardBorder = secondaryColor ? `${secondaryColor}30` : undefined;
  const inputBorder = accentColor ? `${accentColor}40` : undefined;
  const inputBg = so?.inputBg || st.inputBg
    || (hasBranding ? (bgColor === '#ffffff' ? '#ffffff' : bgColor ? lightenColor(bgColor, 0.08) : undefined) : undefined);

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
    ...(cardBorder ? { borderColor: cardBorder } : {}),
  };

  const inputStyle: React.CSSProperties = {
    '--tw-ring-color': accent,
    ...(inputBorder ? { borderColor: inputBorder } : {}),
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
          <h2 className="text-xl font-bold text-gray-900 dark:text-white" style={headingStyle}>{thankYou.title}</h2>
          {thankYou.message && <p className="text-gray-600 dark:text-gray-400 mt-2">{thankYou.message}</p>}
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

  const currentFields = (pages[currentPage] || []).filter(isFieldVisible);
  let questionOffset = 0;
  for (let p = 0; p < currentPage; p++) {
    questionOffset += (pages[p] || []).filter(f => f.type !== 'heading' && isFieldVisible(f)).length;
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
                  <span>Page {currentPage + 1} of {totalPages}</span>
                  <span>{Math.round(((currentPage + 1) / totalPages) * 100)}%</span>
                </div>
                <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500 ease-out"
                    style={{ width: `${((currentPage + 1) / totalPages) * 100}%`, backgroundColor: accent }}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <div className={`bg-white dark:bg-gray-900 shadow-sm border border-gray-200 dark:border-gray-800 ${showPageTitle ? 'border-t-0' : 'rounded-t-2xl'} p-6 space-y-6`} style={cardStyle}>
            {/* Email/Name on first page if required */}
            {currentPage === 0 && survey.requireEmail && (
              <div className="space-y-4 pb-4 border-b border-gray-200 dark:border-gray-700">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1" style={txtColor ? { color: txtColor } : undefined}>
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
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1" style={txtColor ? { color: txtColor } : undefined}>Your Name</label>
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
              const qNum = field.type === 'heading' ? 0 : questionOffset + currentFields.slice(0, idx).filter(f => f.type !== 'heading').length + 1;

              return (
                <div key={field.id}>
                  {field.type === 'heading' ? (
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white pt-2" style={{ ...headingStyle, ...(txtColor ? { color: txtColor } : {}) }}>{resolvePiping(field.label, answers)}</h3>
                  ) : (
                    <div className="space-y-1.5">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300" style={txtColor ? { color: txtColor } : undefined}>
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
              {isMultiPage && currentPage > 0 ? (
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

// ─── Field Renderer ─────────────────────────────────────────────────────────

interface FileFieldRenderOptions {
  fileFieldState?: FileFieldState;
  onFileSelect: (file: File) => void;
}

function renderField(
  field: SurveyField,
  answers: Record<string, unknown>,
  setAnswer: (id: string, val: unknown) => void,
  color: string,
  fieldInputStyle?: React.CSSProperties,
  optionTextColor?: string,
  fileOpts?: FileFieldRenderOptions,
) {
  const inputCls = "w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:border-transparent";
  const ringStyle = { '--tw-ring-color': color, ...(fieldInputStyle || {}) } as React.CSSProperties;
  const optionLabelCls = optionTextColor
    ? 'text-sm'
    : 'text-sm text-gray-700 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-white';
  const optionLabelStyle = optionTextColor ? { color: optionTextColor } : undefined;

  switch (field.type) {
    case 'text':
    case 'email':
    case 'phone':
    case 'url':
      return (
        <input
          type={field.type === 'phone' ? 'tel' : field.type}
          required={field.required}
          placeholder={field.placeholder}
          value={(answers[field.id] as string) || ''}
          onChange={(e) => setAnswer(field.id, e.target.value)}
          className={inputCls}
          style={ringStyle}
        />
      );

    case 'textarea':
      return (
        <textarea
          required={field.required}
          placeholder={field.placeholder}
          rows={3}
          value={(answers[field.id] as string) || ''}
          onChange={(e) => setAnswer(field.id, e.target.value)}
          className={`${inputCls} resize-none`}
          style={ringStyle}
        />
      );

    case 'number':
      return (
        <input
          type="number"
          required={field.required}
          placeholder={field.placeholder}
          min={field.min}
          max={field.max}
          value={(answers[field.id] as string) || ''}
          onChange={(e) => setAnswer(field.id, e.target.value)}
          className={inputCls}
          style={ringStyle}
        />
      );

    case 'date':
      return (
        <input
          type="date"
          required={field.required}
          value={(answers[field.id] as string) || ''}
          onChange={(e) => setAnswer(field.id, e.target.value)}
          className={inputCls}
          style={ringStyle}
        />
      );

    case 'select':
      return (
        <select
          required={field.required}
          value={(answers[field.id] as string) || ''}
          onChange={(e) => setAnswer(field.id, e.target.value)}
          className={inputCls}
          style={ringStyle}
        >
          <option value="">Select...</option>
          {field.options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
        </select>
      );

    case 'radio':
      return (
        <div className="space-y-2">
          {field.options.map(opt => (
            <label key={opt} className="flex items-center gap-2.5 cursor-pointer group">
              <input
                type="radio"
                name={field.id}
                value={opt}
                checked={answers[field.id] === opt}
                onChange={() => setAnswer(field.id, opt)}
                className="w-4 h-4"
                style={{ accentColor: color }}
              />
              <span className={optionLabelCls} style={optionLabelStyle}>{opt}</span>
            </label>
          ))}
        </div>
      );

    case 'checkbox':
      return (
        <div className="space-y-2">
          {field.options.map(opt => {
            const checked = Array.isArray(answers[field.id]) && (answers[field.id] as string[]).includes(opt);
            return (
              <label key={opt} className="flex items-center gap-2.5 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => {
                    const current = (answers[field.id] as string[]) || [];
                    setAnswer(field.id, e.target.checked ? [...current, opt] : current.filter(v => v !== opt));
                  }}
                  className="w-4 h-4 rounded"
                  style={{ accentColor: color }}
                />
                <span className={optionLabelCls} style={optionLabelStyle}>{opt}</span>
              </label>
            );
          })}
        </div>
      );

    case 'toggle':
      return (
        <button
          type="button"
          onClick={() => setAnswer(field.id, !answers[field.id])}
          className="flex items-center gap-2"
        >
          <div
            className={`w-10 h-6 rounded-full transition-colors relative ${answers[field.id] ? '' : 'bg-gray-300 dark:bg-gray-600'}`}
            style={answers[field.id] ? { backgroundColor: color } : undefined}
          >
            <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${answers[field.id] ? 'translate-x-4.5' : 'translate-x-0.5'}`} />
          </div>
          <span className={optionTextColor ? 'text-sm' : 'text-sm text-gray-700 dark:text-gray-300'} style={optionLabelStyle}>{answers[field.id] ? 'Yes' : 'No'}</span>
        </button>
      );

    case 'rating':
      return (
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map(star => (
            <button
              key={star}
              type="button"
              onClick={() => setAnswer(field.id, star)}
              className="text-2xl transition-colors"
              style={{ color: (answers[field.id] as number) >= star ? color : '#d1d5db' }}
            >
              &#9733;
            </button>
          ))}
        </div>
      );

    case 'nps': {
      // Standard 0-10 NPS scale. We render 11 buttons in a single row so the
      // visitor can pick their score directly without a slider. The selected
      // value is stored as an integer (matches scoreNps in lib/surveys/score.ts:
      // 0-6 = detractor, 7-8 = passive, 9-10 = promoter). Buttons are colour-
      // coded by band so the meaning of the scale is visible at a glance.
      const selected = answers[field.id];
      const selectedNum = typeof selected === 'number' ? selected : Number(selected);
      const bandColor = (n: number): string => {
        if (n <= 6) return '#dc2626'; // detractor — red-600
        if (n <= 8) return '#f59e0b'; // passive  — amber-500
        return '#16a34a';             // promoter — green-600
      };
      return (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {Array.from({ length: 11 }, (_, n) => {
              const isActive = Number.isFinite(selectedNum) && selectedNum === n;
              return (
                <button
                  key={n}
                  type="button"
                  aria-label={`NPS score ${n}`}
                  aria-pressed={isActive}
                  onClick={() => setAnswer(field.id, n)}
                  className="min-w-9 h-9 px-2 rounded-md border text-sm font-medium transition-all"
                  style={{
                    borderColor: isActive ? bandColor(n) : '#d1d5db',
                    backgroundColor: isActive ? bandColor(n) : 'transparent',
                    color: isActive ? '#ffffff' : (optionTextColor || undefined),
                  }}
                >
                  {n}
                </button>
              );
            })}
          </div>
          <div className="flex justify-between text-xs text-gray-500">
            <span>Not at all likely</span>
            <span>Extremely likely</span>
          </div>
        </div>
      );
    }

    case 'slider':
      return (
        <div className="space-y-1">
          <input
            type="range"
            min={field.min ?? 0}
            max={field.max ?? 100}
            step={field.step ?? 1}
            value={(answers[field.id] as number) ?? (field.min ?? 0)}
            onChange={(e) => setAnswer(field.id, Number(e.target.value))}
            className="w-full"
            style={{ accentColor: color }}
          />
          <div className="flex justify-between text-xs text-gray-500">
            <span>{field.min ?? 0}</span>
            <span className="font-medium text-gray-700 dark:text-gray-300">{String(answers[field.id] ?? field.min ?? 0)}</span>
            <span>{field.max ?? 100}</span>
          </div>
        </div>
      );

    case 'file': {
      const state = fileOpts?.fileFieldState;
      const uploaded = typeof answers[field.id] === 'string' && (answers[field.id] as string).length > 0;
      const uploading = state?.uploading === true;
      const errMsg = state?.error;
      return (
        <div className="space-y-2">
          <label
            className={`flex items-center gap-2 px-3 py-2.5 border border-dashed rounded-lg cursor-pointer transition-colors ${
              uploading ? 'opacity-70 cursor-wait' : 'hover:bg-gray-50 dark:hover:bg-gray-800'
            }`}
            style={{ borderColor: color }}
          >
            <span className="material-icons text-base" style={{ color }}>
              {uploading ? 'hourglass_top' : 'attach_file'}
            </span>
            <span className="text-sm text-gray-700 dark:text-gray-300">
              {uploading ? 'Uploading…' : uploaded ? 'Replace file' : 'Choose file'}
            </span>
            <input
              type="file"
              accept={SURVEY_FILE_ACCEPT_ATTR}
              required={field.required && !uploaded}
              disabled={uploading}
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f && fileOpts) fileOpts.onFileSelect(f);
                // Reset the value so selecting the same file twice still
                // triggers `change`. The answer state is the source of truth.
                e.target.value = '';
              }}
            />
          </label>
          {uploaded && !uploading && (
            <div className="flex items-center gap-1.5 text-sm text-green-700 dark:text-green-400">
              <span className="material-icons text-base">check_circle</span>
              <span className="truncate">{state?.filename || 'File uploaded'}</span>
            </div>
          )}
          {errMsg && (
            <div className="flex items-center gap-1.5 text-sm text-red-600 dark:text-red-400">
              <span className="material-icons text-base">error_outline</span>
              <span>{errMsg}</span>
            </div>
          )}
        </div>
      );
    }

    default:
      return null;
  }
}
