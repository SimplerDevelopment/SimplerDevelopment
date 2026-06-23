'use client';

import { useEffect, useState, useCallback } from 'react';
import MediaPicker from '@/components/admin/MediaPicker';
import { slugify } from '@/lib/publishing/slug';

interface DesignSurface {
  id: number;
  productId: number;
  name: string;
  slug: string;
  displayOrder: number;
  mockupImage: string;
  canvasWidth: number;
  canvasHeight: number;
  printAreaX: number;
  printAreaY: number;
  printAreaWidth: number;
  printAreaHeight: number;
  printDpi: number;
  active: boolean;
}

interface NewSurfaceDraft {
  name: string;
  slug: string;
  mockupImage: string;
  canvasWidth: number;
  canvasHeight: number;
  printAreaX: number;
  printAreaY: number;
  printAreaWidth: number;
  printAreaHeight: number;
  printDpi: number;
  displayOrder: number;
  active: boolean;
  slugTouched: boolean;
}

interface DesignSurfacesEditorProps {
  productId: number;
  siteId: string;
}

const DEFAULT_DRAFT: NewSurfaceDraft = {
  name: '',
  slug: '',
  mockupImage: '',
  canvasWidth: 800,
  canvasHeight: 600,
  printAreaX: 100,
  printAreaY: 100,
  printAreaWidth: 600,
  printAreaHeight: 400,
  printDpi: 300,
  displayOrder: 0,
  active: true,
  slugTouched: false,
};

