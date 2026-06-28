/**
 * Custom fields — render and edit project_custom_fields values for a card.
 * Inputs vary by kind. Save is debounced to one PUT per blur/change cluster.
 */
'use client';

import { useEffect, useRef, useState } from 'react';
import type { CustomFieldValue } from '../_lib/types';

type Kind = 'text' | 'number' | 'date' | 'select' | 'multi_select' | 'url' | 'checkbox';

interface CustomField {
  id: number;
  key: string;
  name: string;
  kind: Kind;
  required: boolean;
  options: string[];
  value: unknown;
}

export function CardCustomFields({ cardId, canEdit, initialFields }: { cardId: number; canEdit: boolean; initialFields?: CustomFieldValue[] | null }) {
  // The card bundle now ships custom fields with the rest of the card, so the
  // modal passes them in and this component skips its own request. The standalone
  // fetch path is kept for any caller that doesn't provide them.
  const [fields, setFields] = useState<CustomField[]>(initialFields ?? []);
  const [loading, setLoading] = useState(initialFields == null);
  const [saving, setSaving] = useState(false);
  const dirtyRef = useRef<Map<number, unknown>>(new Map());

  const load = async () => {
    try {
      const res = await fetch(`/api/portal/cards/${cardId}/custom-fields`);
      const json = await res.json();
      if (json.success) setFields(json.data);
    } finally { setLoading(false); }
  };

  useEffect(() => {
    if (initialFields != null) return;
    load();
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [cardId, initialFields]);

  const flush = async () => {
    if (dirtyRef.current.size === 0) return;
    setSaving(true);
    const values = [...dirtyRef.current.entries()].map(([fieldId, value]) => ({ fieldId, value }));
    dirtyRef.current.clear();
    try {
      await fetch(`/api/portal/cards/${cardId}/custom-fields`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ values }),
      });
    } finally {
      setSaving(false);
    }
  };

  const setLocal = (fieldId: number, value: unknown) => {
    setFields(prev => prev.map(f => f.id === fieldId ? { ...f, value } : f));
    dirtyRef.current.set(fieldId, value);
  };

  if (loading) return null;
  if (fields.length === 0) return null;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Custom fields</h3>
        {saving && <span className="text-[10px] text-muted-foreground">Saving…</span>}
      </div>
      <div className="space-y-2">
        {fields.map(f => (
          <div key={f.id} className="grid grid-cols-[140px_1fr] items-start gap-3 text-sm">
            <label className="text-xs font-medium text-muted-foreground pt-1">
              {f.name}
              {f.required && <span className="text-destructive ml-0.5">*</span>}
            </label>
            <div>
              <FieldInput field={f} canEdit={canEdit} onChange={(v) => setLocal(f.id, v)} onBlur={flush} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function FieldInput({ field, canEdit, onChange, onBlur }: {
  field: CustomField;
  canEdit: boolean;
  onChange: (v: unknown) => void;
  onBlur: () => void;
}) {
  const v = field.value;
  const cls = 'w-full px-2 py-1.5 rounded border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-60';
  const disabled = !canEdit;

  if (field.kind === 'text') {
    return (
      <input
        type="text"
        disabled={disabled}
        value={typeof v === 'string' ? v : ''}
        onChange={e => onChange(e.target.value)}
        onBlur={onBlur}
        className={cls}
      />
    );
  }
  if (field.kind === 'number') {
    return (
      <input
        type="number"
        disabled={disabled}
        value={typeof v === 'number' ? v : ''}
        onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))}
        onBlur={onBlur}
        className={cls}
      />
    );
  }
  if (field.kind === 'date') {
    return (
      <input
        type="date"
        disabled={disabled}
        value={typeof v === 'string' ? v : ''}
        onChange={e => onChange(e.target.value || null)}
        onBlur={onBlur}
        className={cls}
      />
    );
  }
  if (field.kind === 'url') {
    return (
      <input
        type="url"
        disabled={disabled}
        value={typeof v === 'string' ? v : ''}
        onChange={e => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder="https://…"
        className={cls}
      />
    );
  }
  if (field.kind === 'checkbox') {
    return (
      <label className="flex items-center gap-2 text-sm cursor-pointer">
        <input
          type="checkbox"
          disabled={disabled}
          checked={v === true}
          onChange={e => { onChange(e.target.checked); onBlur(); }}
          className="accent-primary"
        />
        <span className="text-foreground">{v === true ? 'Yes' : 'No'}</span>
      </label>
    );
  }
  if (field.kind === 'select') {
    return (
      <select
        disabled={disabled}
        value={typeof v === 'string' ? v : ''}
        onChange={e => { onChange(e.target.value || null); onBlur(); }}
        className={cls}
      >
        <option value="">—</option>
        {field.options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }
  if (field.kind === 'multi_select') {
    const selected = Array.isArray(v) ? (v as string[]) : [];
    const toggle = (opt: string) => {
      const next = selected.includes(opt) ? selected.filter(s => s !== opt) : [...selected, opt];
      onChange(next);
      onBlur();
    };
    return (
      <div className="flex flex-wrap gap-1">
        {field.options.map(o => (
          <button
            key={o}
            type="button"
            disabled={disabled}
            onClick={() => toggle(o)}
            className={`px-2 py-1 rounded text-xs font-medium transition-colors disabled:opacity-60 ${
              selected.includes(o) ? 'bg-primary text-primary-foreground' : 'border border-border text-foreground hover:bg-accent'
            }`}
          >
            {o}
          </button>
        ))}
      </div>
    );
  }
  return null;
}
