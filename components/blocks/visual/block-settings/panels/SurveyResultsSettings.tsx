'use client';

// Settings panel for the `SurveyResultsBlockSettings` block type, extracted from the BlockSettings monolith.
import type { SurveyResultsBlock } from '@/types/blocks';
import { useState, useEffect, useRef } from 'react';
import { TokenColorPicker } from '@/components/blocks/visual/TokenColorPicker';

export function SurveyResultsBlockSettings({ block, onChange }: { block: SurveyResultsBlock; onChange: (updates: Partial<SurveyResultsBlock>) => void }) {
  const [surveys, setSurveys] = useState<Array<{ id: number; slug: string; title: string; status: string; responseCount: number; fields: Array<{ id: string; label: string; type: string }> }>>([]);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLoading(true);
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

  const filtered = search
    ? surveys.filter(s => s.title.toLowerCase().includes(search.toLowerCase()) || s.slug.toLowerCase().includes(search.toLowerCase()))
    : surveys;
  const selected = surveys.find(s => s.slug === block.surveySlug);

  const chartOptions: Array<{ value: string; label: string; icon: string }> = [
    { value: 'bar', label: 'Bar Chart', icon: 'bar_chart' },
    { value: 'donut', label: 'Donut Chart', icon: 'donut_large' },
    { value: 'list', label: 'Ranked List', icon: 'format_list_numbered' },
  ];

  return (
    <div className="space-y-4">
      {/* Survey Picker */}
      <div ref={ref} className="relative">
        <label className="block text-sm font-medium text-foreground mb-1">Survey</label>
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
          <input type="text" value={open ? search : block.surveySlug || ''}
            onChange={(e) => { setSearch(e.target.value); if (!open) onChange({ surveySlug: e.target.value }); }}
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
                onClick={() => { onChange({ surveySlug: s.slug }); setOpen(false); setSearch(''); }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-primary/5 ${s.slug === block.surveySlug ? 'bg-primary/10' : ''}`}>
                <span className="material-icons text-primary text-base">poll</span>
                <div className="flex-1 min-w-0">
                  <div className="truncate">{s.title}</div>
                  <div className="text-xs text-muted-foreground">{s.responseCount} responses</div>
                </div>
                {s.slug === block.surveySlug && <span className="material-icons text-primary text-sm">check</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Chart Type */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Chart Type</label>
        <div className="grid grid-cols-3 gap-1.5">
          {chartOptions.map(opt => (
            <button key={opt.value} type="button"
              onClick={() => onChange({ chartType: opt.value as SurveyResultsBlock['chartType'] })}
              className={`flex flex-col items-center gap-1 px-2 py-2 rounded-md border text-xs transition-colors ${
                (block.chartType || 'bar') === opt.value
                  ? 'border-primary bg-primary/5 text-primary'
                  : 'border-border text-muted-foreground hover:border-primary/50'
              }`}>
              <span className="material-icons text-lg">{opt.icon}</span>
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Layout */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Layout</label>
        <select value={block.layout || 'stacked'}
          onChange={(e) => onChange({ layout: e.target.value as 'stacked' | 'tabbed' })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground">
          <option value="stacked">Stacked (all questions visible)</option>
          <option value="tabbed">Tabbed (one question at a time)</option>
        </select>
      </div>

      {/* Title */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Title</label>
        <input type="text" value={block.title || ''} onChange={(e) => onChange({ title: e.target.value })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground" placeholder="Survey Results" />
      </div>

      {/* Description */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Description</label>
        <input type="text" value={block.description || ''} onChange={(e) => onChange({ description: e.target.value })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground" placeholder="See what our customers are saying" />
      </div>

      {/* Toggle options */}
      <div className="space-y-3">
        <div className="flex items-center">
          <input type="checkbox" id="srShowCount" checked={block.showResponseCount !== false}
            onChange={(e) => onChange({ showResponseCount: e.target.checked })}
            className="h-4 w-4 rounded border-border text-primary focus:ring-primary" />
          <label htmlFor="srShowCount" className="ml-2 text-sm text-foreground">Show response count</label>
        </div>
        <div className="flex items-center">
          <input type="checkbox" id="srShowText" checked={block.showTextResponses !== false}
            onChange={(e) => onChange({ showTextResponses: e.target.checked })}
            className="h-4 w-4 rounded border-border text-primary focus:ring-primary" />
          <label htmlFor="srShowText" className="ml-2 text-sm text-foreground">Show text responses</label>
        </div>
      </div>

      {block.showTextResponses !== false && (
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Text responses per question</label>
          <input type="number" min={1} max={50} value={block.textResponseLimit || 5}
            onChange={(e) => onChange({ textResponseLimit: parseInt(e.target.value) || 5 })}
            className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground" />
        </div>
      )}

      {/* Question picker — only shown when a survey with fields is selected */}
      {selected && selected.fields && selected.fields.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-sm font-medium text-foreground">Questions to display</label>
            <button
              type="button"
              onClick={() => onChange({ fieldIds: undefined })}
              className="text-xs text-primary hover:underline"
            >
              All
            </button>
          </div>
          <ul className="space-y-1 rounded border border-border bg-background px-3 py-2 max-h-48 overflow-y-auto">
            {selected.fields.map((field) => {
              const isChecked = !block.fieldIds || block.fieldIds.length === 0 || block.fieldIds.includes(field.id);
              return (
                <li key={field.id} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id={`field-${field.id}`}
                    checked={isChecked}
                    onChange={(e) => {
                      const allIds = selected.fields.map((f) => f.id);
                      const current = block.fieldIds && block.fieldIds.length > 0 ? block.fieldIds : allIds;
                      const next = e.target.checked
                        ? [...current, field.id].filter((v, i, a) => a.indexOf(v) === i)
                        : current.filter((id) => id !== field.id);
                      // If every field is selected, store undefined (= show all)
                      onChange({ fieldIds: next.length === allIds.length ? undefined : next });
                    }}
                    className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                  />
                  <label htmlFor={`field-${field.id}`} className="text-sm text-foreground truncate">{field.label}</label>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Accent Color */}
      <div>
        <TokenColorPicker
          label="Accent Color"
          value={block.accentColor || ''}
          onChange={(v) => onChange({ accentColor: v })}
          placeholder="#6366f1"
        />
      </div>
    </div>
  );
}
