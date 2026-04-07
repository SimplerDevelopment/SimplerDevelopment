'use client';

import { useState, useEffect, FormEvent, useCallback } from 'react';
import { isFieldVisible as evalFieldVisible, resolvePiping } from '@/lib/survey-logic';

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

interface SurveyData {
  id: number;
  title: string;
  description: string | null;
  fields: SurveyField[];
  color: string;
  requireEmail: boolean;
  thankYouTitle: string;
  thankYouMessage: string;
  redirectUrl: string | null;
  branding?: BrandingInfo | null;
  cssVars?: Record<string, string>;
}

export interface SurveyFormInlineProps {
  slug: string;
  showPageTitle?: boolean;
  /** Optional source tracking */
  source?: string;
  sourceId?: string;
}

export function SurveyFormInline({
  slug,
  showPageTitle = true,
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
  const [currentPage, setCurrentPage] = useState(0);
  const [pageHistory, setPageHistory] = useState<number[]>([0]);

  useEffect(() => {
    fetch(`/api/surveys/${slug}`)
      .then(r => r.json())
      .then(data => {
        if (data.success) setSurvey(data.data);
        else setError(data.message || 'Survey not available');
        setLoading(false);
      })
      .catch(() => { setError('Failed to load survey'); setLoading(false); });
  }, [slug]);

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
    const err = validateCurrentPage();
    if (err) { setError(err); return; }
    setError('');
    const next = getNextPage();
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
    const err = validateCurrentPage();
    if (err) { setError(err); return; }
    setSubmitting(true);
    setError('');

    const res = await fetch(`/api/surveys/${slug}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        answers,
        email: email || undefined,
        name: name || undefined,
        source,
        sourceId: sourceId || undefined,
      }),
    });
    const data = await res.json();
    setSubmitting(false);

    if (!data.success) { setError(data.message || 'Failed to submit'); return; }

    if (data.data.redirectUrl) {
      window.location.href = data.data.redirectUrl;
      return;
    }

    setThankYou({
      title: data.data.thankYouTitle || 'Thank you!',
      message: data.data.thankYouMessage || '',
    });
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
  const accent = br?.primaryColor || survey.color || '#2563eb';
  const secondaryColor = br?.secondaryColor;
  const accentColor = br?.accentColor;
  const bgColor = br?.backgroundColor;
  const txtColor = br?.textColor;
  const logoUrl = br?.logoUrl;
  const headingFont = br?.headingFont;
  const bodyFont = br?.bodyFont;
  const btnRadius = br?.buttonStyle?.borderRadius || br?.borderRadius;
  const btnBg = br?.buttonStyle?.primaryBg || accent;
  const btnText = br?.buttonStyle?.primaryText || '#ffffff';
  const hasBranding = !!br;

  const cardBg = hasBranding
    ? (bgColor && bgColor !== '#ffffff' ? lightenColor(bgColor, 0.05) : '#ffffff')
    : undefined;
  const cardBorder = secondaryColor ? `${secondaryColor}30` : undefined;
  const inputBorder = accentColor ? `${accentColor}40` : undefined;
  const inputBg = hasBranding ? (bgColor === '#ffffff' ? '#ffffff' : bgColor ? lightenColor(bgColor, 0.08) : undefined) : undefined;

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
    ...(inputBg ? { backgroundColor: inputBg, color: txtColor || '#111827' } : {}),
  } as React.CSSProperties;

  if (submitted) {
    return (
      <div className="flex items-center justify-center py-20 px-4" style={wrapperStyle}>
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-800 p-10 max-w-md w-full text-center" style={cardStyle}>
          {logoUrl && <img src={logoUrl} alt="Logo" className="h-8 object-contain mx-auto mb-4" />}
          <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: `${accent}15` }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white" style={headingStyle}>{thankYou.title}</h2>
          {thankYou.message && <p className="text-gray-600 dark:text-gray-400 mt-2">{thankYou.message}</p>}
        </div>
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
            {survey.description && (
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

                      {renderField(field, answers, setAnswer, accent, inputStyle)}
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
                  className="flex items-center gap-1 px-6 py-2.5 rounded-lg font-medium text-sm transition-opacity"
                  style={{ backgroundColor: btnBg, color: btnText, ...(btnRadius ? { borderRadius: btnRadius } : {}) }}
                >
                  Next
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-6 py-2.5 rounded-lg font-medium text-sm transition-opacity disabled:opacity-50"
                  style={{ backgroundColor: btnBg, color: btnText, ...(btnRadius ? { borderRadius: btnRadius } : {}) }}
                >
                  {submitting ? 'Submitting...' : 'Submit'}
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

function renderField(
  field: SurveyField,
  answers: Record<string, unknown>,
  setAnswer: (id: string, val: unknown) => void,
  color: string,
  fieldInputStyle?: React.CSSProperties,
) {
  const inputCls = "w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:border-transparent";
  const ringStyle = { '--tw-ring-color': color, ...(fieldInputStyle || {}) } as React.CSSProperties;

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
              <span className="text-sm text-gray-700 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-white">{opt}</span>
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
                <span className="text-sm text-gray-700 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-white">{opt}</span>
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
          <span className="text-sm text-gray-700 dark:text-gray-300">{answers[field.id] ? 'Yes' : 'No'}</span>
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

    default:
      return null;
  }
}
