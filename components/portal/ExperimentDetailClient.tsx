'use client';

// Experiment detail/edit/results UI for /portal/experiments/:id.
//
// Three panes:
//   1. Header — name, status toggle, hypothesis.
//   2. Variants — split + per-variant block-tree JSON editor.
//   3. Goal config — metric picker + selector input.
//   4. Results — view/goal counts + z-test output for each challenger.
//
// JSON variant editor is intentionally minimal — visual editor for variants
// is a future step. We validate the JSON parses on save.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface ExperimentRow {
  id: number;
  /** Polymorphic target. */
  targetType: 'post' | 'deck' | 'survey' | 'email';
  targetId: number;
  /** Legacy mirror — populated for posts, null for decks/surveys/emails. */
  postId: number | null;
  name: string;
  hypothesis: string | null;
  status: string;
  variantSplit: Record<string, number>;
  goalMetric: string;
  goalSelector: string | null;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface VariantRow {
  id: number;
  experimentId: number;
  key: string;
  label: string;
  blockTreeOverride: unknown;
  createdAt: string;
}

interface ResultsResponse {
  experiment: ExperimentRow;
  stats: Array<{ key: string; label: string; views: number; goals: number; conversionRate: number }>;
  comparisons: Array<{ variantKey: string; controlKey: string; z: number; p: number; lift: number; significant: boolean }>;
}

interface Props {
  experiment: ExperimentRow;
  variants: VariantRow[];
  /** Resolved target payload — works for both posts and decks. */
  target: {
    id: number;
    title: string;
    /** Seed JSON shown in the "Seed from page" button. Block tree for posts,
     *  slide array for decks. */
    content: string;
    /** Site id when the target is a post; 0 for decks. */
    siteId: number;
    /** Where to send the user to edit the canonical entity. */
    editHref: string;
    /** Human label for the target kind ("Page", "Pitch deck"). */
    kindLabel: string;
  };
  siteName: string | null;
}

// v1 heuristic: a p-value alone is not enough — require at least this many
// visitors per arm before we promote a "significant" comparison to the green
// check. Below the threshold we render an hourglass instead so users don't
// chase noisy early reads. The 100 floor is arbitrary but reasonable for v1.
const MIN_SAMPLE_PER_ARM = 100;

const STATUS_TRANSITIONS: Record<string, string[]> = {
  draft: ['running', 'archived'],
  running: ['completed', 'archived'],
  completed: ['running', 'archived'],
  archived: ['draft'],
};

const STATUS_ICON: Record<string, string> = {
  draft: 'edit',
  running: 'play_circle',
  completed: 'task_alt',
  archived: 'inventory_2',
};

