'use client';

/**
 * NoteCustomFieldsPanel — render brain_custom_fields for entity_type='note'
 * grouped by category, with editable values that PATCH on commit. Optimistic
 * updates: we set local state immediately, then roll back on error.
 *
 * Field types we render specially:
 *   text/email → text input
 *   url → text input + clickable link when not editing
 *   number → number input
 *   date / datetime → date inputs (datetime-local for datetime)
 *   boolean → checkbox
 *   select → select dropdown
 *   multiselect / tags → comma-separated chips editor
 *   json → textarea + try-parse pre block
 */

import { useEffect, useMemo, useState } from 'react';

type FieldType =
  | 'text' | 'number' | 'date' | 'datetime' | 'url' | 'email'
  | 'select' | 'multiselect' | 'tags' | 'boolean' | 'json';

interface FieldDef {
  id: number;
  fieldName: string;
  fieldLabel: string;
  fieldType: string;
  options: string[] | null;
  required: boolean;
  category: string | null;
  sortOrder: number;
  source: string;
}

interface FieldRow {
  definition: FieldDef;
  value: string | null;
  valueId: number | null;
}

export interface NoteCustomFieldsPanelProps {
  noteId: number;
}

export default function NoteCustomFieldsPanel({ noteId }: NoteCustomFieldsPanelProps) {
  const [items, setItems] = useState<FieldRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Reset via the async path so the effect body itself never calls
      // setState synchronously (react-hooks/set-state-in-effect).
      if (!cancelled) {
        setItems(null);
        setError(null);
      }
      try {
        const r = await fetch(`/api/portal/brain/knowledge/${noteId}/fields`);
        const json = await r.json().catch(() => ({}));
        if (cancelled) return;
        if (!r.ok || !json.success) {
          setError(json.message || `HTTP ${r.status}`);
          setItems([]);
          return;
        }
        setItems(json.data?.items ?? []);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Network error');
          setItems([]);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [noteId]);

  /** Optimistic save → PATCH; rollback on error. */
  const saveValue = async (defId: number, nextValue: string | null) => {
    if (!items) return;
    const before = items;
    const optimistic = items.map((it) =>
      it.definition.id === defId ? { ...it, value: nextValue } : it,
    );
    setItems(optimistic);
    try {
      const r = await fetch(`/api/portal/brain/knowledge/${noteId}/fields/${defId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: nextValue }),
      });
      const json = await r.json().catch(() => ({}));
      if (!r.ok || !json.success) {
        setError(json.message || `Save failed (HTTP ${r.status})`);
        setItems(before);
      } else {
        setError(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
      setItems(before);
    }
  };

  const groups = useMemo(() => {
    if (!items) return [];
    const byCategory = new Map<string, FieldRow[]>();
    for (const it of items) {
      const key = it.definition.category || 'General';
      const arr = byCategory.get(key) ?? [];
      arr.push(it);
      byCategory.set(key, arr);
    }
    return Array.from(byCategory.entries()).map(([name, rows]) => ({
      name,
      rows: rows.slice().sort((a, b) =>
        a.definition.sortOrder - b.definition.sortOrder ||
        a.definition.fieldLabel.localeCompare(b.definition.fieldLabel)),
    }));
  }, [items]);

  if (items === null) {
    return (
      <div className="p-4 flex items-center gap-2 text-sm text-muted-foreground">
        <span className="material-icons animate-spin text-base">progress_activity</span>
        Loading fields…
      </div>
    );
  }

  if (error && items.length === 0) {
    return (
      <div className="p-4 text-sm text-destructive">{error}</div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="p-4 text-sm text-muted-foreground italic">
        No custom fields defined for notes yet. Define fields in your Brain settings to give notes structured metadata.
      </div>
    );
  }

  return (
    <div className="p-3 space-y-4">
      {error && (
        <div className="text-xs text-destructive bg-destructive/10 border border-destructive/30 rounded px-2 py-1.5">
          {error}
        </div>
      )}
      {groups.map((g) => (
        <section key={g.name} className="space-y-2">
          <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {g.name}
          </h4>
          <div className="rounded-md border border-border bg-card divide-y divide-border">
            {g.rows.map((row) => (
              <FieldEditor
                key={row.definition.id}
                row={row}
                onSave={(v) => saveValue(row.definition.id, v)}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/** Editable cell for one field. Each type gets a tailored input. */
function FieldEditor({
  row,
  onSave,
}: {
  row: FieldRow;
  onSave: (value: string | null) => void;
}) {
  const { definition: def, value } = row;
  const ft = def.fieldType as FieldType;

  return (
    <div className="px-3 py-2 grid grid-cols-1 sm:grid-cols-[110px_1fr] gap-1 sm:gap-3 items-start">
      <div className="text-xs font-medium text-muted-foreground pt-1.5 truncate" title={def.fieldLabel}>
        {def.fieldLabel}
        {def.required && <span className="text-destructive ml-0.5">*</span>}
      </div>
      <div className="min-w-0">
        {/*
          Keying FieldInput by value remounts it when the upstream value
          changes (e.g. an optimistic update commits, or another tab writes).
          That re-initializes its `draft` state from prop without needing an
          in-effect setState — keeps the React 19 ref/state-in-effect lints
          happy.
        */}
        <FieldInput key={value ?? ''} type={ft} value={value} options={def.options} onSave={onSave} />
      </div>
    </div>
  );
}

function FieldInput({
  type,
  value,
  options,
  onSave,
}: {
  type: FieldType;
  value: string | null;
  options: string[] | null;
  onSave: (value: string | null) => void;
}) {
  // FieldInput is keyed by `value` upstream (see render below), so a fresh
  // upstream value remounts this component and we re-initialize from prop.
  const [draft, setDraft] = useState<string>(value ?? '');
  const [editing, setEditing] = useState(false);

  const commit = (next: string) => {
    const cleaned = next.length === 0 ? null : next;
    if (cleaned === value) return;
    onSave(cleaned);
  };

  const baseInput =
    'w-full px-2 py-1 rounded border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40';

  if (type === 'boolean') {
    const checked = value === 'true' || value === '1';
    return (
      <label className="inline-flex items-center gap-2 text-sm cursor-pointer py-1">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onSave(e.target.checked ? 'true' : 'false')}
          className="h-4 w-4"
        />
        <span className="text-muted-foreground">{checked ? 'Yes' : 'No'}</span>
      </label>
    );
  }

  if (type === 'select') {
    return (
      <select
        value={value ?? ''}
        onChange={(e) => onSave(e.target.value || null)}
        className={baseInput}
      >
        <option value="">— None —</option>
        {(options ?? []).map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    );
  }

  if (type === 'multiselect' || type === 'tags') {
    const tags = parseTags(value);
    return (
      <TagsEditor
        value={tags}
        suggestions={options ?? []}
        onChange={(next) => onSave(next.length ? JSON.stringify(next) : null)}
      />
    );
  }

  if (type === 'json') {
    return (
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={() => setEditing(true)}
        onBlur={() => { setEditing(false); commit(draft); }}
        rows={editing ? 6 : 3}
        className={`${baseInput} font-mono text-xs`}
        placeholder="{ }"
      />
    );
  }

  if (type === 'date' || type === 'datetime') {
    const inputType = type === 'datetime' ? 'datetime-local' : 'date';
    return (
      <input
        type={inputType}
        value={toInputDate(value, type)}
        onChange={(e) => onSave(e.target.value || null)}
        className={baseInput}
      />
    );
  }

  if (type === 'number') {
    return (
      <input
        type="number"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => commit(draft)}
        className={baseInput}
      />
    );
  }

  // text / email / url — show clickable link in url-mode when not editing.
  if (type === 'url' && value && !editing) {
    return (
      <div className="flex items-center gap-2">
        <a
          href={value}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-primary hover:underline truncate flex-1 min-w-0"
          title={value}
        >
          {value}
        </a>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-muted-foreground hover:text-foreground p-0.5"
          aria-label="Edit URL"
        >
          <span className="material-icons text-sm">edit</span>
        </button>
      </div>
    );
  }

  return (
    <input
      type={type === 'email' ? 'email' : type === 'url' ? 'url' : 'text'}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={() => setEditing(true)}
      onBlur={() => { setEditing(false); commit(draft); }}
      className={baseInput}
      placeholder="—"
    />
  );
}

/** Inline chip editor used by multiselect / tags. */
function TagsEditor({
  value,
  suggestions,
  onChange,
}: {
  value: string[];
  suggestions: string[];
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState('');

  const add = (t: string) => {
    const v = t.trim();
    if (!v) return;
    if (value.includes(v)) { setDraft(''); return; }
    onChange([...value, v]);
    setDraft('');
  };
  const remove = (t: string) => onChange(value.filter((x) => x !== t));

  const filtered = suggestions
    .filter((s) => !value.includes(s) && s.toLowerCase().includes(draft.toLowerCase()))
    .slice(0, 6);

  return (
    <div>
      <div className="flex flex-wrap gap-1 mb-1">
        {value.map((t) => (
          <span
            key={t}
            className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-muted text-foreground"
          >
            {t}
            <button
              type="button"
              onClick={() => remove(t)}
              className="text-muted-foreground hover:text-destructive"
              aria-label={`Remove ${t}`}
            >
              <span className="material-icons text-xs">close</span>
            </button>
          </span>
        ))}
      </div>
      <div className="relative">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault();
              add(draft);
            }
          }}
          placeholder="Add…"
          className="w-full px-2 py-1 rounded border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
        {draft && filtered.length > 0 && (
          <div className="absolute z-10 left-0 right-0 top-full mt-1 bg-popover border border-border rounded-md shadow-lg max-h-32 overflow-auto">
            {filtered.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => add(s)}
                className="block w-full text-left px-2 py-1 text-sm hover:bg-accent"
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Parse a stored multiselect/tags value: prefer JSON array; fall back to
 * comma-separated. Earlier importers used either.
 */
function parseTags(value: string | null): string[] {
  if (!value) return [];
  const trimmed = value.trim();
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
    } catch { /* fall through */ }
  }
  return trimmed.split(',').map((s) => s.trim()).filter(Boolean);
}

/**
 * Coerce stored ISO/date string to the format `<input type="date|datetime-local">`
 * expects. Stored values may be ISO 8601, YYYY-MM-DD, or empty.
 */
function toInputDate(value: string | null, type: 'date' | 'datetime'): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value; // leave unparsable string as-is
  const pad = (n: number) => String(n).padStart(2, '0');
  if (type === 'date') {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