export default function DesignSurfacesEditor({ productId, siteId }: DesignSurfacesEditorProps) {
  const base = `/api/portal/websites/${siteId}/store/products/${productId}/design-surfaces`;
  const mediaEndpoint = `/api/portal/cms/websites/${siteId}/media`;

  const [surfaces, setSurfaces] = useState<DesignSurface[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<Record<number, Partial<DesignSurface>>>({});
  const [savingId, setSavingId] = useState<number | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [draft, setDraft] = useState<NewSurfaceDraft>(DEFAULT_DRAFT);
  const [creating, setCreating] = useState(false);

  const fetchSurfaces = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(base);
      const data = await res.json();
      if (data.success) {
        setSurfaces(data.data || []);
      } else {
        setError(data.message || 'Failed to load surfaces');
      }
    } catch {
      setError('Failed to load surfaces');
    } finally {
      setLoading(false);
    }
  }, [base]);

  useEffect(() => {
    fetchSurfaces();
  }, [fetchSurfaces]);

  const updateLocal = (id: number, patch: Partial<DesignSurface>) => {
    setEditing((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  };

  const saveSurface = async (surface: DesignSurface) => {
    const patch = editing[surface.id];
    if (!patch || Object.keys(patch).length === 0) return;
    setSavingId(surface.id);
    setError('');
    try {
      const res = await fetch(`${base}/${surface.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (data.success) {
        setSurfaces((prev) => prev.map((s) => (s.id === surface.id ? { ...s, ...patch } : s)));
        setEditing((prev) => {
          const next = { ...prev };
          delete next[surface.id];
          return next;
        });
      } else {
        setError(data.message || 'Save failed');
      }
    } catch {
      setError('Save failed');
    } finally {
      setSavingId(null);
    }
  };

  const deleteSurface = async (id: number) => {
    if (!confirm('Delete this surface? Customer designs that target this surface will lose its layers.')) return;
    setSavingId(id);
    try {
      const res = await fetch(`${base}/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setSurfaces((prev) => prev.filter((s) => s.id !== id));
      } else {
        setError(data.message || 'Delete failed');
      }
    } catch {
      setError('Delete failed');
    } finally {
      setSavingId(null);
    }
  };

  const updateMockup = async (id: number, url: string) => {
    updateLocal(id, { mockupImage: url });
    // Save immediately for mockup changes — feels more direct than waiting on Save.
    setSavingId(id);
    try {
      const res = await fetch(`${base}/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mockupImage: url }),
      });
      const data = await res.json();
      if (data.success) {
        setSurfaces((prev) => prev.map((s) => (s.id === id ? { ...s, mockupImage: url } : s)));
        setEditing((prev) => {
          const next = { ...prev };
          if (next[id]) delete next[id].mockupImage;
          return next;
        });
      }
    } catch { /* ignore */ } finally {
      setSavingId(null);
    }
  };

  const createSurface = async () => {
    if (!draft.name.trim()) {
      setError('Name is required');
      return;
    }
    if (!draft.slug.trim()) {
      setError('Slug is required');
      return;
    }
    if (!draft.mockupImage) {
      setError('Mockup image is required');
      return;
    }
    setCreating(true);
    setError('');
    try {
      const res = await fetch(base, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: draft.name,
          slug: draft.slug,
          mockupImage: draft.mockupImage,
          canvasWidth: draft.canvasWidth,
          canvasHeight: draft.canvasHeight,
          printAreaX: draft.printAreaX,
          printAreaY: draft.printAreaY,
          printAreaWidth: draft.printAreaWidth,
          printAreaHeight: draft.printAreaHeight,
          printDpi: draft.printDpi,
          displayOrder: draft.displayOrder || surfaces.length,
          active: draft.active,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSurfaces((prev) => [...prev, data.data]);
        setDraft(DEFAULT_DRAFT);
        setShowAdd(false);
      } else {
        setError(data.message || 'Create failed');
      }
    } catch {
      setError('Create failed');
    } finally {
      setCreating(false);
    }
  };

  const inputClass =
    'w-full px-2 py-1 rounded border border-border bg-background text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-primary/40';

  return (
    <div className="space-y-3">
      {error && (
        <div className="flex items-center gap-2 p-2 bg-red-50 border border-red-200 rounded text-red-700 text-xs dark:bg-red-900/20 dark:border-red-800 dark:text-red-400">
          <span className="material-icons text-sm">error</span>
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-6">
          <span className="material-icons animate-spin text-primary text-xl">refresh</span>
        </div>
      ) : surfaces.length === 0 && !showAdd ? (
        <div className="text-center border-2 border-dashed border-border rounded-lg py-8">
          <span className="material-icons text-3xl text-muted-foreground/40 block mb-1">brush</span>
          <p className="text-sm text-muted-foreground mb-3">No design surfaces yet</p>
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="inline-flex items-center gap-1 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:bg-primary/90 transition-colors"
          >
            <span className="material-icons text-sm">add</span>
            Add your first surface
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="px-2 py-2 text-xs font-medium text-muted-foreground">Name</th>
                <th className="px-2 py-2 text-xs font-medium text-muted-foreground">Slug</th>
                <th className="px-2 py-2 text-xs font-medium text-muted-foreground">Mockup</th>
                <th className="px-2 py-2 text-xs font-medium text-muted-foreground">Canvas</th>
                <th className="px-2 py-2 text-xs font-medium text-muted-foreground">Print Area</th>
                <th className="px-2 py-2 text-xs font-medium text-muted-foreground">DPI</th>
                <th className="px-2 py-2 text-xs font-medium text-muted-foreground">Order</th>
                <th className="px-2 py-2 text-xs font-medium text-muted-foreground">Active</th>
                <th className="px-2 py-2 text-xs font-medium text-muted-foreground w-24">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {surfaces.map((surface) => {
                const e = editing[surface.id] || {};
                const merged = { ...surface, ...e };
                const dirty = Object.keys(e).length > 0;
                return (
                  <tr key={surface.id} className="align-top">
                    <td className="px-2 py-2">
                      <input
                        value={merged.name}
                        onChange={(ev) => updateLocal(surface.id, { name: ev.target.value })}
                        className={`${inputClass} w-28`}
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        value={merged.slug}
                        onChange={(ev) => updateLocal(surface.id, { slug: slugify(ev.target.value) })}
                        className={`${inputClass} w-28 font-mono`}
                      />
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex items-start gap-2">
                        {merged.mockupImage ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={merged.mockupImage}
                            alt={merged.name}
                            className="w-12 h-12 object-cover rounded border border-border"
                          />
                        ) : (
                          <div className="w-12 h-12 rounded border border-dashed border-border flex items-center justify-center">
                            <span className="material-icons text-muted-foreground/40 text-base">image</span>
                          </div>
                        )}
                        <div className="flex-1 min-w-[140px]">
                          <MediaPicker
                            value={merged.mockupImage}
                            onChange={(url) => updateMockup(surface.id, url)}
                            mimeTypeFilter="image"
                            label={merged.mockupImage ? 'Replace' : 'Pick mockup'}
                            apiEndpoint={mediaEndpoint}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min="1"
                          value={merged.canvasWidth}
                          onChange={(ev) => updateLocal(surface.id, { canvasWidth: parseInt(ev.target.value) || 0 })}
                          className={`${inputClass} w-16`}
                        />
                        <span className="text-muted-foreground text-xs">×</span>
                        <input
                          type="number"
                          min="1"
                          value={merged.canvasHeight}
                          onChange={(ev) => updateLocal(surface.id, { canvasHeight: parseInt(ev.target.value) || 0 })}
                          className={`${inputClass} w-16`}
                        />
                      </div>
                    </td>
                    <td className="px-2 py-2">
                      <div className="grid grid-cols-2 gap-1 max-w-[160px]">
                        <input
                          type="number"
                          value={merged.printAreaX}
                          onChange={(ev) => updateLocal(surface.id, { printAreaX: parseInt(ev.target.value) || 0 })}
                          placeholder="X"
                          className={inputClass}
                        />
                        <input
                          type="number"
                          value={merged.printAreaY}
                          onChange={(ev) => updateLocal(surface.id, { printAreaY: parseInt(ev.target.value) || 0 })}
                          placeholder="Y"
                          className={inputClass}
                        />
                        <input
                          type="number"
                          value={merged.printAreaWidth}
                          onChange={(ev) => updateLocal(surface.id, { printAreaWidth: parseInt(ev.target.value) || 0 })}
                          placeholder="W"
                          className={inputClass}
                        />
                        <input
                          type="number"
                          value={merged.printAreaHeight}
                          onChange={(ev) => updateLocal(surface.id, { printAreaHeight: parseInt(ev.target.value) || 0 })}
                          placeholder="H"
                          className={inputClass}
                        />
                      </div>
                    </td>
                    <td className="px-2 py-2">
                      <input
                        type="number"
                        min="72"
                        value={merged.printDpi}
                        onChange={(ev) => updateLocal(surface.id, { printDpi: parseInt(ev.target.value) || 300 })}
                        className={`${inputClass} w-16`}
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        type="number"
                        value={merged.displayOrder}
                        onChange={(ev) => updateLocal(surface.id, { displayOrder: parseInt(ev.target.value) || 0 })}
                        className={`${inputClass} w-14`}
                      />
                    </td>
                    <td className="px-2 py-2">
                      <button
                        type="button"
                        onClick={() => updateLocal(surface.id, { active: !merged.active })}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                          merged.active ? 'bg-primary' : 'bg-border'
                        }`}
                      >
                        <span
                          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                            merged.active ? 'translate-x-4.5' : 'translate-x-0.5'
                          }`}
                        />
                      </button>
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => saveSurface(surface)}
                          disabled={!dirty || savingId === surface.id}
                          className="p-1 text-muted-foreground hover:text-primary transition-colors disabled:opacity-30"
                          title="Save changes"
                        >
                          <span className="material-icons text-base">
                            {savingId === surface.id ? 'refresh' : 'save'}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteSurface(surface.id)}
                          disabled={savingId === surface.id}
                          className="p-1 text-muted-foreground hover:text-red-600 transition-colors"
                          title="Delete"
                        >
                          <span className="material-icons text-base">delete</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Add new surface */}
      {showAdd ? (
        <div className="border border-border rounded-lg p-4 bg-muted/10 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <span className="material-icons text-base text-muted-foreground">add_circle</span>
              New surface
            </h3>
            <button
              type="button"
              onClick={() => {
                setShowAdd(false);
                setDraft(DEFAULT_DRAFT);
              }}
              className="p-1 hover:bg-muted rounded transition-colors"
            >
              <span className="material-icons text-base text-muted-foreground">close</span>
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground">Name</label>
              <input
                value={draft.name}
                onChange={(ev) => {
                  const name = ev.target.value;
                  setDraft((d) => ({
                    ...d,
                    name,
                    slug: d.slugTouched ? d.slug : slugify(name),
                  }));
                }}
                placeholder="Front"
                className={inputClass}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground">Slug</label>
              <input
                value={draft.slug}
                onChange={(ev) =>
                  setDraft((d) => ({ ...d, slug: slugify(ev.target.value), slugTouched: true }))
                }
                placeholder="front"
                className={`${inputClass} font-mono`}
              />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground">Mockup image</label>
            <div className="flex items-start gap-3">
              {draft.mockupImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={draft.mockupImage}
                  alt="Mockup preview"
                  className="w-16 h-16 object-cover rounded border border-border"
                />
              ) : (
                <div className="w-16 h-16 rounded border border-dashed border-border flex items-center justify-center">
                  <span className="material-icons text-muted-foreground/40">image</span>
                </div>
              )}
              <div className="flex-1">
                <MediaPicker
                  value={draft.mockupImage}
                  onChange={(url) => setDraft((d) => ({ ...d, mockupImage: url }))}
                  mimeTypeFilter="image"
                  label={draft.mockupImage ? 'Replace mockup' : 'Pick mockup'}
                  apiEndpoint={mediaEndpoint}
                />
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground">Canvas W</label>
              <input
                type="number"
                value={draft.canvasWidth}
                onChange={(ev) => setDraft((d) => ({ ...d, canvasWidth: parseInt(ev.target.value) || 0 }))}
                className={inputClass}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground">Canvas H</label>
              <input
                type="number"
                value={draft.canvasHeight}
                onChange={(ev) => setDraft((d) => ({ ...d, canvasHeight: parseInt(ev.target.value) || 0 }))}
                className={inputClass}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground">DPI</label>
              <input
                type="number"
                value={draft.printDpi}
                onChange={(ev) => setDraft((d) => ({ ...d, printDpi: parseInt(ev.target.value) || 300 }))}
                className={inputClass}
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground">Order</label>
              <input
                type="number"
                value={draft.displayOrder}
                onChange={(ev) => setDraft((d) => ({ ...d, displayOrder: parseInt(ev.target.value) || 0 }))}
                className={inputClass}
              />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground">Print area (px on mockup)</label>
            <div className="grid grid-cols-4 gap-2">
              <input
                type="number"
                value={draft.printAreaX}
                onChange={(ev) => setDraft((d) => ({ ...d, printAreaX: parseInt(ev.target.value) || 0 }))}
                placeholder="X"
                className={inputClass}
              />
              <input
                type="number"
                value={draft.printAreaY}
                onChange={(ev) => setDraft((d) => ({ ...d, printAreaY: parseInt(ev.target.value) || 0 }))}
                placeholder="Y"
                className={inputClass}
              />
              <input
                type="number"
                value={draft.printAreaWidth}
                onChange={(ev) => setDraft((d) => ({ ...d, printAreaWidth: parseInt(ev.target.value) || 0 }))}
                placeholder="W"
                className={inputClass}
              />
              <input
                type="number"
                value={draft.printAreaHeight}
                onChange={(ev) => setDraft((d) => ({ ...d, printAreaHeight: parseInt(ev.target.value) || 0 }))}
                placeholder="H"
                className={inputClass}
              />
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => {
                setShowAdd(false);
                setDraft(DEFAULT_DRAFT);
              }}
              className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={createSurface}
              disabled={creating}
              className="flex items-center gap-1 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {creating && <span className="material-icons text-sm animate-spin">refresh</span>}
              {creating ? 'Creating…' : 'Create surface'}
            </button>
          </div>
        </div>
      ) : (
        surfaces.length > 0 && (
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-primary hover:bg-accent rounded-lg transition-colors"
          >
            <span className="material-icons text-sm">add</span>
            Add surface
          </button>
        )
      )}
    </div>
  );
}
