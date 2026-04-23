'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

type EntityType = 'contact' | 'company' | 'deal';
type FieldType =
  | 'text'
  | 'number'
  | 'date'
  | 'select'
  | 'multiselect'
  | 'url'
  | 'email'
  | 'phone'
  | 'boolean';

interface FieldDef {
  id: number;
  fieldName: string;
  fieldType: FieldType;
  options: string[] | null;
  required: boolean;
  sortOrder: number;
  category: string | null;
}

interface FieldValue {
  id: number;
  customFieldId: number;
  value: string | null;
  fieldName: string;
  fieldType: FieldType;
  options: string[] | null;
  required: boolean;
}

interface Props {
  entityType: EntityType;
  entityId: number;
}

const inputClass =
  'w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50';

const DEFAULT_CATEGORY = 'General';

function splitMulti(v: string | null): string[] {
  if (!v) return [];
  return v.split(',').map(s => s.trim()).filter(Boolean);
}

function categoryOf(d: { category: string | null }): string {
  const c = (d.category ?? '').trim();
  return c.length > 0 ? c : DEFAULT_CATEGORY;
}

function formatDate(v: string): string {
  if (!v) return '';
  const d = new Date(v);
  if (isNaN(d.getTime())) return v;
  return d.toLocaleDateString();
}

