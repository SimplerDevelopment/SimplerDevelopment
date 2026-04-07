'use client';

import { resolvePiping } from '@/lib/survey-logic';
import type { PitchDeckTheme } from '@/lib/db/schema';

export interface SurveySlideField {
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
  showIf?: { fieldId: string; values: string[] } | { combinator: 'AND'; rules: { fieldId: string; operator: 'equals' | 'not_equals'; values: string[] }[] };
  goToPage?: Record<string, number>;
  order: number;
  page?: number;
}

interface Props {
  field: SurveySlideField;
  questionNumber: number;
  totalQuestions: number;
  answers: Record<string, unknown>;
  onAnswer: (fieldId: string, value: unknown) => void;
  theme: PitchDeckTheme;
  error?: string;
  surveyTitle?: string;
  onNext?: () => void;
  onBack?: () => void;
  showBack?: boolean;
  isLastQuestion?: boolean;
  isSubmitting?: boolean;
}

/**
 * Renders a single survey question as a full-screen pitch deck slide.
 * Styled using the deck theme (colors, fonts).
 */
export function SurveySlideRenderer({
  field,
  questionNumber,
  totalQuestions,
  answers,
  onAnswer,
  theme,
  error,
  surveyTitle,
  onNext,
  onBack,
  showBack,
  isLastQuestion,
  isSubmitting,
}: Props) {
  const label = resolvePiping(field.label, answers);
  const helpText = field.helpText ? resolvePiping(field.helpText, answers) : '';

  // Heading slides get a simple centered display with nav buttons
  if (field.type === 'heading') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen px-8 text-center">
        <div className="w-full max-w-xl space-y-8">
          <h2
            className="text-4xl md:text-5xl font-bold mb-4"
            style={{ fontFamily: theme.headingFont, color: theme.textColor }}
          >
            {label}
          </h2>
          {helpText && (
            <p className="text-lg opacity-60 max-w-xl mx-auto" style={{ fontFamily: theme.bodyFont, color: theme.textColor }}>
              {helpText}
            </p>
          )}
          {/* Navigation buttons */}
          <div className="flex items-center justify-between pt-6">
            {showBack && onBack ? (
              <button
                type="button"
                onClick={onBack}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium transition-all hover:opacity-80"
                style={{ color: theme.textColor, backgroundColor: `${theme.textColor}15` }}
              >
                <span className="material-icons text-lg">arrow_back</span>
                Back
              </button>
            ) : <div />}
            {onNext && (
              <button
                type="button"
                onClick={onNext}
                className="flex items-center gap-1.5 px-6 py-2.5 rounded-lg text-sm font-medium transition-all hover:opacity-90"
                style={{ backgroundColor: theme.accentColor, color: theme.backgroundColor }}
              >
                Next
                <span className="material-icons text-lg">arrow_forward</span>
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-8">
      <div className="w-full max-w-xl space-y-8">
        {/* Survey title badge */}
        {surveyTitle && (
          <div className="flex items-center gap-2 opacity-40">
            <span className="material-icons text-sm" style={{ color: theme.accentColor }}>assignment</span>
            <span className="text-xs tracking-wide" style={{ fontFamily: theme.bodyFont, color: theme.textColor }}>
              {surveyTitle}
            </span>
          </div>
        )}

        {/* Question number */}
        <div className="flex items-center gap-3">
          <span
            className="text-sm font-medium opacity-50"
            style={{ fontFamily: theme.bodyFont, color: theme.accentColor }}
          >
            {questionNumber} of {totalQuestions}
          </span>
        </div>

        {/* Question label */}
        <h2
          className="text-2xl md:text-3xl font-semibold leading-tight"
          style={{ fontFamily: theme.headingFont, color: theme.textColor }}
        >
          {label}
          {field.required && <span style={{ color: theme.accentColor }}> *</span>}
        </h2>

        {/* Help text */}
        {helpText && (
          <p className="text-base opacity-50" style={{ fontFamily: theme.bodyFont, color: theme.textColor }}>
            {helpText}
          </p>
        )}

        {/* Field input */}
        <div className="pt-2">
          {renderSlideField(field, answers, onAnswer, theme)}
        </div>

        {/* Error */}
        {error && (
          <div
            className="flex items-center gap-2 text-sm px-4 py-2 rounded-lg"
            style={{ backgroundColor: '#ef444420', color: '#ef4444' }}
          >
            <span className="material-icons text-base">error</span>
            {error}
          </div>
        )}

        {/* Navigation buttons */}
        <div className="flex items-center justify-between pt-6">
          {showBack && onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium transition-all hover:opacity-80"
              style={{ color: theme.textColor, backgroundColor: `${theme.textColor}15` }}
            >
              <span className="material-icons text-lg">arrow_back</span>
              Back
            </button>
          ) : <div />}
          {onNext && (
            <button
              type="button"
              onClick={onNext}
              disabled={isSubmitting}
              className="flex items-center gap-1.5 px-6 py-2.5 rounded-lg text-sm font-medium transition-all hover:opacity-90 disabled:opacity-50"
              style={{ backgroundColor: theme.accentColor, color: theme.backgroundColor }}
            >
              {isSubmitting ? (
                <>
                  <span className="material-icons text-lg animate-spin">autorenew</span>
                  Submitting...
                </>
              ) : isLastQuestion ? (
                <>
                  Submit
                  <span className="material-icons text-lg">check</span>
                </>
              ) : (
                <>
                  Next
                  <span className="material-icons text-lg">arrow_forward</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Slide-specific field renderer (styled for dark slide backgrounds) ────────

function renderSlideField(
  field: SurveySlideField,
  answers: Record<string, unknown>,
  onAnswer: (id: string, val: unknown) => void,
  theme: PitchDeckTheme,
) {
  const inputStyle: React.CSSProperties = {
    fontFamily: theme.bodyFont,
    color: theme.textColor,
    backgroundColor: `${theme.textColor}10`,
    borderColor: `${theme.textColor}30`,
  };
  const inputCls = 'w-full px-4 py-3 border rounded-lg text-base focus:outline-none focus:ring-2 focus:border-transparent placeholder:opacity-40';
  const ringStyle = { ...inputStyle, '--tw-ring-color': theme.accentColor } as React.CSSProperties;

  switch (field.type) {
    case 'text':
    case 'email':
    case 'phone':
    case 'url':
      return (
        <input
          type={field.type === 'phone' ? 'tel' : field.type}
          placeholder={field.placeholder}
          value={(answers[field.id] as string) || ''}
          onChange={(e) => onAnswer(field.id, e.target.value)}
          className={inputCls}
          style={ringStyle}
          autoFocus
        />
      );

    case 'textarea':
      return (
        <textarea
          placeholder={field.placeholder}
          rows={4}
          value={(answers[field.id] as string) || ''}
          onChange={(e) => onAnswer(field.id, e.target.value)}
          className={`${inputCls} resize-none`}
          style={ringStyle}
          autoFocus
        />
      );

    case 'number':
      return (
        <input
          type="number"
          placeholder={field.placeholder}
          min={field.min}
          max={field.max}
          value={(answers[field.id] as string) || ''}
          onChange={(e) => onAnswer(field.id, e.target.value)}
          className={inputCls}
          style={ringStyle}
          autoFocus
        />
      );

    case 'date':
      return (
        <input
          type="date"
          value={(answers[field.id] as string) || ''}
          onChange={(e) => onAnswer(field.id, e.target.value)}
          className={inputCls}
          style={ringStyle}
        />
      );

    case 'select':
      return (
        <select
          value={(answers[field.id] as string) || ''}
          onChange={(e) => onAnswer(field.id, e.target.value)}
          className={inputCls}
          style={ringStyle}
        >
          <option value="">Select...</option>
          {field.options.map(opt => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      );

    case 'radio':
      return (
        <div className="space-y-3">
          {field.options.map(opt => {
            const selected = answers[field.id] === opt;
            return (
              <button
                key={opt}
                type="button"
                onClick={() => onAnswer(field.id, opt)}
                className="w-full text-left px-5 py-3.5 rounded-lg border-2 transition-all flex items-center gap-3"
                style={{
                  fontFamily: theme.bodyFont,
                  color: theme.textColor,
                  borderColor: selected ? theme.accentColor : `${theme.textColor}20`,
                  backgroundColor: selected ? `${theme.accentColor}15` : 'transparent',
                }}
              >
                <div
                  className="w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center"
                  style={{ borderColor: selected ? theme.accentColor : `${theme.textColor}40` }}
                >
                  {selected && (
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: theme.accentColor }} />
                  )}
                </div>
                <span className="text-base">{opt}</span>
              </button>
            );
          })}
        </div>
      );

    case 'checkbox':
      return (
        <div className="space-y-3">
          {field.options.map(opt => {
            const checked = Array.isArray(answers[field.id]) && (answers[field.id] as string[]).includes(opt);
            return (
              <button
                key={opt}
                type="button"
                onClick={() => {
                  const current = (answers[field.id] as string[]) || [];
                  onAnswer(field.id, checked ? current.filter(v => v !== opt) : [...current, opt]);
                }}
                className="w-full text-left px-5 py-3.5 rounded-lg border-2 transition-all flex items-center gap-3"
                style={{
                  fontFamily: theme.bodyFont,
                  color: theme.textColor,
                  borderColor: checked ? theme.accentColor : `${theme.textColor}20`,
                  backgroundColor: checked ? `${theme.accentColor}15` : 'transparent',
                }}
              >
                <div
                  className="w-5 h-5 rounded border-2 shrink-0 flex items-center justify-center"
                  style={{ borderColor: checked ? theme.accentColor : `${theme.textColor}40` }}
                >
                  {checked && (
                    <span className="material-icons text-sm" style={{ color: theme.accentColor }}>check</span>
                  )}
                </div>
                <span className="text-base">{opt}</span>
              </button>
            );
          })}
        </div>
      );

    case 'toggle':
      return (
        <button
          type="button"
          onClick={() => onAnswer(field.id, !answers[field.id])}
          className="flex items-center gap-3"
        >
          <div
            className="w-14 h-8 rounded-full transition-colors relative"
            style={{ backgroundColor: answers[field.id] ? theme.accentColor : `${theme.textColor}30` }}
          >
            <div
              className="absolute top-1 w-6 h-6 bg-white rounded-full shadow transition-transform"
              style={{ transform: answers[field.id] ? 'translateX(26px)' : 'translateX(4px)' }}
            />
          </div>
          <span className="text-lg" style={{ fontFamily: theme.bodyFont, color: theme.textColor }}>
            {answers[field.id] ? 'Yes' : 'No'}
          </span>
        </button>
      );

    case 'rating':
      return (
        <div className="flex gap-3">
          {[1, 2, 3, 4, 5].map(star => (
            <button
              key={star}
              type="button"
              onClick={() => onAnswer(field.id, star)}
              className="text-4xl transition-all hover:scale-110"
              style={{ color: (answers[field.id] as number) >= star ? theme.accentColor : `${theme.textColor}25` }}
            >
              &#9733;
            </button>
          ))}
        </div>
      );

    case 'slider':
      return (
        <div className="space-y-3">
          <input
            type="range"
            min={field.min ?? 0}
            max={field.max ?? 100}
            step={field.step ?? 1}
            value={(answers[field.id] as number) ?? (field.min ?? 0)}
            onChange={(e) => onAnswer(field.id, Number(e.target.value))}
            className="w-full h-2"
            style={{ accentColor: theme.accentColor }}
          />
          <div className="flex justify-between text-sm opacity-50" style={{ fontFamily: theme.bodyFont, color: theme.textColor }}>
            <span>{field.min ?? 0}</span>
            <span className="font-semibold opacity-100" style={{ color: theme.accentColor }}>
              {String(answers[field.id] ?? field.min ?? 0)}
            </span>
            <span>{field.max ?? 100}</span>
          </div>
        </div>
      );

    default:
      return null;
  }
}