export default function ExperimentDetailClient({ experiment: initial, variants: initialVariants, target, siteName }: Props) {
  const [experiment, setExperiment] = useState<ExperimentRow>(initial);
  const [variants, setVariants] = useState<VariantRow[]>(initialVariants);
  const [results, setResults] = useState<ResultsResponse | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [draftSplit, setDraftSplit] = useState<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    for (const k of Object.keys(initial.variantSplit ?? {})) out[k] = String(initial.variantSplit[k]);
    return out;
  });
  const router = useRouter();

  // Editable JSON per variant key — keep as string so partial typing doesn't
  // throw away work in progress.
  const [variantJson, setVariantJson] = useState<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    for (const v of initialVariants) {
      out[v.key] = v.blockTreeOverride
        ? JSON.stringify(v.blockTreeOverride, null, 2)
        : '';
    }
    return out;
  });

  const fetchResults = async () => {
    try {
      const res = await fetch(`/api/portal/experiments/${experiment.id}/results`);
      const json = await res.json();
      if (json.success) setResults(json.data);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    void fetchResults();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [experiment.id]);

  const updateExperiment = async (patch: Partial<ExperimentRow> & { variantSplit?: Record<string, number> }) => {
    setSavingId('experiment');
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/portal/experiments/${experiment.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'update_failed');
      setExperiment(prev => ({ ...prev, ...json.data, startedAt: json.data.startedAt?.toString?.() ?? prev.startedAt, endedAt: json.data.endedAt?.toString?.() ?? prev.endedAt }));
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSavingId(null);
    }
  };

  const saveVariant = async (variantKey: string) => {
    setSavingId(`variant-${variantKey}`);
    setErrorMsg(null);
    const raw = variantJson[variantKey] ?? '';
    let parsed: unknown = null;
    if (raw.trim()) {
      try {
        parsed = JSON.parse(raw);
      } catch {
        setErrorMsg(`Invalid JSON in variant "${variantKey}"`);
        setSavingId(null);
        return;
      }
    }
    try {
      const res = await fetch(`/api/portal/experiments/${experiment.id}/variants`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: variantKey, blockTreeOverride: parsed }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'update_failed');
      setVariants(prev => prev.map(v => v.key === variantKey ? { ...v, blockTreeOverride: parsed } : v));
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSavingId(null);
    }
  };

  const seedFromPost = (variantKey: string) => {
    setVariantJson(prev => ({ ...prev, [variantKey]: JSON.stringify(safeParse(target.content), null, 2) }));
  };

  const transitionStatus = async (next: string) => {
    await updateExperiment({ status: next });
  };

  const saveSplit = async () => {
    const numericSplit: Record<string, number> = {};
    for (const [k, v] of Object.entries(draftSplit)) {
      const n = parseFloat(v);
      if (Number.isFinite(n) && n > 0) numericSplit[k] = n;
    }
    if (Object.keys(numericSplit).length === 0) {
      setErrorMsg('Split must include at least one positive weight');
      return;
    }
    await updateExperiment({ variantSplit: numericSplit });
  };

  const splitTotal = useMemo(() => {
    let total = 0;
    for (const k of Object.keys(experiment.variantSplit ?? {})) total += experiment.variantSplit[k] ?? 0;
    return total;
  }, [experiment.variantSplit]);

  const allowedTransitions = STATUS_TRANSITIONS[experiment.status] || [];

  const onDelete = async () => {
    if (!confirm('Delete this experiment? Events and assignments will be removed.')) return;
    const res = await fetch(`/api/portal/experiments/${experiment.id}`, { method: 'DELETE' });
    const json = await res.json();
    if (json.success) router.push('/portal/experiments');
  };

  return (
    <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link href="/portal/experiments" className="hover:underline">Experiments</Link>
        <span className="material-icons text-base">chevron_right</span>
        <span className="text-gray-900">{experiment.name}</span>
      </div>

      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <span className="material-icons">science</span>
            {experiment.name}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {target.kindLabel}:{' '}
            <Link href={target.editHref} className="text-blue-600 hover:underline">
              {target.title}
            </Link>
            {siteName ? <span className="ml-1 text-gray-400">· {siteName}</span> : null}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-gray-100 text-gray-700">
            <span className="material-icons text-base">{STATUS_ICON[experiment.status] || 'help'}</span>
            {experiment.status}
          </span>
          {allowedTransitions.map(t => (
            <button
              key={t}
              onClick={() => transitionStatus(t)}
              disabled={savingId === 'experiment'}
              className="text-xs px-3 py-1 rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
            >
              {t === 'running' ? 'Start' : t === 'completed' ? 'Stop' : t === 'archived' ? 'Archive' : t === 'draft' ? 'Reopen' : t}
            </button>
          ))}
          <button
            onClick={onDelete}
            className="text-xs px-3 py-1 rounded border border-red-300 text-red-600 hover:bg-red-50"
          >
            Delete
          </button>
        </div>
      </header>

      {errorMsg ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{errorMsg}</div>
      ) : null}

      <section className="rounded-lg border border-gray-200 bg-white p-6 space-y-3">
        <h2 className="text-sm font-semibold uppercase text-gray-500 tracking-wide">Hypothesis</h2>
        <textarea
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
          rows={3}
          defaultValue={experiment.hypothesis ?? ''}
          onBlur={e => {
            if (e.target.value !== (experiment.hypothesis ?? '')) updateExperiment({ hypothesis: e.target.value });
          }}
          placeholder="What do you expect this test to prove? e.g. 'Reframing the hero CTA from value-first to action-first will lift signups by 10%.'"
        />
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase text-gray-500 tracking-wide">Goal</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="text-sm">
            <span className="block text-gray-700 mb-1">Metric</span>
            <select
              className="w-full border border-gray-300 rounded-md px-3 py-2"
              value={experiment.goalMetric}
              onChange={e => updateExperiment({ goalMetric: e.target.value })}
            >
              <option value="page_view">Page view</option>
              <option value="cta_click">CTA click</option>
              <option value="form_submit">Form submit</option>
            </select>
          </label>
          <label className="text-sm">
            <span className="block text-gray-700 mb-1">Selector / target</span>
            <input
              type="text"
              className="w-full border border-gray-300 rounded-md px-3 py-2 font-mono"
              defaultValue={experiment.goalSelector ?? ''}
              onBlur={e => {
                if (e.target.value !== (experiment.goalSelector ?? '')) updateExperiment({ goalSelector: e.target.value || null });
              }}
              placeholder=".cta-primary, button[type=submit], …"
            />
          </label>
        </div>
        <p className="text-xs text-gray-500">
          For <code>page_view</code>, the goal fires automatically on render. For clicks/submits, set a CSS selector matching the target element.
        </p>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase text-gray-500 tracking-wide">Traffic split</h2>
          <span className="text-xs text-gray-500">total: {splitTotal}%</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {Object.keys(experiment.variantSplit ?? {}).map(k => (
            <label key={k} className="text-sm flex items-center gap-2">
              <span className="font-mono text-gray-700">{k}</span>
              <input
                type="number"
                min={0}
                max={100}
                className="w-24 border border-gray-300 rounded-md px-2 py-1"
                value={draftSplit[k] ?? ''}
                onChange={e => setDraftSplit(prev => ({ ...prev, [k]: e.target.value }))}
              />
              <span className="text-gray-400">%</span>
            </label>
          ))}
        </div>
        <button
          onClick={saveSplit}
          disabled={savingId === 'experiment'}
          className="text-sm px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
        >
          Save split
        </button>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase text-gray-500 tracking-wide">Variants</h2>
          <span className="text-xs text-gray-500">JSON view — visual editor for variants ships in v2</span>
        </div>
        <div className="space-y-4">
          {variants.map(v => (
            <div key={v.id} className="border border-gray-200 rounded-md p-4">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <span className="font-mono text-sm">{v.key}</span>
                  <span className="ml-2 text-sm text-gray-700">{v.label}</span>
                  {v.key === 'a' ? <span className="ml-2 text-xs text-gray-400">(control)</span> : null}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="text-xs px-2 py-1 rounded border border-gray-300 hover:bg-gray-50"
                    onClick={() => seedFromPost(v.key)}
                  >
                    Seed from {target.kindLabel.toLowerCase()}
                  </button>
                  <button
                    type="button"
                    className="text-xs px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                    disabled={savingId === `variant-${v.key}`}
                    onClick={() => saveVariant(v.key)}
                  >
                    {savingId === `variant-${v.key}` ? 'Saving…' : 'Save'}
                  </button>
                </div>
              </div>
              <textarea
                className="w-full font-mono text-xs border border-gray-200 rounded-md px-3 py-2 bg-gray-50"
                rows={10}
                value={variantJson[v.key] ?? ''}
                onChange={e => setVariantJson(prev => ({ ...prev, [v.key]: e.target.value }))}
                placeholder={v.key === 'a' ? 'Leave blank to use the live page content.' : 'Paste the variant block tree JSON here.'}
              />
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase text-gray-500 tracking-wide">Results</h2>
          <button
            onClick={fetchResults}
            className="text-xs px-3 py-1 rounded border border-gray-300 hover:bg-gray-50"
          >
            <span className="material-icons text-base align-middle">refresh</span> Refresh
          </button>
        </div>
        {!results ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : (
          <div className="space-y-3">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-gray-500">
                <tr>
                  <th className="text-left py-2">Variant</th>
                  <th className="text-right py-2">Views</th>
                  <th className="text-right py-2">Goals</th>
                  <th className="text-right py-2">Conv.</th>
                </tr>
              </thead>
              <tbody>
                {results.stats.map(s => (
                  <tr key={s.key} className="border-t border-gray-100">
                    <td className="py-2"><span className="font-mono">{s.key}</span> · {s.label}</td>
                    <td className="py-2 text-right">{s.views}</td>
                    <td className="py-2 text-right">{s.goals}</td>
                    <td className="py-2 text-right">{(s.conversionRate * 100).toFixed(2)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {results.comparisons.length > 0 ? (
              <div>
                <h3 className="text-xs uppercase text-gray-500 mt-4 mb-2">Significance vs control</h3>
                <table className="w-full text-sm">
                  <thead className="text-xs uppercase text-gray-500">
                    <tr>
                      <th className="text-left py-2">Variant</th>
                      <th className="text-right py-2">Lift</th>
                      <th className="text-right py-2">z</th>
                      <th className="text-right py-2">p</th>
                      <th className="text-right py-2">Sig.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.comparisons.map(c => {
                      // Server flags significant on `p < 0.05` alone. Layer
                      // a sample-size guard on top: both arms need at least
                      // MIN_SAMPLE_PER_ARM views before we trust the call.
                      const controlViews = results.stats.find(s => s.key === c.controlKey)?.views ?? 0;
                      const variantViews = results.stats.find(s => s.key === c.variantKey)?.views ?? 0;
                      const minViews = Math.min(controlViews, variantViews);
                      const enoughData = minViews >= MIN_SAMPLE_PER_ARM;
                      const showSignificant = c.significant && enoughData;
                      const tooSmall = c.significant && !enoughData;
                      const icon = showSignificant
                        ? 'check_circle'
                        : tooSmall
                          ? 'hourglass_top'
                          : 'remove_circle_outline';
                      const colorClass = showSignificant
                        ? 'text-green-600'
                        : tooSmall
                          ? 'text-amber-500'
                          : 'text-gray-300';
                      const title = tooSmall
                        ? `Not enough data — need at least ${MIN_SAMPLE_PER_ARM} visitors per arm`
                        : undefined;
                      return (
                        <tr key={c.variantKey} className="border-t border-gray-100">
                          <td className="py-2 font-mono">{c.variantKey} vs {c.controlKey}</td>
                          <td className="py-2 text-right">{(c.lift * 100).toFixed(2)}%</td>
                          <td className="py-2 text-right">{c.z.toFixed(3)}</td>
                          <td className="py-2 text-right">{c.p.toFixed(4)}</td>
                          <td className="py-2 text-right">
                            <span className={`material-icons text-base ${colorClass}`} title={title}>
                              {icon}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
        )}
      </section>
    </div>
  );
}

function safeParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return { blocks: [], version: '1.0' };
  }
}
