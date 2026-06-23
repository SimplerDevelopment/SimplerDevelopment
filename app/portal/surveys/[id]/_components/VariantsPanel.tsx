'use client';

/**
 * VariantsPanel — manage A/B variants for a survey.
 *
 * Each variant has its own field set (a clone of the survey's default fields
 * at creation time, then editable independently), an integer weight (1–10000;
 * the picker renormalizes), and an enabled flag. The public render path
 * deterministically buckets visitors via `sd_visitor` cookie, so a returning
 * visitor always lands in the same variant.
 *
 * Per-variant response counts are surfaced inline so the operator can see
 * conversion at a glance — TODO(stats-deep): the panel still leaves richer
 * funnel analytics (started → completed, time-to-complete, segmentation)
 * to the analytics tab; we only show totals here.
 */

import { useCallback, useEffect, useState } from 'react';
import SurveyBuilder, { type SurveyField } from '@/components/admin/SurveyBuilder';

interface SurveyVariant {
  id: number;
  surveyId: number;
  name: string;
  fields: SurveyField[];
  weight: number;
  enabled: boolean;
  createdAt: string;
}

interface VariantStat {
  variantId: number | null;
  total: number;
  completed: number;
  withEmail: number;
}

interface Props {
  surveyId: string;
}

export default function VariantsPanel({ surveyId }: Props) {
  const [variants, setVariants] = useState<SurveyVariant[]>([]);
  const [stats, setStats] = useState<VariantStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // New-variant form state.
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);

  // Per-variant inline edit panel.
  const [openEditFor, setOpenEditFor] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [variantsRes, statsRes] = await Promise.all([
        fetch(`/api/portal/surveys/${surveyId}/variants`),
        fetch(`/api/portal/surveys/${surveyId}/variants/stats`),
      ]);
      const variantsJson = await variantsRes.json();
      if (!variantsJson.success) throw new Error(variantsJson.message || 'Failed to load variants');
      setVariants(variantsJson.data as SurveyVariant[]);

      // Stats endpoint is best-effort — if it fails we still render the list,
      // just without per-variant counters.
      if (statsRes.ok) {
        const statsJson = await statsRes.json();
        if (statsJson.success) setStats(statsJson.data as VariantStat[]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [surveyId]);

  useEffect(() => { void refresh(); }, [refresh]);

  async function createVariant() {
    if (!newName.trim()) {
      setError('Name is required');
      return;
    }
    setCreating(true);
    setError('');
    try {
      const res = await fetch(`/api/portal/surveys/${surveyId}/variants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim() }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message || 'Failed to create variant');
      setNewName('');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreating(false);
    }
  }

  async function updateVariant(id: number, patch: Partial<SurveyVariant>) {
    setError('');
    try {
      const res = await fetch(`/api/portal/surveys/${surveyId}/variants/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message || 'Failed to update variant');
      // Optimistic merge — the server returns the canonical row so we use it
      // directly rather than re-fetching the whole list on every keystroke.
      setVariants((rows) => rows.map((r) => (r.id === id ? { ...r, ...(json.data as SurveyVariant) } : r)));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function deleteVariant(id: number) {
    if (!confirm('Delete this variant? Existing responses keep their data but lose the variant label.')) return;
    setError('');
    try {
      const res = await fetch(`/api/portal/surveys/${surveyId}/variants/${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!json.success) throw new Error(json.message || 'Failed to delete variant');
      if (openEditFor === id) setOpenEditFor(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  const enabledTotal = variants.filter((v) => v.enabled).reduce((sum, v) => sum + v.weight, 0);

  function statFor(variantId: number): VariantStat | undefined {
    return stats.find((s) => s.variantId === variantId);
  }

  return (
    <div className="space-y-6">
      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-start gap-3 mb-4">
          <span className="material-icons text-primary text-xl mt-0.5">science</span>
          <div className="flex-1">
            <h3 className="font-semibold text-foreground">A/B Variants</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Add multiple field sets and the public renderer will fork visitors deterministically by cookie.
              Each variant has its own field list, weight, and enabled flag. With no enabled variants the
              survey renders its default fields.
            </p>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 text-sm text-red-700 dark:text-red-400 mb-4 flex items-center gap-2">
            <span className="material-icons text-lg">error</span>
            {error}
            <button onClick={() => setError('')} className="ml-auto">
              <span className="material-icons text-lg">close</span>
            </button>
          </div>
        )}

        <div className="flex gap-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Variant name (e.g. Short form, Long form)"
            className="flex-1 px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            onKeyDown={(e) => { if (e.key === 'Enter') void createVariant(); }}
          />
          <button
            onClick={() => void createVariant()}
            disabled={creating || !newName.trim()}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {creating ? (
              <span className="material-icons text-lg animate-spin">progress_activity</span>
            ) : (
              <span className="material-icons text-lg">add</span>
            )}
            Add variant
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10">
          <span className="material-icons text-2xl animate-spin text-primary">progress_activity</span>
        </div>
      ) : variants.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-10 text-center">
          <span className="material-icons text-4xl text-muted-foreground/50">science</span>
          <p className="mt-3 text-sm text-muted-foreground">
            No variants yet. Add one above to start splitting visitors between alternate field sets.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {variants.map((variant) => {
            const stat = statFor(variant.id);
            const sharePct = variant.enabled && enabledTotal > 0
              ? Math.round((variant.weight / enabledTotal) * 100)
              : 0;
            const isOpen = openEditFor === variant.id;

            return (
              <div key={variant.id} className="bg-card border border-border rounded-xl">
                <div className="flex items-center gap-3 p-4">
                  <span
                    className={`material-icons ${variant.enabled ? 'text-green-600' : 'text-muted-foreground/50'}`}
                  >
                    {variant.enabled ? 'toggle_on' : 'toggle_off'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={variant.name}
                        onChange={(e) => {
                          // Optimistic local rename; persist on blur to avoid hammering the API.
                          setVariants((rows) => rows.map((r) => (r.id === variant.id ? { ...r, name: e.target.value } : r)));
                        }}
                        onBlur={() => void updateVariant(variant.id, { name: variant.name })}
                        className="bg-transparent border-none p-0 text-sm font-medium text-foreground focus:outline-none focus:ring-0"
                      />
                      <span className="text-xs text-muted-foreground">
                        {variant.fields?.length ?? 0} fields
                        {stat && ` • ${stat.total} response${stat.total === 1 ? '' : 's'}`}
                      </span>
                    </div>
                    {variant.enabled && enabledTotal > 0 && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        ~{sharePct}% of traffic (weight {variant.weight} of {enabledTotal})
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span>Weight</span>
                      <input
                        type="number"
                        min={1}
                        max={10000}
                        value={variant.weight}
                        onChange={(e) => {
                          const w = parseInt(e.target.value, 10);
                          setVariants((rows) => rows.map((r) => (r.id === variant.id ? { ...r, weight: Number.isFinite(w) ? w : r.weight } : r)));
                        }}
                        onBlur={() => void updateVariant(variant.id, { weight: variant.weight })}
                        className="w-16 px-2 py-1 bg-background border border-border rounded text-sm text-foreground text-right focus:outline-none focus:ring-2 focus:ring-primary/50"
                      />
                    </label>
                    <button
                      onClick={() => void updateVariant(variant.id, { enabled: !variant.enabled })}
                      className="text-xs px-2.5 py-1.5 rounded-md border border-border hover:bg-accent transition-colors"
                    >
                      {variant.enabled ? 'Disable' : 'Enable'}
                    </button>
                    <button
                      onClick={() => setOpenEditFor(isOpen ? null : variant.id)}
                      className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md border border-border hover:bg-accent transition-colors"
                    >
                      <span className="material-icons text-base">{isOpen ? 'expand_less' : 'edit'}</span>
                      {isOpen ? 'Close' : 'Fields'}
                    </button>
                    <button
                      onClick={() => void deleteVariant(variant.id)}
                      className="inline-flex items-center text-xs px-2 py-1.5 rounded-md text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    >
                      <span className="material-icons text-base">delete</span>
                    </button>
                  </div>
                </div>

                {isOpen && (
                  <div className="border-t border-border p-4 bg-muted/30">
                    <SurveyBuilder
                      fields={variant.fields || []}
                      onChange={(next) => {
                        setVariants((rows) => rows.map((r) => (r.id === variant.id ? { ...r, fields: next } : r)));
                      }}
                    />
                    <div className="flex justify-end mt-4">
                      <button
                        onClick={() => void updateVariant(variant.id, { fields: variant.fields })}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
                      >
                        <span className="material-icons text-base">save</span>
                        Save fields
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
