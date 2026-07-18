'use client';

/**
 * JSON-ish key/value editor for seeding a playbook run's `context`.
 *
 * The context column is `Record<string, unknown>` — step configs template
 * against it via {{var}} substitution. The most common use is a flat string
 * map (e.g. `personName`, `personEmail`, `managerName`), but the editor lets
 * the user paste arbitrary JSON for a value when they need nested objects.
 *
 * Stays controlled by parent — pass `value` + `onChange`.
 */
import { useMemo, useState } from 'react';

interface Props {
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
  disabled?: boolean;
}

interface Row {
  rowKey: string; // internal stable key (NOT the data key)
  key: string;
  /** Stringified value. `"json"` mode = parsed as JSON; `"text"` = used as a string. */
  mode: 'text' | 'json';
  raw: string;
  /** Error parsing JSON, if any. */
  err: string | null;
}

function newRow(key = '', raw = ''): Row {
  return {
    rowKey: Math.random().toString(36).slice(2),
    key,
    mode: 'text',
    raw,
    err: null,
  };
}

function objectToRows(obj: Record<string, unknown>): Row[] {
  const rows: Row[] = [];
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'string') {
      rows.push({
        rowKey: Math.random().toString(36).slice(2),
        key: k,
        mode: 'text',
        raw: v,
        err: null,
      });
    } else {
      rows.push({
        rowKey: Math.random().toString(36).slice(2),
        key: k,
        mode: 'json',
        raw: JSON.stringify(v, null, 2),
        err: null,
      });
    }
  }
  if (rows.length === 0) rows.push(newRow());
  return rows;
}

function rowsToObject(rows: Row[]): { obj: Record<string, unknown>; anyErr: boolean } {
  const out: Record<string, unknown> = {};
  let anyErr = false;
  for (const r of rows) {
    if (!r.key.trim()) continue;
    if (r.err) {
      anyErr = true;
      continue;
    }
    if (r.mode === 'text') {
      out[r.key.trim()] = r.raw;
    } else {
      try {
        out[r.key.trim()] = JSON.parse(r.raw);
      } catch {
        anyErr = true;
      }
    }
  }
  return { obj: out, anyErr };
}

export default function PlaybookContextEditor({ value, onChange, disabled }: Props) {
  // Initialize once from value; thereafter rows are the source of truth.
  const initial = useMemo(() => objectToRows(value), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [rows, setRows] = useState<Row[]>(initial);

  const commit = (next: Row[]) => {
    setRows(next);
    const { obj } = rowsToObject(next);
    onChange(obj);
  };

  const updateRow = (rowKey: string, patch: Partial<Row>) => {
    const next = rows.map((r) => {
      if (r.rowKey !== rowKey) return r;
      const merged = { ...r, ...patch };
      // Validate JSON when mode=json.
      if (merged.mode === 'json') {
        try {
          if (merged.raw.trim() === '') merged.err = null;
          else {
            JSON.parse(merged.raw);
            merged.err = null;
          }
        } catch (e) {
          merged.err = e instanceof Error ? e.message : 'Invalid JSON';
        }
      } else {
        merged.err = null;
      }
      return merged;
    });
    commit(next);
  };

  const addRow = () => commit([...rows, newRow()]);
  const removeRow = (rowKey: string) =>
    commit(rows.length === 1 ? [newRow()] : rows.filter((r) => r.rowKey !== rowKey));

  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div key={r.rowKey} className="grid grid-cols-12 gap-2 items-start">
          <input
            type="text"
            value={r.key}
            onChange={(e) => updateRow(r.rowKey, { key: e.target.value })}
            placeholder="key (e.g. personName)"
            disabled={disabled}
            className="col-span-4 px-2 py-1.5 text-sm rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <div className="col-span-7 space-y-1">
            {r.mode === 'text' ? (
              <input
                type="text"
                value={r.raw}
                onChange={(e) => updateRow(r.rowKey, { raw: e.target.value })}
                placeholder="value"
                disabled={disabled}
                className="w-full px-2 py-1.5 text-sm rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
            ) : (
              <textarea
                value={r.raw}
                onChange={(e) => updateRow(r.rowKey, { raw: e.target.value })}
                placeholder='{"id":42,"name":"Jane"}'
                rows={3}
                disabled={disabled}
                className="w-full px-2 py-1.5 text-sm rounded-md border border-border bg-background text-foreground font-mono focus:outline-none focus:ring-2 focus:ring-primary"
              />
            )}
            <div className="flex items-center gap-2 text-[11px]">
              <button
                type="button"
                onClick={() =>
                  updateRow(r.rowKey, {
                    mode: r.mode === 'text' ? 'json' : 'text',
                  })
                }
                disabled={disabled}
                className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
              >
                <span className="material-icons text-[14px]">
                  {r.mode === 'text' ? 'code' : 'short_text'}
                </span>
                {r.mode === 'text' ? 'switch to JSON' : 'switch to text'}
              </button>
              {r.err && (
                <span className="text-destructive inline-flex items-center gap-1">
                  <span className="material-icons text-[14px]">error_outline</span>
                  {r.err}
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => removeRow(r.rowKey)}
            disabled={disabled}
            aria-label="Remove this variable"
            className="col-span-1 p-1 text-muted-foreground hover:text-destructive rounded justify-self-end"
          >
            <span className="material-icons text-sm">close</span>
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={addRow}
        disabled={disabled}
        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-md border border-border text-foreground hover:bg-accent disabled:opacity-50"
      >
        <span className="material-icons text-sm">add</span>
        Add variable
      </button>
    </div>
  );
}
