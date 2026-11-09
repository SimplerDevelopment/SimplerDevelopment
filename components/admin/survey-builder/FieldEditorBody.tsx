'use client';

// Extracted verbatim from components/admin/SurveyBuilder.tsx (PUX-179) — the builder is pinned at 554 code lines.

import ConditionalLogicPanel from '@/components/admin/ConditionalLogicPanel';
import SurveyMediaUrlEditor from '../SurveyMediaUrlEditor';
import SurveyMediaCarouselEditor from '../SurveyMediaCarouselEditor';
import type { FieldType, SurveyField } from '../SurveyBuilder.types';
import {
  FIELD_TYPES,
  hasOptions,
  hasPlaceholder,
  hasRequired,
  hasBranching,
  hasScoring,
  hasMediaUrl,
} from '../SurveyBuilder.constants';
import { ScoringEditor } from './ScoringEditor';

export type { FieldType, SurveyField };

interface Props {
  field: SurveyField;
  fields: SurveyField[];
  inputCls: string;
  onChange: (patch: Partial<SurveyField>) => void;
  onDone: () => void;
}

export function FieldEditorBody({ field, fields, inputCls, onChange, onDone }: Props) {
  return (
    <div className="border-t border-border px-4 pb-4 pt-3 bg-muted/20 grid sm:grid-cols-2 gap-3">
      {/* Field ID display */}
      <div className="sm:col-span-2 flex items-center gap-2">
        <span className="text-xs text-muted-foreground font-mono">ID: {field.id}</span>
      </div>

      {/* Type selector */}
      <div className="sm:col-span-2">
        <label className="block text-xs font-medium text-foreground mb-1">Field Type</label>
        <select
          value={field.type}
          onChange={e => {
            const t = e.target.value as FieldType;
            onChange({
              type: t,
              options: hasOptions(t) ? (field.options.length ? field.options : ['Option 1', 'Option 2']) : [],
              ...(t === 'slider' ? { min: field.min ?? 500, max: field.max ?? 50000, step: field.step ?? 500 } : {}),
            });
          }}
          className={inputCls}
        >
          {FIELD_TYPES.map(ft => (
            <option key={ft.type} value={ft.type}>{ft.label}</option>
          ))}
        </select>
      </div>

      {/* Label */}
      <div className={(field.type === 'heading' || field.type === 'image' || field.type === 'video' || field.type === 'media-carousel') ? 'sm:col-span-2' : ''}>
        <label className="block text-xs font-medium text-foreground mb-1">
          Label <span className="text-destructive">*</span>
        </label>
        <input
          type="text"
          value={field.label}
          onChange={e => onChange({ label: e.target.value })}
          className={inputCls}
          placeholder="e.g. What is your domain name?"
        />
        {field.label.includes('{') && field.label.includes('}') && (
          <p className="text-xs text-muted-foreground mt-1">Uses piping token — preview shows live substitution</p>
        )}
      </div>

      {hasMediaUrl(field.type) && <SurveyMediaUrlEditor value={field.mediaUrl} onChange={mediaUrl => onChange({ mediaUrl })} inputCls={inputCls} />}

      {field.type === 'media-carousel' && <SurveyMediaCarouselEditor items={field.mediaItems || []} onChange={mediaItems => onChange({ mediaItems })} inputCls={inputCls} />}

      {/* Placeholder (if applicable) */}
      {hasPlaceholder(field.type) && field.type !== 'heading' && (
        <div>
          <label className="block text-xs font-medium text-foreground mb-1">Placeholder</label>
          <input
            type="text"
            value={field.placeholder}
            onChange={e => onChange({ placeholder: e.target.value })}
            className={inputCls}
            placeholder="e.g. example.com"
          />
        </div>
      )}

      {/* Help text */}
      {field.type !== 'heading' && (
        <div className={!hasPlaceholder(field.type) ? 'sm:col-span-2' : ''}>
          <label className="block text-xs font-medium text-foreground mb-1">Help Text</label>
          <input
            type="text"
            value={field.helpText}
            onChange={e => onChange({ helpText: e.target.value })}
            className={inputCls}
            placeholder="Optional hint shown below the field"
          />
        </div>
      )}

      {/* Slider min / max / step */}
      {field.type === 'slider' && (
        <>
          <div>
            <label className="block text-xs font-medium text-foreground mb-1">Min</label>
            <input type="number" value={field.min ?? 0}
              onChange={e => onChange({ min: Number(e.target.value) })}
              className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground mb-1">Max</label>
            <input type="number" value={field.max ?? 10000}
              onChange={e => onChange({ max: Number(e.target.value) })}
              className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground mb-1">Step</label>
            <input type="number" value={field.step ?? 500}
              onChange={e => onChange({ step: Number(e.target.value) })}
              className={inputCls} />
          </div>
        </>
      )}

      {/* Options (select / radio / checkbox) */}
      {hasOptions(field.type) && (
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-foreground mb-1">
            Options <span className="text-muted-foreground">(one per line)</span>
          </label>
          <textarea
            rows={4}
            value={field.options.join('\n')}
            onChange={e => onChange({ options: e.target.value.split('\n') })}
            className={`${inputCls} resize-none`}
            placeholder={'Option 1\nOption 2\nOption 3'}
          />
        </div>
      )}

      {/* Required toggle */}
      {hasRequired(field.type) && (
        <div className="sm:col-span-2 flex items-center gap-3">
          <button
            type="button"
            role="switch"
            aria-checked={field.required}
            onClick={() => onChange({ required: !field.required })}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
              field.required ? 'bg-primary' : 'bg-muted-foreground/30'
            }`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
              field.required ? 'translate-x-4' : 'translate-x-0.5'
            }`} />
          </button>
          <span className="text-xs text-foreground">Required field</span>
        </div>
      )}

      {/* Conditional Logic */}
      <ConditionalLogicPanel
        field={field}
        allFields={fields.filter(f =>
          f.type !== 'page_break' &&
          f.type !== 'heading' &&
          f.type !== 'image' &&
          f.type !== 'video' && f.type !== 'media-carousel' &&
          f.id !== field.id &&
          fields.indexOf(f) < fields.indexOf(field)
        )}
        onChange={(patch) => onChange(patch)}
      />

      {/* SCORE-01: per-field scoring (rating/slider/select/radio/checkbox/toggle/number) */}
      {hasScoring(field.type) && (
        <ScoringEditor field={field} onChange={onChange} inputCls={inputCls} />
      )}

      {/* Logic branching (select/radio only) */}
      {hasBranching(field.type) && field.options.length > 0 && (() => {
        const pageBreaks = fields.filter(f => f.type === 'page_break');
        if (pageBreaks.length === 0) return null;
        const pageCount = pageBreaks.length + 1;
        return (
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-foreground mb-1">
              Skip Logic <span className="text-muted-foreground">(jump to page based on answer)</span>
            </label>
            <div className="space-y-1.5">
              {field.options.filter(o => o.trim()).map(opt => (
                <div key={opt} className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground min-w-0 truncate flex-1">{opt}</span>
                  <span className="text-muted-foreground shrink-0">→</span>
                  <select
                    value={field.goToPage?.[opt] ?? ''}
                    onChange={e => {
                      const val = e.target.value;
                      const next = { ...(field.goToPage || {}) };
                      if (val === '') delete next[opt]; else next[opt] = Number(val);
                      onChange({ goToPage: Object.keys(next).length ? next : undefined });
                    }}
                    className="px-2 py-1 rounded border border-border bg-background text-xs w-28"
                  >
                    <option value="">Next page</option>
                    {Array.from({ length: pageCount }, (_, i) => (
                      <option key={i} value={i}>Page {i + 1}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Done */}
      <div className="sm:col-span-2 flex justify-end">
        <button
          type="button"
          onClick={onDone}
          className="px-3 py-1.5 text-xs text-primary font-medium hover:underline"
        >
          Done editing
        </button>
      </div>
    </div>
  );
}

export default FieldEditorBody;
