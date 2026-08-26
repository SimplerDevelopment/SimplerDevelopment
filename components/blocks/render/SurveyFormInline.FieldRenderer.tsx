// ─── Field Renderer ─────────────────────────────────────────────────────────
// Extracted verbatim from SurveyFormInline.tsx — no behavior change.

import { resolvePiping } from '@/lib/survey-logic';
import type { SurveyField, FileFieldRenderOptions } from './SurveyFormInline.types';
import { SURVEY_FILE_ACCEPT_ATTR, normalizeOption, dimTextClass } from './SurveyFormInline.helpers';
import { SurveyMediaCarousel } from './SurveyMediaCarousel';

/**
 * Display-only field types (heading/image/video/media-carousel) — no
 * `answers`/`setAnswer`, rendered by the caller instead of `renderField`
 * whenever `DISPLAY_ONLY_TYPES.has(field.type)`. Extracted out of
 * SurveyFormInline.tsx (PUX-028, media-carousel) to keep that file under its
 * pinned file-size budget. `headingStyle` is the caller's already-merged
 * `{ ...headingStyle, ...(txtColor ? { color: txtColor } : {}) }` — kept as
 * one precomputed object so this helper doesn't need to know about branding
 * internals.
 */
export function renderDisplayOnlyField(
  field: SurveyField,
  answers: Record<string, unknown>,
  cardBg: string | undefined,
  headingStyle: React.CSSProperties | undefined,
) {
  if (field.type === 'heading') {
    return (
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white pt-2" style={headingStyle}>
        {resolvePiping(field.label, answers)}
      </h3>
    );
  }
  if (field.type === 'image') {
    return (
      <figure className="my-1">
        <img src={field.mediaUrl} alt={field.label || ''} className="w-full rounded-lg border border-gray-200 dark:border-gray-700" />
        {field.label && <figcaption className={`text-xs ${dimTextClass(cardBg)} mt-1`}>{resolvePiping(field.label, answers)}</figcaption>}
      </figure>
    );
  }
  if (field.type === 'video') {
    return (
      <figure className="my-1">
        <video src={field.mediaUrl} controls className="w-full rounded-lg border border-gray-200 dark:border-gray-700" />
        {field.label && <figcaption className={`text-xs ${dimTextClass(cardBg)} mt-1`}>{resolvePiping(field.label, answers)}</figcaption>}
      </figure>
    );
  }
  if (field.type === 'media-carousel') {
    return (
      <SurveyMediaCarousel
        items={field.mediaItems || []}
        label={field.label ? resolvePiping(field.label, answers) : undefined}
        cardBg={cardBg}
      />
    );
  }
  return null;
}

export function renderField(
  field: SurveyField,
  answers: Record<string, unknown>,
  setAnswer: (id: string, val: unknown) => void,
  color: string,
  fieldInputStyle?: React.CSSProperties,
  optionTextColor?: string,
  fileOpts?: FileFieldRenderOptions,
  // Stable DOM id for the single-control field types (text/email/phone/url/
  // textarea/number/date/select) — the caller only passes this for types in
  // LABELABLE_FIELD_TYPES, so it's `undefined` (and simply omitted) for
  // group-style controls that don't have one accessible-name-bearing input.
  inputId?: string,
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
          id={inputId}
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
          id={inputId}
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
          id={inputId}
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
          id={inputId}
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
          id={inputId}
          required={field.required}
          value={(answers[field.id] as string) || ''}
          onChange={(e) => setAnswer(field.id, e.target.value)}
          className={inputCls}
          style={ringStyle}
        >
          <option value="">Select...</option>
          {field.options.map((rawOpt, i) => {
            const { value, label } = normalizeOption(rawOpt);
            return <option key={value || `opt-${i}`} value={value}>{label}</option>;
          })}
        </select>
      );

    case 'radio':
      return (
        <div className="space-y-2">
          {field.options.map((rawOpt, i) => {
            const { value, label } = normalizeOption(rawOpt);
            return (
              <label key={value || `opt-${i}`} className="flex items-center gap-2.5 cursor-pointer group">
                <input
                  type="radio"
                  name={field.id}
                  value={value}
                  checked={answers[field.id] === value}
                  onChange={() => setAnswer(field.id, value)}
                  className="w-4 h-4"
                  style={{ accentColor: color }}
                />
                <span className={optionLabelCls} style={optionLabelStyle}>{label}</span>
              </label>
            );
          })}
        </div>
      );

    case 'checkbox':
      // Empty `options` is a single-boolean consent checkbox — the field label
      // is the prompt ("I agree to..."), no per-option label needed. We store
      // the answer as a plain boolean so scoring / required-validation /
      // `respondentEmail` extraction can read it the same way as `toggle`.
      // Multi-option `options` is the original behavior (one checkbox per
      // choice, answer stored as `string[]`).
      if (!field.options || field.options.length === 0) {
        const boolChecked = answers[field.id] === true;
        return (
          <label className="flex items-center gap-2.5 cursor-pointer group">
            <input
              type="checkbox"
              checked={boolChecked}
              // Unchecking clears the answer (sets to undefined) rather than
              // storing `false`. Server-side required-validation treats
              // undefined/null/'' as empty but not `false`, so this keeps the
              // gate honest for required consent checkboxes.
              onChange={(e) => setAnswer(field.id, e.target.checked ? true : undefined)}
              className="w-4 h-4 rounded"
              style={{ accentColor: color }}
            />
            <span className={optionLabelCls} style={optionLabelStyle}>I agree</span>
          </label>
        );
      }
      return (
        <div className="space-y-2">
          {field.options.map((rawOpt, i) => {
            const { value, label } = normalizeOption(rawOpt);
            const checked = Array.isArray(answers[field.id]) && (answers[field.id] as string[]).includes(value);
            return (
              <label key={value || `opt-${i}`} className="flex items-center gap-2.5 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => {
                    const current = (answers[field.id] as string[]) || [];
                    setAnswer(field.id, e.target.checked ? [...current, value] : current.filter(v => v !== value));
                  }}
                  className="w-4 h-4 rounded"
                  style={{ accentColor: color }}
                />
                <span className={optionLabelCls} style={optionLabelStyle}>{label}</span>
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
          {/* gray-600, not the default gray-500 — gray-500 on white measures
              well under 4.5:1 for 12px (text-xs) helper text (a11y fix,
              2026-08-18; see SurveyFormInline.tsx for the full contrast note). */}
          <div className="flex justify-between text-xs text-gray-600 dark:text-gray-400">
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
          {/* gray-600, not the default gray-500 — gray-500 on white measures
              well under 4.5:1 for 12px (text-xs) helper text (a11y fix,
              2026-08-18; see SurveyFormInline.tsx for the full contrast note). */}
          <div className="flex justify-between text-xs text-gray-600 dark:text-gray-400">
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
