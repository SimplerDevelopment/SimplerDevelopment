'use client';

import { useEffect, useRef, useState } from 'react';
import type { Block } from '@/types/blocks';
import {
  Field,
  ColorField,
  SelectField,
  CheckboxField,
} from '../panel-fields';

// ─── Survey Results Editor (needs local state for surveys fetch) ─────────────

type SurveyMeta = { id: number; slug: string; title: string; responseCount: number; fields: Array<{ id: string; label: string; type: string }> };

export function SurveyResultsEditor({ block, onUpdate }: { block: Block; onUpdate: (updates: Partial<Block>) => void }) {
  const b = block as unknown as Record<string, unknown>;
  const [surveys, setSurveys] = useState<SurveyMeta[]>([]);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/portal/surveys')
      .then(r => r.json())
      .then(json => { if (json.success) setSurveys(json.data || []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const surveySlug = b.surveySlug as string | undefined;
  const filtered = search
    ? surveys.filter(s => s.title.toLowerCase().includes(search.toLowerCase()) || s.slug.toLowerCase().includes(search.toLowerCase()))
    : surveys;
  const selected = surveys.find(s => s.slug === surveySlug);
  const showTextResponses = (b.showTextResponses as boolean) !== false;
  const fieldIds = b.fieldIds as string[] | undefined;

  return (
    <>
      {/* Survey Picker */}
      <div ref={ref} className="relative">
        <span className="text-xs font-medium text-muted-foreground block mb-1">Survey</span>
        {selected && !open ? (
          <button type="button" onClick={() => setOpen(true)}
            className="w-full flex items-center gap-2 rounded border border-border bg-background px-3 py-2 text-sm text-left hover:border-primary transition-colors">
            <span className="material-icons text-primary text-base">poll</span>
            <div className="flex-1 min-w-0">
              <div className="truncate font-medium">{selected.title}</div>
              <div className="text-xs text-muted-foreground">{selected.responseCount} responses</div>
            </div>
            <span className="material-icons text-sm text-muted-foreground">unfold_more</span>
          </button>
        ) : (
          <input type="text" value={open ? search : surveySlug || ''}
            onChange={(e) => { setSearch(e.target.value); if (!open) onUpdate({ surveySlug: e.target.value } as Partial<Block>); }}
            onFocus={() => setOpen(true)}
            placeholder={loading ? 'Loading...' : 'Search surveys...'}
            className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground focus:border-primary focus:ring-1 focus:ring-primary" />
        )}
        {open && (
          <div className="absolute z-50 mt-1 w-full max-h-48 overflow-y-auto rounded-lg border border-border bg-card shadow-lg">
            {filtered.length === 0 ? (
              <div className="px-3 py-4 text-xs text-muted-foreground text-center">
                {loading ? 'Loading...' : surveys.length === 0 ? 'No surveys found' : 'No matches'}
              </div>
            ) : filtered.map(s => (
              <button key={s.slug} type="button"
                onClick={() => { onUpdate({ surveySlug: s.slug } as Partial<Block>); setOpen(false); setSearch(''); }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-primary/5 ${s.slug === surveySlug ? 'bg-primary/10' : ''}`}>
                <span className="material-icons text-primary text-base">poll</span>
                <div className="flex-1 min-w-0">
                  <div className="truncate">{s.title}</div>
                  <div className="text-xs text-muted-foreground">{s.responseCount} responses</div>
                </div>
                {s.slug === surveySlug && <span className="material-icons text-primary text-sm">check</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Chart Type */}
      <div>
        <span className="text-xs font-medium text-muted-foreground block mb-1">Chart Type</span>
        <div className="grid grid-cols-3 gap-1.5">
          {([{ value: 'bar', label: 'Bar Chart', icon: 'bar_chart' }, { value: 'donut', label: 'Donut Chart', icon: 'donut_large' }, { value: 'list', label: 'Ranked List', icon: 'format_list_numbered' }] as const).map(opt => (
            <button key={opt.value} type="button"
              onClick={() => onUpdate({ chartType: opt.value } as Partial<Block>)}
              className={`flex flex-col items-center gap-1 px-2 py-2 rounded-md border text-xs transition-colors ${((b.chartType as string) || 'bar') === opt.value ? 'border-primary bg-primary/5 text-primary' : 'border-border text-muted-foreground hover:border-primary/50'}`}>
              <span className="material-icons text-lg">{opt.icon}</span>
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <SelectField label="Layout" value={(b.layout as string) || 'stacked'} options={['stacked','tabbed']} onChange={(v) => onUpdate({ layout: v } as Partial<Block>)} />
      <Field label="Title" value={(b.title as string) || ''} onChange={(v) => onUpdate({ title: v } as Partial<Block>)} />
      <Field label="Description" value={(b.description as string) || ''} onChange={(v) => onUpdate({ description: v } as Partial<Block>)} />

      <div className="space-y-2">
        <CheckboxField label="Show response count" checked={(b.showResponseCount as boolean) !== false} onChange={(v) => onUpdate({ showResponseCount: v } as Partial<Block>)} />
        <CheckboxField label="Show text responses" checked={showTextResponses} onChange={(v) => onUpdate({ showTextResponses: v } as Partial<Block>)} />
      </div>

      {showTextResponses && (
        <div>
          <span className="text-xs font-medium text-muted-foreground block mb-1">Text responses per question</span>
          <input type="number" min={1} max={50} value={(b.textResponseLimit as number) || 5}
            onChange={(e) => onUpdate({ textResponseLimit: parseInt(e.target.value) || 5 } as Partial<Block>)}
            className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground" />
        </div>
      )}

      {/* Question picker — only when a survey with fields is selected */}
      {selected && selected.fields && selected.fields.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-muted-foreground block">Questions to display</span>
            <button type="button" onClick={() => onUpdate({ fieldIds: undefined } as Partial<Block>)} className="text-xs text-primary hover:underline">All</button>
          </div>
          <ul className="space-y-1 rounded border border-border bg-background px-3 py-2 max-h-48 overflow-y-auto">
            {selected.fields.map((field) => {
              const isChecked = !fieldIds || fieldIds.length === 0 || fieldIds.includes(field.id);
              return (
                <li key={field.id} className="flex items-center gap-2">
                  <input type="checkbox" id={`srfield-${field.id}`} checked={isChecked}
                    onChange={(e) => {
                      const allIds = selected.fields.map(f => f.id);
                      const current = fieldIds && fieldIds.length > 0 ? fieldIds : allIds;
                      const next = e.target.checked
                        ? [...current, field.id].filter((v, i, a) => a.indexOf(v) === i)
                        : current.filter(id => id !== field.id);
                      onUpdate({ fieldIds: next.length === allIds.length ? undefined : next } as Partial<Block>);
                    }}
                    className="h-4 w-4 rounded border-border text-primary focus:ring-primary" />
                  <label htmlFor={`srfield-${field.id}`} className="text-sm text-foreground truncate">{field.label}</label>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <ColorField label="Accent Color" value={(b.accentColor as string) || ''} onChange={(v) => onUpdate({ accentColor: v } as Partial<Block>)} />
    </>
  );
}
