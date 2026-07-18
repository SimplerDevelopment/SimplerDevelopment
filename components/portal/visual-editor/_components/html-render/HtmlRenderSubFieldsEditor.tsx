'use client';

// ─── HtmlRenderSubFieldsEditor — inline editor for an array/group's children ──
// Sub-fields are scalar-only today (the per-item value is coerced to a string
// in HtmlRenderArrayEditor.setItemField), so the type list excludes nested
// arrays/groups, link, post, tab. Select/radio aren't here yet because they'd
// need a per-sub-field options[] UI — Phase 4+ work; not blocking.
//
// `image` is in this list — the MediaPicker writes a URL string back through
// the same string-coerce gate, so per-item images work without JSON-in-text
// hacks. Same for `url` and `color` (string-typed under the hood).

import React from 'react';
import type { HtmlRenderField } from '@/types/blocks';

const SUBFIELD_TYPES: HtmlRenderField['type'][] = [
  'text', 'textarea', 'number', 'richtext', 'boolean',
  'url', 'image', 'color', 'date', 'datetime',
];

export function HtmlRenderSubFieldsEditor({
  parentField,
  onChange,
}: {
  parentField: HtmlRenderField;
  onChange: (next: HtmlRenderField[]) => void;
}) {
  const items = parentField.itemFields || [];

  const addSubField = () => {
    const taken = new Set(items.map(s => s.name));
    let n = 'newField';
    let k = 2;
    while (taken.has(n)) { n = `newField_${k++}`; }
    onChange([...items, { name: n, type: 'text' }]);
  };

  const updateSubField = (idx: number, patch: Partial<HtmlRenderField>) => {
    onChange(items.map((sf, i) => (i === idx ? { ...sf, ...patch } : sf)));
  };

  const removeSubField = (idx: number) => {
    onChange(items.filter((_, i) => i !== idx));
  };

  return (
    <div className="rounded border border-border/60 bg-muted/10 p-2 space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium text-muted-foreground">
          Sub-fields ({items.length})
        </span>
        <button
          type="button"
          onClick={addSubField}
          className="text-[11px] text-primary hover:underline"
        >
          + Add sub-field
        </button>
      </div>
      {items.length === 0 ? (
        <p className="text-[11px] text-muted-foreground/80 italic leading-snug">
          No sub-fields yet. Add some, or annotate the{' '}
          <code className="font-mono">{parentField.type === 'array' ? 'data-repeat' : 'data-group'}</code>{' '}
          wrapper&apos;s contents in the HTML — they&apos;ll be auto-detected on save.
        </p>
      ) : (
        items.map((sf, si) => (
          <div key={si} className="flex items-center gap-1">
            <input
              type="text"
              value={sf.name}
              onChange={(e) => updateSubField(si, { name: e.target.value })}
              className="flex-1 min-w-0 rounded border border-border px-1.5 py-1 text-[11px] font-mono focus:border-primary focus:ring-1 focus:ring-primary"
              placeholder="name"
              spellCheck={false}
            />
            <select
              value={sf.type}
              onChange={(e) => updateSubField(si, { type: e.target.value as HtmlRenderField['type'] })}
              className="rounded border border-border px-1 py-1 text-[11px] focus:border-primary focus:ring-1 focus:ring-primary"
            >
              {SUBFIELD_TYPES.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => removeSubField(si)}
              className="p-0.5 rounded text-destructive hover:bg-destructive/10"
              title="Remove sub-field"
            >
              <span className="material-icons text-sm">delete_outline</span>
            </button>
          </div>
        ))
      )}
    </div>
  );
}
