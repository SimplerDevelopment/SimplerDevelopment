'use client';

/**
 * Colourways ("styles") for a designable product, and the print surfaces inside
 * each one. This is the setup that previously had no UI at all — the API routes
 * existed but nothing called them, so a merchant had to run a seed script or
 * hand-write SQL to make a product designable (see scripts/seed-pod-product.ts).
 *
 * Shape mirrors how Printful models the world: a colourway is a distinct
 * catalogue variant, so `printfulVariantId` lives here rather than on the
 * product. A style with no variant ID cannot be fulfilled, which is why the gap
 * is called out inline rather than left to fail at order time.
 *
 * Both this and the sides panel write through PUT (not PATCH) — the routes merge
 * the keys they are given, so partial bodies are correct.
 */
import { useCallback, useEffect, useState } from 'react';
import { ProductSidesPanel } from './ProductSidesPanel';

interface Style {
  id: number;
  name: string;
  colorHex: string | null;
  priceCents: number | null;
  printfulVariantId: number | null;
  order: number;
  active: boolean;
}

export function ProductStylesPanel({ siteId, productId }: { siteId: number; productId: number }) {
  const base = `/api/portal/websites/${siteId}/store/products/${productId}/styles`;
  const [styles, setStyles] = useState<Style[]>([]);
  const [openId, setOpenId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(base);
      const j = await r.json();
      if (!j.success) throw new Error(j.message ?? 'Failed to load colourways');
      setStyles(j.data ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [base]);

  useEffect(() => { void load(); }, [load]);

  const save = async (id: number, body: Partial<Style>) => {
    setStyles((prev) => prev.map((s) => (s.id === id ? { ...s, ...body } : s)));
    const r = await fetch(`${base}/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => ({}));
    if (!j.success) { setError(j.message ?? 'Save failed'); void load(); }
  };

  const add = async () => {
    const name = newName.trim();
    if (!name) return;
    const r = await fetch(base, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, order: styles.length }),
    });
    const j = await r.json().catch(() => ({}));
    if (!j.success) { setError(j.message ?? 'Could not add colourway'); return; }
    setNewName('');
    await load();
    if (j.data?.id) setOpenId(j.data.id);
  };

  const remove = async (id: number) => {
    // Sides cascade with the style (FK onDelete: cascade), so this removes the
    // whole colourway including its print surfaces.
    await fetch(`${base}/${id}`, { method: 'DELETE' });
    if (openId === id) setOpenId(null);
    await load();
  };

  const swap = async (i: number, j: number) => {
    if (j < 0 || j >= styles.length) return;
    const a = styles[i], b = styles[j];
    setStyles((prev) => { const n = [...prev]; [n[i], n[j]] = [n[j], n[i]]; return n; });
    await Promise.all([
      fetch(`${base}/${a.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ order: j }) }),
      fetch(`${base}/${b.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ order: i }) }),
    ]);
  };

  if (loading) return <p className="text-sm text-muted-foreground">Loading colourways…</p>;

  const unmapped = styles.filter((s) => s.active && s.printfulVariantId == null).length;

  return (
    <div className="space-y-4">
      {error && (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      )}

      {unmapped > 0 && (
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
          <span className="material-icons align-middle text-base">warning</span>{' '}
          {unmapped} active colourway{unmapped === 1 ? '' : 's'} without a Printful variant ID — orders containing{' '}
          {unmapped === 1 ? 'it' : 'them'} cannot be sent for fulfilment.
        </p>
      )}

      {styles.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No colourways yet. Add one (e.g. “Black”), then upload a mockup for each side you want customers to print on.
        </p>
      )}

      {styles.map((s, i) => (
        <div key={s.id} className="rounded-xl border border-border bg-card">
          <div className="flex flex-wrap items-center gap-2 p-4">
            <button type="button" onClick={() => setOpenId(openId === s.id ? null : s.id)}
              className="flex items-center gap-1 text-sm font-medium" aria-expanded={openId === s.id}>
              <span className="material-icons text-base">{openId === s.id ? 'expand_less' : 'expand_more'}</span>
            </button>

            <input value={s.name} onChange={(e) => save(s.id, { name: e.target.value })}
              className="w-40 rounded-md border border-border bg-background px-2 py-1 text-sm" aria-label="Colourway name" />

            <input type="color" value={s.colorHex ?? '#000000'} onChange={(e) => save(s.id, { colorHex: e.target.value })}
              className="h-8 w-10 cursor-pointer rounded border border-border bg-background" aria-label="Swatch colour" title="Swatch colour" />

            <label className="flex items-center gap-1 text-xs text-muted-foreground">
              Printful variant
              <input
                type="number" min={1} placeholder="unmapped"
                value={s.printfulVariantId ?? ''}
                onChange={(e) => save(s.id, { printfulVariantId: e.target.value === '' ? null : Number(e.target.value) })}
                className={`w-28 rounded-md border bg-background px-2 py-1 text-sm ${
                  s.active && s.printfulVariantId == null ? 'border-amber-500/60' : 'border-border'
                }`}
              />
            </label>

            <label className="flex items-center gap-1 text-xs text-muted-foreground">
              <input type="checkbox" checked={s.active} onChange={(e) => save(s.id, { active: e.target.checked })} />
              Active
            </label>

            <div className="ml-auto flex items-center gap-1">
              <button type="button" onClick={() => swap(i, i - 1)} disabled={i === 0} title="Move up"
                className="rounded-md border border-border p-1 disabled:opacity-30">
                <span className="material-icons text-base">arrow_upward</span>
              </button>
              <button type="button" onClick={() => swap(i, i + 1)} disabled={i === styles.length - 1} title="Move down"
                className="rounded-md border border-border p-1 disabled:opacity-30">
                <span className="material-icons text-base">arrow_downward</span>
              </button>
              <button type="button" onClick={() => remove(s.id)} title="Remove colourway and its print surfaces"
                className="rounded-md border border-destructive/40 p-1 text-destructive">
                <span className="material-icons text-base">delete</span>
              </button>
            </div>
          </div>

          {openId === s.id && (
            <div className="border-t border-border p-4">
              <ProductSidesPanel siteId={siteId} productId={productId} styleId={s.id} />
            </div>
          )}
        </div>
      ))}

      <div className="flex items-center gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void add(); } }}
          placeholder="New colourway, e.g. Black"
          className="w-56 rounded-md border border-border bg-background px-2 py-1 text-sm"
        />
        <button type="button" onClick={() => void add()} disabled={!newName.trim()}
          className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-sm disabled:opacity-40">
          <span className="material-icons text-base">add</span> Add colourway
        </button>
      </div>
    </div>
  );
}
