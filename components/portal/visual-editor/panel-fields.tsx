'use client';

/**
 * Small, single-purpose form-control wrappers used across the visual-editor
 * settings panels. Extracted out of `VisualEditorShell.tsx` so block-specific
 * editors (e.g. HtmlRenderEditor) can reuse them without depending on the
 * 5,000-line shell file.
 *
 * Style is uniform on purpose: muted-foreground label, full-width input with
 * primary focus ring. Block editors that need bespoke chrome should compose
 * raw inputs directly rather than skinning these.
 */

import { TokenColorPicker } from '@/components/blocks/visual/TokenColorPicker';
import { RichTextEditable } from '@/components/blocks/visual/RichTextEditable';

export function Field({ label, value, onChange }: {
  label: string;
  value: string | undefined;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <input
        type="text"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 block w-full rounded border border-border px-2.5 py-1.5 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
      />
    </label>
  );
}

export function ColorField({ label, value, onChange }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return <TokenColorPicker label={label} value={value || ''} onChange={onChange} />;
}

export function TextareaField({ label, value, onChange, rows = 3 }: {
  label: string;
  value: string | undefined;
  onChange: (v: string) => void;
  rows?: number;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <textarea
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        className="mt-1 block w-full rounded border border-border px-2.5 py-1.5 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
      />
    </label>
  );
}

export function RichTextField({ label, value, onChange, singleLine = false, tall = false }: {
  label: string;
  value: string | undefined;
  onChange: (v: string) => void;
  singleLine?: boolean;
  /** Taller editing surface for long-form multi-line copy (e.g. CTA/hero
   * descriptions) — matches the min-h-[60px] convention used by the
   * non-singleLine RichTextEditable instances in SectionsPanel.tsx, instead
   * of the cramped default sized for short single-line fields. */
  tall?: boolean;
}) {
  return (
    <div className="block">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div className={`mt-1 rounded border border-border px-2.5 py-1.5 text-sm focus-within:border-primary focus-within:ring-1 focus-within:ring-primary ${tall ? 'min-h-[60px]' : 'min-h-[2rem]'}`}>
        <RichTextEditable
          html={value || ''}
          onChange={onChange}
          placeholder={label}
          singleLine={singleLine}
          className={`outline-none ${tall ? 'min-h-[3.6em]' : 'min-h-[1.2em]'}`}
        />
      </div>
    </div>
  );
}

export function SelectField({ label, value, options, onChange }: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 block w-full rounded border border-border px-2.5 py-1.5 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
      >
        {options.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
      </select>
    </label>
  );
}

export function CheckboxField({ label, checked, onChange }: {
  label: string;
  checked: boolean | undefined;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2">
      <input
        type="checkbox"
        checked={!!checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-border text-primary"
      />
      <span className="text-xs text-foreground">{label}</span>
    </label>
  );
}

/**
 * Small inline notice for a Content-tab control whose visual effect is
 * currently being overridden by an explicit Style-tab value (VEQA-038).
 * Purely presentational — callers decide the condition under which it
 * renders; this component just standardizes the look.
 */
export function OverrideBadge({ text = 'Overridden by Style tab' }: { text?: string }) {
  return (
    <span
      className="mt-1 inline-flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-500"
      title={text}
      data-testid="override-badge"
    >
      <span className="material-icons text-sm" aria-hidden="true">layers</span>
      {text}
    </span>
  );
}

export function NumberField({ label, value, onChange, min, max, step = 1 }: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        min={min}
        max={max}
        step={step}
        className="mt-1 block w-full rounded border border-border px-2.5 py-1.5 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
      />
    </label>
  );
}
