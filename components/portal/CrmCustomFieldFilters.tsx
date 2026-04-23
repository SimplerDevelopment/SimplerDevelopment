'use client';

import { useEffect, useRef, useState } from 'react';

type EntityType = 'contact' | 'company' | 'deal';
type FieldType =
  | 'text' | 'number' | 'date' | 'select' | 'multiselect'
  | 'url' | 'email' | 'phone' | 'boolean';

interface FieldDef {
  id: number;
  fieldName: string;
  fieldType: FieldType;
  options: string[] | null;
  filterable: boolean;
  sortOrder: number;
}

interface Props {
  entityType: EntityType;
  // Record keyed by custom field id → selected value (string). '' = no filter.
  // For multiselect filters, the value is pipe-separated (e.g. "WordPress|Drupal").
  values: Record<number, string>;
  onChange: (values: Record<number, string>) => void;
}

const FILTERABLE_TYPES: FieldType[] = ['select', 'multiselect', 'boolean'];
const SELECT_CLASS =
  'px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50';

function splitPipe(v: string | null | undefined): string[] {
  if (!v) return [];
  return v.split('|').map(s => s.trim()).filter(Boolean);
}

export default function CrmCustomFieldFilters({ entityType, values, onChange }: Props) {
  const [fields, setFields] = useState<FieldDef[]>([]);

  useEffect(() => {
    fetch(`/api/portal/crm/custom-fields?entityType=${entityType}`)
      .then(r => r.json())
      .then(d => {
        const all: FieldDef[] = d.data ?? [];
        setFields(all.filter(f => f.filterable && FILTERABLE_TYPES.includes(f.fieldType)));
      });
  }, [entityType]);

  if (fields.length === 0) return null;

  function setValue(fieldId: number, value: string) {
    const next = { ...values };
    if (value) next[fieldId] = value;
    else delete next[fieldId];
    onChange(next);
  }

  return (
    <>
      {fields.map(f => {
        const current = values[f.id] ?? '';
        if (f.fieldType === 'boolean') {
          return (
            <select
              key={f.id}
              value={current}
              onChange={e => setValue(f.id, e.target.value)}
              className={SELECT_CLASS}
              title={f.fieldName}
            >
              <option value="">{f.fieldName}: any</option>
              <option value="true">{f.fieldName}: yes</option>
              <option value="false">{f.fieldName}: no</option>
            </select>
          );
        }
        if (f.fieldType === 'multiselect') {
          return (
            <MultiselectFilter
              key={f.id}
              field={f}
              selected={splitPipe(current)}
              onChange={vals => setValue(f.id, vals.join('|'))}
            />
          );
        }
        const opts = f.options ?? [];
        return (
          <select
            key={f.id}
            value={current}
            onChange={e => setValue(f.id, e.target.value)}
            className={SELECT_CLASS}
            title={f.fieldName}
          >
            <option value="">{f.fieldName}: any</option>
            {opts.map(o => (
              <option key={o} value={o}>{f.fieldName}: {o}</option>
            ))}
          </select>
        );
      })}
    </>
  );
}

function MultiselectFilter({
  field,
  selected,
  onChange,
}: {
  field: FieldDef;
  selected: string[];
  onChange: (vals: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const opts = field.options ?? [];

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function toggle(opt: string) {
    if (selected.includes(opt)) onChange(selected.filter(o => o !== opt));
    else onChange([...selected, opt]);
  }

  const summary =
    selected.length === 0
      ? `${field.fieldName}: any`
      : selected.length <= 2
        ? `${field.fieldName}: ${selected.join(', ')}`
        : `${field.fieldName}: ${selected.length} selected`;

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`${SELECT_CLASS} flex items-center gap-1 cursor-pointer ${
          selected.length > 0 ? 'border-primary text-primary' : ''
        }`}
        title={field.fieldName}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="truncate max-w-[16rem]">{summary}</span>
        <span className="material-icons text-base">arrow_drop_down</span>
      </button>
      {open && (
        <div className="absolute z-20 mt-1 left-0 min-w-[14rem] max-h-72 overflow-auto bg-popover border border-border rounded-lg shadow-lg p-1">
          <div className="flex items-center justify-between px-2 py-1 text-xs text-muted-foreground">
            <span>{selected.length} selected</span>
            {selected.length > 0 && (
              <button
                type="button"
                onClick={() => onChange([])}
                className="text-primary hover:underline"
              >
                clear
              </button>
            )}
          </div>
          {opts.map(o => {
            const checked = selected.includes(o);
            return (
              <label
                key={o}
                className="flex items-center gap-2 px-2 py-1.5 rounded text-sm cursor-pointer hover:bg-accent"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(o)}
                  className="accent-primary"
                />
                <span className="flex-1 truncate">{o}</span>
              </label>
            );
          })}
          {opts.length === 0 && (
            <div className="px-2 py-2 text-xs text-muted-foreground">No options.</div>
          )}
        </div>
      )}
    </div>
  );
}
