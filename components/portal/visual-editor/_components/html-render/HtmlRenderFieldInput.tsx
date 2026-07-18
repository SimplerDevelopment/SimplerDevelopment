'use client';

// ─── HtmlRenderFieldInput — type-aware single-field editor ───────────────────
// Renders the appropriate input for one field. Recursive: array & group
// fields render nested forms via this same component. Help text shows under
// the label when set.

import React from 'react';
import MediaPicker from '@/components/admin/MediaPicker';
import { validateField, isFieldVisible } from '@/lib/blocks/html-render-validation';
import type { HtmlRenderField, HtmlRenderConditional } from '@/types/blocks';
import { Field, SelectField, NumberField, CheckboxField, TextareaField, RichTextField, ColorField } from '../../panel-fields';
import { HtmlRenderArrayEditor } from './HtmlRenderArrayEditor';
import { HtmlRenderPostPicker } from './HtmlRenderPostPicker';
import { HtmlRenderUrlAutocomplete } from './HtmlRenderUrlAutocomplete';

type AnyHtmlRenderValue = string | Array<Record<string, string>> | Record<string, string>;

export function HtmlRenderFieldInput({
  field,
  value,
  onChange,
  mediaApi,
  siteId,
  siblingValues,
}: {
  field: HtmlRenderField;
  value: AnyHtmlRenderValue | undefined;
  onChange: (v: AnyHtmlRenderValue) => void;
  mediaApi: string;
  siteId?: number;
  /** Sibling values at this nesting level — used to evaluate conditional
   *  visibility (`field.conditional`) and to scope error messages. Falls
   *  back to an empty record when omitted (the field is always visible). */
  siblingValues?: Record<string, AnyHtmlRenderValue>;
}) {
  // Conditional visibility — when the rule fails, the field is suppressed.
  // Doesn't affect template rendering or stored values; purely UX.
  if (!isFieldVisible(field, (siblingValues || {}) as Record<string, string | Array<Record<string, string>> | Record<string, string> | undefined>)) return null;

  const baseLabel = field.label || field.name;
  // Required fields get a visible asterisk in the label so authors don't have
  // to read the validation error to know what's mandatory.
  const label = field.required ? `${baseLabel} *` : baseLabel;
  const error = validateField(field, value);
  const helpEl = field.help ? <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">{field.help}</p> : null;
  const errorEl = error ? <p className="text-[11px] text-destructive leading-snug mt-0.5">{error}</p> : null;
  const wrap = (input: React.ReactNode) => (
    <div className={error ? 'pc-field-error' : undefined}>
      {input}
      {helpEl}
      {errorEl}
    </div>
  );

  // ── Composite types ────────────────────────────────────────────────────
  if (field.type === 'tab') {
    // Tab fields are pure organizers — they carry no value. Render handled
    // by the parent (which groups successive tabs into a tabbed UI).
    return null;
  }

  if (field.type === 'array') {
    const items: Array<Record<string, string>> = Array.isArray(value) ? value : [];
    return (
      <div>
        <HtmlRenderArrayEditor
          label={label}
          itemFields={field.itemFields || []}
          items={items}
          onChange={(next) => onChange(next)}
          mediaApi={mediaApi}
          siteId={siteId}
        />
        {helpEl}
      </div>
    );
  }

  if (field.type === 'group' || field.type === 'link') {
    const obj: Record<string, string> = (value && !Array.isArray(value) && typeof value === 'object')
      ? (value as Record<string, string>) : {};
    // `link` is a group preset with hard-coded sub-fields. We materialize them
    // here so authors don't have to populate itemFields by hand, while keeping
    // the storage shape identical to a regular group.
    const subFields: HtmlRenderField[] = field.type === 'link'
      ? [
          { name: 'url', label: 'URL', type: 'url' },
          { name: 'label', label: 'Label', type: 'text' },
          { name: 'target', label: 'Open in', type: 'select', options: ['_self', '_blank'], default: '_self' },
        ]
      : (field.itemFields || []);
    return (
      <div className="space-y-1.5">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{label}</span>
        {helpEl}
        <div className="rounded border border-border p-2 space-y-2">
          {subFields.map((sf) => (
            <HtmlRenderFieldInput
              key={sf.name}
              field={sf}
              value={obj[sf.name]}
              onChange={(val) => onChange({ ...obj, [sf.name]: typeof val === 'string' ? val : '' })}
              mediaApi={mediaApi}
              siteId={siteId}
              siblingValues={obj as Record<string, AnyHtmlRenderValue>}
            />
          ))}
          {field.type === 'group' && subFields.length === 0 && (
            <p className="text-[11px] text-muted-foreground">No sub-fields detected. Add <code className="font-mono">data-field</code> elements or <code className="font-mono">{'{{' + field.name + '.X}}'}</code> placeholders inside the group&apos;s <code className="font-mono">data-group</code> wrapper.</p>
          )}
        </div>
        {field.type === 'link' && (
          <p className="text-[11px] text-muted-foreground">
            Use <code className="font-mono">{'{{' + field.name + '.url}}'}</code>, <code className="font-mono">{'{{' + field.name + '.label}}'}</code>, <code className="font-mono">{'{{' + field.name + '.target}}'}</code> in the template.
          </p>
        )}
      </div>
    );
  }

  // ── Scalar inputs ──────────────────────────────────────────────────────
  const v = typeof value === 'string' ? value : (field.default ?? '');

  if (field.type === 'boolean') {
    return wrap(<CheckboxField label={label} checked={v === 'true'} onChange={(b) => onChange(b ? 'true' : 'false')} />);
  }
  if (field.type === 'number') {
    return wrap(
      <NumberField
        label={label}
        value={v ? Number(v) : 0}
        min={field.min}
        max={field.max}
        step={field.step ?? 1}
        onChange={(n) => onChange(String(n))}
      />,
    );
  }
  if (field.type === 'textarea') {
    return wrap(<TextareaField label={label} value={v} onChange={(val) => onChange(val)} rows={4} />);
  }
  if (field.type === 'richtext') {
    return wrap(<RichTextField label={label} value={v} onChange={(val) => onChange(val)} />);
  }
  if (field.type === 'image') {
    // MediaPicker renders its own thumbnail when a value is set — no need to
    // duplicate it above. Just show the label + the picker.
    return wrap(
      <div>
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <MediaPicker value={v} onChange={(val) => onChange(val)} mimeTypeFilter="image" label="" apiEndpoint={mediaApi} />
      </div>,
    );
  }
  if (field.type === 'color') {
    return wrap(<ColorField label={label} value={v} onChange={(val) => onChange(val)} />);
  }
  if (field.type === 'select' && field.options?.length) {
    return wrap(<SelectField label={label} value={v} options={field.options} onChange={(val) => onChange(val)} />);
  }
  if (field.type === 'radio' && field.options?.length) {
    return wrap(
      <div>
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <div className="mt-1 space-y-1">
          {field.options.map(opt => (
            <label key={opt} className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="radio"
                name={`field-${field.name}`}
                value={opt}
                checked={v === opt}
                onChange={() => onChange(opt)}
                className="h-3.5 w-3.5 text-primary"
              />
              <span className="text-foreground">{opt}</span>
            </label>
          ))}
        </div>
      </div>,
    );
  }
  if (field.type === 'date' || field.type === 'datetime') {
    const inputType = field.type === 'date' ? 'date' : 'datetime-local';
    return wrap(
      <label className="block">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <input
          type={inputType}
          value={v}
          onChange={(e) => onChange(e.target.value)}
          className="mt-1 block w-full rounded border border-border px-2.5 py-1.5 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
        />
      </label>,
    );
  }
  if (field.type === 'post') {
    return wrap(<HtmlRenderPostPicker label={label} value={v} postType={field.postType} onChange={onChange} siteId={siteId} />);
  }
  if (field.type === 'url') {
    return wrap(<HtmlRenderUrlAutocomplete label={label} value={v} onChange={(val) => onChange(val)} siteId={siteId} />);
  }
  return wrap(<Field label={label} value={v} onChange={(val) => onChange(val)} />);
}
