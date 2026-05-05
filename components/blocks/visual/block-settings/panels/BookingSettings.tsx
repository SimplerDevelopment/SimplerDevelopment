'use client';

// Settings panel for the `BookingBlockSettings` block type, extracted from the BlockSettings monolith.
import type { BookingBlock } from '@/types/blocks';
import { useState, useEffect, useRef } from 'react';
import { TokenColorPicker } from '@/components/blocks/visual/TokenColorPicker';

export function BookingBlockSettings({ block, onChange }: { block: BookingBlock; onChange: (updates: Partial<BookingBlock>) => void }) {
  const [pages, setPages] = useState<Array<{ id: number; slug: string; title: string; duration: number; active: boolean }>>([]);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLoading(true);
    fetch('/api/portal/tools/booking')
      .then(r => r.json())
      .then(json => { if (json.success) setPages(json.data || []); })
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
    ? pages.filter(p => p.title.toLowerCase().includes(search.toLowerCase()) || p.slug.toLowerCase().includes(search.toLowerCase()))
    : pages;
  const selected = pages.find(p => p.slug === block.slug);

  return (
    <div className="space-y-4">
      <div ref={ref} className="relative">
        <label className="block text-sm font-medium text-foreground mb-1">Booking Page</label>
        {selected && !open ? (
          <button type="button" onClick={() => setOpen(true)}
            className="w-full flex items-center gap-2 rounded border border-border bg-background px-3 py-2 text-sm text-left hover:border-primary transition-colors">
            <span className="material-icons text-primary text-base">calendar_month</span>
            <div className="flex-1 min-w-0">
              <div className="truncate font-medium">{selected.title}</div>
              <div className="text-xs text-muted-foreground">{selected.slug} &middot; {selected.duration}min</div>
            </div>
            <span className="material-icons text-sm text-muted-foreground">unfold_more</span>
          </button>
        ) : (
          <input type="text" value={open ? search : block.slug || ''}
            onChange={(e) => { setSearch(e.target.value); if (!open) onChange({ slug: e.target.value }); }}
            onFocus={() => setOpen(true)}
            placeholder={loading ? 'Loading...' : 'Search booking pages...'}
            className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground focus:border-primary focus:ring-1 focus:ring-primary" />
        )}
        {open && (
          <div className="absolute z-50 mt-1 w-full max-h-48 overflow-y-auto rounded-lg border border-border bg-card shadow-lg">
            {filtered.length === 0 ? (
              <div className="px-3 py-4 text-xs text-muted-foreground text-center">
                {loading ? 'Loading...' : pages.length === 0 ? 'No booking pages found' : 'No matches'}
              </div>
            ) : filtered.map(p => (
              <button key={p.slug} type="button"
                onClick={() => { onChange({ slug: p.slug }); setOpen(false); setSearch(''); }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-primary/5 ${p.slug === block.slug ? 'bg-primary/10' : ''}`}>
                <span className="material-icons text-primary text-base">calendar_month</span>
                <div className="flex-1 min-w-0">
                  <div className="truncate">{p.title}</div>
                  <div className="text-xs text-muted-foreground">{p.slug} &middot; {p.duration}min {!p.active && <span className="text-amber-500">(inactive)</span>}</div>
                </div>
                {p.slug === block.slug && <span className="material-icons text-primary text-sm">check</span>}
              </button>
            ))}
          </div>
        )}
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Title</label>
        <input type="text" value={block.title || ''} onChange={(e) => onChange({ title: e.target.value })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground" placeholder="Schedule a Meeting" />
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Description</label>
        <input type="text" value={block.description || ''} onChange={(e) => onChange({ description: e.target.value })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground" placeholder="Pick a time that works for you" />
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Embed Height</label>
        <input type="text" value={block.height || '700px'} onChange={(e) => onChange({ height: e.target.value })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground" placeholder="700px" />
      </div>
      <div className="flex items-center">
        <input type="checkbox" id="bookingShowPageTitle" checked={block.showPageTitle !== false}
          onChange={(e) => onChange({ showPageTitle: e.target.checked })}
          className="h-4 w-4 rounded border-border text-primary focus:ring-primary" />
        <label htmlFor="bookingShowPageTitle" className="ml-2 text-sm text-foreground">Show Booking Page Title</label>
      </div>
      <div className="flex items-center">
        <input type="checkbox" id="bookingShowDescription" checked={block.showDescription !== false}
          onChange={(e) => onChange({ showDescription: e.target.checked })}
          className="h-4 w-4 rounded border-border text-primary focus:ring-primary" />
        <label htmlFor="bookingShowDescription" className="ml-2 text-sm text-foreground">Show Description</label>
      </div>
      <div className="flex items-center">
        <input type="checkbox" id="bookingShowSteps" checked={block.showSteps !== false}
          onChange={(e) => onChange({ showSteps: e.target.checked })}
          className="h-4 w-4 rounded border-border text-primary focus:ring-primary" />
        <label htmlFor="bookingShowSteps" className="ml-2 text-sm text-foreground">Show Step Indicators</label>
      </div>
      <div className="flex items-center">
        <input type="checkbox" id="bookingShowLogo" checked={block.showLogo !== false}
          onChange={(e) => onChange({ showLogo: e.target.checked })}
          className="h-4 w-4 rounded border-border text-primary focus:ring-primary" />
        <label htmlFor="bookingShowLogo" className="ml-2 text-sm text-foreground">Show Logo</label>
      </div>

      {/* Advanced styling overrides — take precedence over the booking page's branding */}
      <details className="border border-border rounded">
        <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-foreground hover:bg-accent/40">
          Advanced styling overrides
        </summary>
        <div className="px-3 pb-3 pt-2 space-y-3">
          <p className="text-xs text-muted-foreground">
            These take precedence over the booking page&apos;s branding. Leave blank to use defaults.
          </p>
          {(() => {
            const so = block.styleOverrides || {};
            const update = (patch: Partial<NonNullable<BookingBlock['styleOverrides']>>) =>
              onChange({ styleOverrides: { ...so, ...patch } });
            const inputClass = 'w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground';
            return (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <TokenColorPicker
                    label="Primary Color"
                    value={so.primaryColor || ''}
                    onChange={(v) => update({ primaryColor: v || undefined })}
                  />
                  <TokenColorPicker
                    label="Background"
                    value={so.backgroundColor || ''}
                    onChange={(v) => update({ backgroundColor: v || undefined })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <TokenColorPicker
                    label="Text Color"
                    value={so.textColor || ''}
                    onChange={(v) => update({ textColor: v || undefined })}
                  />
                  <TokenColorPicker
                    label="Form / Card Background"
                    value={so.formBg || ''}
                    onChange={(v) => update({ formBg: v || undefined })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <TokenColorPicker
                    label="Input Background"
                    value={so.inputBg || ''}
                    onChange={(v) => update({ inputBg: v || undefined })}
                  />
                  <TokenColorPicker
                    label="Button Background"
                    value={so.buttonBg || ''}
                    onChange={(v) => update({ buttonBg: v || undefined })}
                  />
                </div>
                <TokenColorPicker
                  label="Button Text"
                  value={so.buttonText || ''}
                  onChange={(v) => update({ buttonText: v || undefined })}
                />
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">Heading Font</label>
                    <input
                      type="text"
                      value={so.headingFont || ''}
                      onChange={(e) => update({ headingFont: e.target.value || undefined })}
                      className={inputClass}
                      placeholder="e.g. Inter, sans-serif"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">Body Font</label>
                    <input
                      type="text"
                      value={so.bodyFont || ''}
                      onChange={(e) => update({ bodyFont: e.target.value || undefined })}
                      className={inputClass}
                      placeholder="e.g. system-ui, sans-serif"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">Border Radius</label>
                    <input
                      type="text"
                      value={so.borderRadius || ''}
                      onChange={(e) => update({ borderRadius: e.target.value || undefined })}
                      className={inputClass}
                      placeholder="e.g. 8px"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">Button Border Radius</label>
                    <input
                      type="text"
                      value={so.buttonBorderRadius || ''}
                      onChange={(e) => update({ buttonBorderRadius: e.target.value || undefined })}
                      className={inputClass}
                      placeholder="e.g. 6px"
                    />
                  </div>
                </div>
              </>
            );
          })()}
        </div>
      </details>
    </div>
  );
}
