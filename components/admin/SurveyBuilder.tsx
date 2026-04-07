'use client';

import { useState } from 'react';
import type { ShowIfRule, ShowIfCondition } from '@/lib/db/schema';

export type FieldType =
  | 'text' | 'textarea' | 'number' | 'email' | 'phone' | 'url'
  | 'select' | 'radio' | 'checkbox' | 'toggle' | 'date' | 'rating' | 'heading' | 'slider'
  | 'page_break';

export interface SurveyField {
  id: string;
  type: FieldType;
  label: string;
  placeholder: string;
  helpText: string;
  required: boolean;
  options: string[];
  min?: number;
  max?: number;
  step?: number;
  showIf?: { fieldId: string; values: string[] } | ShowIfCondition;
  conditionalOptions?: { fieldId: string; map: Record<string, string[]>; default?: string[] };
  goToPage?: Record<string, number>;
  order: number;
  page?: number;
}

interface Props {
  fields: SurveyField[];
  onChange: (fields: SurveyField[]) => void;
}

const FIELD_TYPES: { type: FieldType; label: string; icon: string }[] = [
  { type: 'text',     label: 'Short Text',       icon: 'short_text' },
  { type: 'textarea', label: 'Long Text',         icon: 'notes' },
  { type: 'number',   label: 'Number',            icon: 'tag' },
  { type: 'email',    label: 'Email',             icon: 'email' },
  { type: 'phone',    label: 'Phone',             icon: 'phone' },
  { type: 'url',      label: 'URL / Website',     icon: 'link' },
  { type: 'date',     label: 'Date',              icon: 'calendar_today' },
  { type: 'select',   label: 'Dropdown',          icon: 'arrow_drop_down_circle' },
  { type: 'radio',    label: 'Multiple Choice',   icon: 'radio_button_checked' },
  { type: 'checkbox', label: 'Checkboxes',        icon: 'check_box' },
  { type: 'toggle',   label: 'Yes / No Toggle',   icon: 'toggle_on' },
  { type: 'rating',   label: 'Star Rating (1–5)', icon: 'star' },
  { type: 'slider',   label: 'Range Slider',      icon: 'tune' },
  { type: 'heading',  label: 'Section Heading',   icon: 'title' },
  { type: 'page_break', label: 'Page Break',      icon: 'insert_page_break' },
];

const TYPE_MAP = Object.fromEntries(FIELD_TYPES.map(t => [t.type, t]));

const hasOptions    = (t: FieldType) => t === 'select' || t === 'radio' || t === 'checkbox';
const hasPlaceholder = (t: FieldType) =>
  ['text', 'textarea', 'number', 'email', 'phone', 'url', 'date'].includes(t);
const hasRequired   = (t: FieldType) => t !== 'heading' && t !== 'page_break';
const hasBranching  = (t: FieldType) => t === 'select' || t === 'radio';

function genId() {
  return Math.random().toString(36).slice(2, 10);
}

