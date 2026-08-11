'use client';

/**
 * Print surfaces ("sides") for one colourway — front, back, sleeve, etc.
 *
 * Each side pairs a mockup image with the printable-area bounds inside it. The
 * bounds are set by dragging on the mockup (see PrintableAreaEditor) rather than
 * typed, because they are pixel coordinates in the image's own space and a wrong
 * value is invisible until a physical print comes back misaligned.
 *
 * Ordering uses up/down buttons rather than drag-and-drop: a product has a
 * handful of sides, the buttons are keyboard-accessible for free, and they cost
 * a fraction of the code a drag library would. Same `order` column either way.
 */
import { useCallback, useEffect, useState } from 'react';
import { PrintableAreaEditor, type Bounds } from './PrintableAreaEditor';

export interface Side extends Bounds {
  id: number;
  side: string;
  label: string | null;
  imageUrl: string;
  order: number;
}

const COMMON_SIDES = ['front', 'back', 'left_sleeve', 'right_sleeve'];

export function ProductSidesPanel({ siteId, productId, styleId }: { siteId: number; productId: number; styleId: number }) {
  const base = `/api/portal/websites/${siteId}/store/products/${productId}/styles/${styleId}/sides`;
  const [sides, setSides] = useState<Side[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(base);
      const j = await r.json();
      if (!j.success) throw new Error(j.message ?? 'Failed to load sides');
      setSides(j.data ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [base]);

  useEffect(() => { void load(); }, [load]);

  // The side route exposes PUT, not PATCH — it merges the keys it is given
  // rather than replacing the row, so a partial body is correct here.
  const patch = async (id: number, body: Partial<Side>) => {
    // Optimistic: the bounds editor emits on every pointermove, so waiting for a
    // round-trip per frame would make dragging feel broken.
    setSides((prev) => prev.map((s) => (s.id === id ? { ...s, ...body } : s)));
    const r = await fetch(`${base}/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => ({}));
    if (!j.success) { setError(j.message ?? 'Save failed'); void load(); }
  };

  const upload = async (file: File): Promise<string | null> => {
    const fd = new FormData();
    fd.append('file', file);
    const r = await fetch('/api/portal/media/upload', { method: 'POST', body: fd });
    const j = await r.json().catch(() => ({}));
    if (!j.success) { setError(j.message ?? 'Upload failed'); return null; }
    return j.data?.url ?? null;
  };

  const addSide = async (file: File) => {
    setBusy(true);
    try {
      const url = await upload(file);
      if (!url) return;
      const used = new Set(sides.map((s) => s.side));
      const side = COMMON_SIDES.find((s) => !used.has(s)) ?? `side_${sides.length + 1}`;
      const r = await fetch(base, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Bounds default to a centred box the user then drags; starting at 0,0
        // with the full image would give a "printable area" that is never right.
        body: JSON.stringify({ side, imageUrl: url, printableX: 0, printableY: 0, order: sides.length }),
      });
      const j = await r.json().catch(() => ({}));
      if (!j.success) { setError(j.message ?? 'Could not add side'); return; }
      await load();
    } finally { setBusy(false); }
  };

  const remove = async (id: number) => {
    setBusy(true);
    try {
      await fetch(`${base}/${id}`, { method: 'DELETE' });
      await load();
    } finally { setBusy(false); }
  };

  const swap = async (i: number, j: number) => {
    if (j < 0 || j >= sides.length) return;
    const a = sides[i], b = sides[j];
    setSides((prev) => { const n = [...prev]; [n[i], n[j]] = [n[j], n[i]]; return n; });
    await Promise.all([
      fetch(`${base}/${a.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ order: j }) }),
      fetch(`${base}/${b.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ order: i }) }),
    ]);
  };

  if (loading) return <p className="text-sm text-muted-foreground">Loading print surfaces…</p>;

  return (
    <div className="space-y-4">
      {error && (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      )}

      {sides.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No print surfaces yet. Upload a mockup image below — the customer designs on top of it, and the box you drag is the area that actually prints.
        </p>
      )}

      {sides.map((s, i) => (
        <div key={s.id} className="rounded-xl border border-border bg-background p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={s.side}
              onChange={(e) => patch(s.id, { side: e.target.value })}
              className="w-36 rounded-md border border-border bg-card px-2 py-1 text-sm"
              aria-label="Side key"
            />
            <input
              value={s.label ?? ''}
              placeholder="Label (optional)"
              onChange={(e) => patch(s.id, { label: e.target.value })}
              className="w-44 rounded-md border border-border bg-card px-2 py-1 text-sm"
              aria-label="Side label"
            />
            <div className="ml-auto flex items-center gap-1">
              <button type="button" onClick={() => swap(i, i - 1)} disabled={i === 0} title="Move up"
                className="rounded-md border border-border p-1 disabled:opacity-30">
                <span className="material-icons text-base">arrow_upward</span>
              </button>
              <button type="button" onClick={() => swap(i, i + 1)} disabled={i === sides.length - 1} title="Move down"
                className="rounded-md border border-border p-1 disabled:opacity-30">
                <span className="material-icons text-base">arrow_downward</span>
              </button>
              <button type="button" onClick={() => remove(s.id)} title="Remove side"
                className="rounded-md border border-destructive/40 p-1 text-destructive">
                <span className="material-icons text-base">delete</span>
              </button>
            </div>
          </div>

          <PrintableAreaEditor
            imageUrl={s.imageUrl}
            value={{
              printableX: s.printableX,
              printableY: s.printableY,
              printableWidth: s.printableWidth,
              printableHeight: s.printableHeight,
            }}
            onChange={(b) => patch(s.id, b)}
          />
        </div>
      ))}

      <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-sm text-muted-foreground hover:bg-muted/30">
        <span className="material-icons text-base">add_photo_alternate</span>
        {busy ? 'Working…' : 'Add print surface (upload mockup)'}
        <input
          type="file"
          accept="image/*"
          className="hidden"
          disabled={busy}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void addSide(f); e.target.value = ''; }}
        />
      </label>
    </div>
  );
}