export default function CrmCustomFieldsPanel({ entityType, entityId }: Props) {
  const [defs, setDefs] = useState<FieldDef[]>([]);
  const [values, setValues] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [defsRes, valsRes] = await Promise.all([
      fetch(`/api/portal/crm/custom-fields?entityType=${entityType}`).then(r => r.json()),
      fetch(`/api/portal/crm/custom-fields/values?entityType=${entityType}&entityId=${entityId}`).then(r =>
        r.json(),
      ),
    ]);
    const defsData: FieldDef[] = defsRes.data ?? [];
    const valsData: FieldValue[] = valsRes.data ?? [];
    setDefs(defsData);
    const valMap: Record<number, string> = {};
    for (const v of valsData) {
      valMap[v.customFieldId] = v.value ?? '';
    }
    setValues(valMap);
    setDirty(false);
    setLoading(false);
  }, [entityType, entityId]);

  useEffect(() => {
    load();
  }, [load]);

  // Group definitions by category, ordered by first appearance.
  const grouped = useMemo(() => {
    const map = new Map<string, FieldDef[]>();
    for (const d of defs) {
      const c = categoryOf(d);
      const list = map.get(c) ?? [];
      list.push(d);
      map.set(c, list);
    }
    return map;
  }, [defs]);

  const categories = useMemo(() => Array.from(grouped.keys()), [grouped]);

  // Keep activeCategory valid as data loads / changes.
  useEffect(() => {
    if (categories.length === 0) {
      setActiveCategory(null);
      return;
    }
    if (!activeCategory || !categories.includes(activeCategory)) {
      setActiveCategory(categories[0]);
    }
  }, [categories, activeCategory]);

  function setValue(fieldId: number, value: string) {
    setValues(prev => ({ ...prev, [fieldId]: value }));
    setDirty(true);
    setSaved(false);
  }

  function toggleMulti(fieldId: number, option: string) {
    const current = splitMulti(values[fieldId] ?? '');
    const next = current.includes(option)
      ? current.filter(o => o !== option)
      : [...current, option];
    setValue(fieldId, next.join(','));
  }

  const missingRequired = useMemo(() => {
    return defs
      .filter(d => d.required)
      .filter(d => !(values[d.id] ?? '').trim())
      .map(d => d.fieldName);
  }, [defs, values]);

  async function save() {
    if (missingRequired.length > 0) {
      setError(`Required: ${missingRequired.join(', ')}`);
      return;
    }
    setError('');
    setSaving(true);
    const payload: Record<number, string> = {};
    for (const d of defs) {
      payload[d.id] = values[d.id] ?? '';
    }
    const res = await fetch('/api/portal/crm/custom-fields/values', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entityType, entityId, values: payload }),
    });
    const d = await res.json();
    setSaving(false);
    if (d.success) {
      setDirty(false);
      setSaved(true);
      setMode('view');
      setTimeout(() => setSaved(false), 2500);
    } else {
      setError(d.message ?? 'Failed to save');
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
        <span className="material-icons animate-spin text-base">refresh</span>
        Loading custom fields...
      </div>
    );
  }

  if (defs.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-2">
        No custom fields defined.{' '}
        <a href="/portal/crm/settings" className="text-primary hover:underline">
          Add some in settings
        </a>
        .
      </p>
    );
  }

  const activeFields = activeCategory ? grouped.get(activeCategory) ?? [] : [];

  function renderViewValue(d: FieldDef): React.ReactNode {
    const raw = values[d.id] ?? '';
    if (!raw) {
      return <span className="text-sm text-muted-foreground italic">—</span>;
    }
    switch (d.fieldType) {
      case 'multiselect': {
        const items = splitMulti(raw);
        if (items.length === 0) return <span className="text-sm text-muted-foreground italic">—</span>;
        return (
          <div className="flex flex-wrap gap-1.5">
            {items.map(o => (
              <span
                key={o}
                className="px-2 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20"
              >
                {o}
              </span>
            ))}
          </div>
        );
      }
      case 'boolean': {
        const yes = raw === 'true';
        return (
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
              yes
                ? 'bg-green-100 text-green-700 border border-green-200'
                : 'bg-gray-100 text-gray-600 border border-gray-200'
            }`}
          >
            <span className="material-icons text-[14px]">{yes ? 'check' : 'close'}</span>
            {yes ? 'Yes' : 'No'}
          </span>
        );
      }
      case 'url': {
        let href = raw;
        if (!/^https?:\/\//i.test(href)) href = `https://${href}`;
        return (
          <a
            href={href}
            target="_blank"
            rel="noreferrer noopener"
            className="text-sm text-primary hover:underline break-all"
          >
            {raw}
          </a>
        );
      }
      case 'email':
        return (
          <a href={`mailto:${raw}`} className="text-sm text-primary hover:underline break-all">
            {raw}
          </a>
        );
      case 'phone':
        return (
          <a href={`tel:${raw}`} className="text-sm text-primary hover:underline">
            {raw}
          </a>
        );
      case 'date':
        return <span className="text-sm text-foreground">{formatDate(raw)}</span>;
      case 'number':
      case 'text':
      case 'select':
      default:
        return <span className="text-sm text-foreground whitespace-pre-wrap break-words">{raw}</span>;
    }
  }

  return (
    <div className="space-y-4">
      {/* Header: mode toggle */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="material-icons text-base">{mode === 'view' ? 'visibility' : 'edit'}</span>
          {mode === 'view' ? 'View mode' : 'Edit mode'}
        </div>
        <button
          type="button"
          onClick={() => {
            if (mode === 'edit' && dirty) {
              if (!confirm('Discard unsaved changes?')) return;
              // Reload values from server to drop edits.
              load();
            }
            setMode(prev => (prev === 'view' ? 'edit' : 'view'));
            setError('');
          }}
          className="flex items-center gap-1.5 px-2.5 py-1 border border-border rounded-lg text-xs font-medium text-foreground hover:bg-accent transition-colors"
        >
          <span className="material-icons text-sm">{mode === 'view' ? 'edit' : 'visibility'}</span>
          {mode === 'view' ? 'Edit' : 'View'}
        </button>
      </div>

      {/* Category tabs */}
      {categories.length > 1 && (
        <div className="flex border-b border-border overflow-x-auto">
          {categories.map(cat => (
            <button
              key={cat}
              type="button"
              onClick={() => setActiveCategory(cat)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border-b-2 -mb-px whitespace-nowrap transition-colors ${
                activeCategory === cat
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {cat}
              <span className="text-[10px] text-muted-foreground">
                ({(grouped.get(cat) ?? []).length})
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Fields */}
      <div className="space-y-3">
        {activeFields.map(d => {
          const val = values[d.id] ?? '';
          return (
            <div key={d.id}>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                {d.fieldName}
                {d.required && <span className="text-destructive ml-1">*</span>}
              </label>

              {mode === 'view' ? (
                <div>{renderViewValue(d)}</div>
              ) : (
                <>
                  {d.fieldType === 'text' && (
                    <input value={val} onChange={e => setValue(d.id, e.target.value)} className={inputClass} />
                  )}
                  {d.fieldType === 'number' && (
                    <input
                      type="number"
                      value={val}
                      onChange={e => setValue(d.id, e.target.value)}
                      className={inputClass}
                    />
                  )}
                  {d.fieldType === 'date' && (
                    <input
                      type="date"
                      value={val}
                      onChange={e => setValue(d.id, e.target.value)}
                      className={inputClass}
                    />
                  )}
                  {d.fieldType === 'url' && (
                    <input
                      type="url"
                      value={val}
                      onChange={e => setValue(d.id, e.target.value)}
                      placeholder="https://"
                      className={inputClass}
                    />
                  )}
                  {d.fieldType === 'email' && (
                    <input
                      type="email"
                      value={val}
                      onChange={e => setValue(d.id, e.target.value)}
                      className={inputClass}
                    />
                  )}
                  {d.fieldType === 'phone' && (
                    <input
                      type="tel"
                      value={val}
                      onChange={e => setValue(d.id, e.target.value)}
                      className={inputClass}
                    />
                  )}
                  {d.fieldType === 'boolean' && (
                    <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                      <input
                        type="checkbox"
                        checked={val === 'true'}
                        onChange={e => setValue(d.id, e.target.checked ? 'true' : 'false')}
                        className="rounded border-border"
                      />
                      {val === 'true' ? 'Yes' : 'No'}
                    </label>
                  )}
                  {d.fieldType === 'select' && (
                    <select value={val} onChange={e => setValue(d.id, e.target.value)} className={inputClass}>
                      <option value="">— Select —</option>
                      {(d.options ?? []).map(o => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  )}
                  {d.fieldType === 'multiselect' && (
                    <div className="flex flex-wrap gap-2">
                      {(d.options ?? []).map(o => {
                        const checked = splitMulti(val).includes(o);
                        return (
                          <button
                            type="button"
                            key={o}
                            onClick={() => toggleMulti(d.id, o)}
                            className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                              checked
                                ? 'bg-primary text-primary-foreground border-primary'
                                : 'bg-background text-foreground border-border hover:bg-accent'
                            }`}
                          >
                            {o}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
          <span className="material-icons text-base">error</span>
          {error}
        </div>
      )}

      {mode === 'edit' && (
        <div className="flex items-center justify-end gap-2">
          {saved && (
            <span className="text-xs text-green-700 flex items-center gap-1">
              <span className="material-icons text-sm">check_circle</span>
              Saved
            </span>
          )}
          <button
            type="button"
            onClick={save}
            disabled={!dirty || saving}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {saving && <span className="material-icons animate-spin text-sm">refresh</span>}
            Save Custom Fields
          </button>
        </div>
      )}

      {mode === 'view' && saved && (
        <div className="flex items-center justify-end">
          <span className="text-xs text-green-700 flex items-center gap-1">
            <span className="material-icons text-sm">check_circle</span>
            Saved
          </span>
        </div>
      )}
    </div>
  );
}