export default function SurveyBuilder({ fields, onChange }: Props) {
  const [showTypePicker, setShowTypePicker] = useState(false);
  const [expandedId, setExpandedId]         = useState<string | null>(null);

  function addField(type: FieldType) {
    const next: SurveyField = {
      id: genId(),
      type,
      label: TYPE_MAP[type].label,
      placeholder: '',
      helpText: '',
      required: false,
      options: hasOptions(type) ? ['Option 1', 'Option 2'] : [],
      ...(type === 'slider' ? { min: 500, max: 50000, step: 500 } : {}),
      order: fields.length,
    };
    const updated = [...fields, next];
    onChange(updated);
    setShowTypePicker(false);
    setExpandedId(next.id);
  }

  function updateField(id: string, patch: Partial<SurveyField>) {
    // IMPORTANT: Never include 'id' in patch — field IDs are immutable after creation
    // Changing IDs corrupts analytics for existing responses (FOUND-03)
    if ('id' in patch) {
      console.error('[SurveyBuilder] Attempted to change field ID — blocked');
      return;
    }
    onChange(fields.map(f => f.id === id ? { ...f, ...patch } : f));
  }

  function deleteField(id: string) {
    onChange(fields.filter(f => f.id !== id).map((f, i) => ({ ...f, order: i })));
    if (expandedId === id) setExpandedId(null);
  }

  function moveField(id: string, dir: -1 | 1) {
    const idx = fields.findIndex(f => f.id === id);
    if (idx + dir < 0 || idx + dir >= fields.length) return;
    const next = [...fields];
    [next[idx], next[idx + dir]] = [next[idx + dir], next[idx]];
    onChange(next.map((f, i) => ({ ...f, order: i })));
  }

  const inputCls = 'w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary';

  return (
    <div className="sm:col-span-2 space-y-3">
      {/* Section header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-foreground">Survey / Intake Form</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Add fields clients must fill out when requesting this service. Leave empty to show a simple request form instead.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowTypePicker(v => !v)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 text-primary rounded-lg text-xs font-medium hover:bg-primary/20 transition-colors"
        >
          <span className="material-icons text-sm">add</span>
          Add Field
        </button>
      </div>

      {/* Type picker */}
      {showTypePicker && (
        <div className="border border-border rounded-xl p-4 bg-muted/30">
          <p className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wide">Choose field type</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {FIELD_TYPES.map(ft => (
              <button
                key={ft.type}
                type="button"
                onClick={() => addField(ft.type)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-card hover:bg-accent hover:border-primary/50 text-sm text-foreground transition-colors text-left"
              >
                <span className="material-icons text-base text-primary">{ft.icon}</span>
                <span className="text-xs leading-tight">{ft.label}</span>
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setShowTypePicker(false)}
            className="mt-3 text-xs text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Field list */}
      {fields.length === 0 ? (
        <div className="border border-dashed border-border rounded-xl py-8 text-center text-sm text-muted-foreground">
          No fields yet — click &ldquo;Add Field&rdquo; to build your intake form.
        </div>
      ) : (
        <div className="space-y-2">
          {fields.map((field, idx) => {
            const meta = TYPE_MAP[field.type];
            const isOpen = expandedId === field.id;

            // Page break rendered as a visual divider
            if (field.type === 'page_break') {
              const pageNum = fields.slice(0, idx).filter(f => f.type === 'page_break').length + 2;
              return (
                <div key={field.id} className="flex items-center gap-3 py-2">
                  <div className="flex-1 border-t-2 border-dashed border-primary/30" />
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-primary/10 rounded-full">
                    <span className="material-icons text-sm text-primary">insert_page_break</span>
                    <span className="text-xs font-medium text-primary">Page {pageNum}</span>
                  </div>
                  <div className="flex-1 border-t-2 border-dashed border-primary/30" />
                  <div className="flex items-center gap-0.5">
                    <button type="button" onClick={() => moveField(field.id, -1)} disabled={idx === 0}
                      className="p-1 rounded text-muted-foreground hover:text-foreground disabled:opacity-30" title="Move up">
                      <span className="material-icons text-sm">arrow_upward</span>
                    </button>
                    <button type="button" onClick={() => moveField(field.id, 1)} disabled={idx === fields.length - 1}
                      className="p-1 rounded text-muted-foreground hover:text-foreground disabled:opacity-30" title="Move down">
                      <span className="material-icons text-sm">arrow_downward</span>
                    </button>
                    <button type="button" onClick={() => deleteField(field.id)}
                      className="p-1 rounded text-muted-foreground hover:text-destructive" title="Delete">
                      <span className="material-icons text-sm">delete_outline</span>
                    </button>
                  </div>
                </div>
              );
            }

            return (
              <div key={field.id} className="border border-border rounded-xl bg-card overflow-hidden">
                {/* Collapsed header */}
                <div className="flex items-center gap-3 px-4 py-3">
                  <span className="material-icons text-base text-primary flex-shrink-0">{meta.icon}</span>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-foreground truncate block">{field.label || meta.label}</span>
                    <span className="text-xs text-muted-foreground capitalize">{meta.label}</span>
                  </div>
                  {field.required && hasRequired(field.type) && (
                    <span className="text-xs text-destructive bg-destructive/10 px-1.5 py-0.5 rounded flex-shrink-0">Required</span>
                  )}
                  <div className="flex items-center gap-0.5 flex-shrink-0">
                    <button type="button" onClick={() => moveField(field.id, -1)} disabled={idx === 0}
                      className="p-1 rounded text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors" title="Move up">
                      <span className="material-icons text-sm">arrow_upward</span>
                    </button>
                    <button type="button" onClick={() => moveField(field.id, 1)} disabled={idx === fields.length - 1}
                      className="p-1 rounded text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors" title="Move down">
                      <span className="material-icons text-sm">arrow_downward</span>
                    </button>
                    <button type="button" onClick={() => setExpandedId(isOpen ? null : field.id)}
                      className="p-1 rounded text-muted-foreground hover:text-primary transition-colors" title="Edit">
                      <span className="material-icons text-sm">{isOpen ? 'expand_less' : 'edit'}</span>
                    </button>
                    <button type="button" onClick={() => deleteField(field.id)}
                      className="p-1 rounded text-muted-foreground hover:text-destructive transition-colors" title="Delete">
                      <span className="material-icons text-sm">delete_outline</span>
                    </button>
                  </div>
                </div>

                {/* Expanded editor */}
                {isOpen && (
                  <div className="border-t border-border px-4 pb-4 pt-3 bg-muted/20 grid sm:grid-cols-2 gap-3">
                    {/* Type selector */}
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-medium text-foreground mb-1">Field Type</label>
                      <select
                        value={field.type}
                        onChange={e => {
                          const t = e.target.value as FieldType;
                          updateField(field.id, {
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
                    <div className={field.type === 'heading' ? 'sm:col-span-2' : ''}>
                      <label className="block text-xs font-medium text-foreground mb-1">
                        Label <span className="text-destructive">*</span>
                      </label>
                      <input
                        type="text"
                        value={field.label}
                        onChange={e => updateField(field.id, { label: e.target.value })}
                        className={inputCls}
                        placeholder="e.g. What is your domain name?"
                      />
                    </div>

                    {/* Placeholder (if applicable) */}
                    {hasPlaceholder(field.type) && field.type !== 'heading' && (
                      <div>
                        <label className="block text-xs font-medium text-foreground mb-1">Placeholder</label>
                        <input
                          type="text"
                          value={field.placeholder}
                          onChange={e => updateField(field.id, { placeholder: e.target.value })}
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
                          onChange={e => updateField(field.id, { helpText: e.target.value })}
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
                            onChange={e => updateField(field.id, { min: Number(e.target.value) })}
                            className={inputCls} />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-foreground mb-1">Max</label>
                          <input type="number" value={field.max ?? 10000}
                            onChange={e => updateField(field.id, { max: Number(e.target.value) })}
                            className={inputCls} />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-foreground mb-1">Step</label>
                          <input type="number" value={field.step ?? 500}
                            onChange={e => updateField(field.id, { step: Number(e.target.value) })}
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
                          onChange={e => updateField(field.id, { options: e.target.value.split('\n') })}
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
                          onClick={() => updateField(field.id, { required: !field.required })}
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
                                    updateField(field.id, { goToPage: Object.keys(next).length ? next : undefined });
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
                        onClick={() => setExpandedId(null)}
                        className="px-3 py-1.5 text-xs text-primary font-medium hover:underline"
                      >
                        Done editing
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
