'use client';

/**
 * Create-initiative page. After the initiative is created we optionally POST
 * any inline goals captured below the main form, then redirect to the new
 * initiative's detail page.
 */

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import InitiativeForm, {
  type InitiativeFormValues,
} from '@/components/brain/InitiativeForm';
import {
  GOAL_STATUSES,
  goalStatusChip,
  type BrainGoalStatus,
} from '@/components/brain/initiatives-shared';

interface TeamMember {
  userId: number;
  name: string | null;
  email: string;
}

interface InlineGoal {
  key: string;
  title: string;
  description: string;
  unit: '' | 'percent' | 'usd_cents' | 'count' | 'boolean';
  targetMetric: string;
  currentMetric: string;
  targetDate: string;
  status: BrainGoalStatus;
}

function emptyGoal(): InlineGoal {
  return {
    key: Math.random().toString(36).slice(2),
    title: '',
    description: '',
    unit: '',
    targetMetric: '',
    currentMetric: '',
    targetDate: '',
    status: 'open',
  };
}

export default function NewInitiativePage() {
  const router = useRouter();
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [goals, setGoals] = useState<InlineGoal[]>([emptyGoal()]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/portal/team')
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        if (json.success && Array.isArray(json.data)) {
          setTeam(
            json.data
              .filter((m: { userId?: number }) => typeof m.userId === 'number')
              .map((m: { userId: number; name: string | null; email: string }) => ({
                userId: m.userId,
                name: m.name,
                email: m.email,
              })),
          );
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const nonEmptyGoals = useMemo(
    () => goals.filter((g) => g.title.trim() !== ''),
    [goals],
  );

  const handleSubmit = async (values: InitiativeFormValues) => {
    setError(null);
    // 1) create initiative.
    const initRes = await fetch('/api/portal/brain/initiatives', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: values.name,
        description: values.description.trim() || null,
        priority: values.priority,
        ownerId: values.ownerId ?? undefined,
        sponsorId: values.sponsorId ?? undefined,
        startDate: values.startDate || undefined,
        targetDate: values.targetDate || undefined,
        confidentialityLevel: values.confidentialityLevel,
      }),
    });
    const initJson = await initRes.json();
    if (!initRes.ok || !initJson.success) {
      throw new Error(initJson.message || 'Failed to create initiative');
    }
    const initiativeId: number = initJson.data.id;

    // 2) create inline goals (best-effort — failures are reported but don't
    //    block the redirect, since the initiative itself is real).
    const goalErrors: string[] = [];
    for (const g of nonEmptyGoals) {
      try {
        const targetMetricNum = g.targetMetric.trim() === '' ? null : Number(g.targetMetric);
        const currentMetricNum = g.currentMetric.trim() === '' ? null : Number(g.currentMetric);
        const r = await fetch('/api/portal/brain/goals', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            initiativeId,
            title: g.title.trim(),
            description: g.description.trim() || undefined,
            unit: g.unit || undefined,
            targetMetric: typeof targetMetricNum === 'number' && Number.isFinite(targetMetricNum) ? targetMetricNum : undefined,
            currentMetric: typeof currentMetricNum === 'number' && Number.isFinite(currentMetricNum) ? currentMetricNum : undefined,
            targetDate: g.targetDate || undefined,
            status: g.status,
          }),
        });
        const j = await r.json();
        if (!r.ok || !j.success) goalErrors.push(`${g.title}: ${j.message ?? 'create failed'}`);
      } catch (e) {
        goalErrors.push(`${g.title}: ${e instanceof Error ? e.message : 'network error'}`);
      }
    }

    // 3) redirect.
    if (goalErrors.length > 0) {
      setError(`Initiative created, but ${goalErrors.length} goal(s) failed: ${goalErrors.join('; ')}`);
      // Still redirect — the user can add goals from the detail page.
      setTimeout(() => router.push(`/portal/brain/initiatives/${initiativeId}`), 1500);
    } else {
      router.push(`/portal/brain/initiatives/${initiativeId}`);
    }
  };

  const updateGoal = (key: string, patch: Partial<InlineGoal>) => {
    setGoals((prev) => prev.map((g) => (g.key === key ? { ...g, ...patch } : g)));
  };

  const addGoal = () => setGoals((prev) => [...prev, emptyGoal()]);
  const removeGoal = (key: string) =>
    setGoals((prev) => (prev.length === 1 ? prev : prev.filter((g) => g.key !== key)));

  return (
    <div className="max-w-3xl mx-auto py-4 space-y-6">
      <div>
        <Link
          href="/portal/brain/initiatives"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <span className="material-icons text-sm">chevron_left</span>
          Initiatives
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-foreground flex items-center gap-2">
          <span className="material-icons text-primary">flag</span>
          New initiative
        </h1>
      </div>

      {error && (
        <div className="bg-amber-100/30 border border-amber-500/30 rounded-md p-3 text-sm text-amber-700 dark:text-amber-300 flex items-center gap-2">
          <span className="material-icons text-base">warning</span>
          {error}
        </div>
      )}

      <section className="bg-card border border-border rounded-xl p-5">
        <h2 className="text-base font-semibold text-foreground mb-3">Initiative details</h2>
        <InitiativeForm
          mode="create"
          team={team}
          onCancel={() => router.push('/portal/brain/initiatives')}
          onSubmit={handleSubmit}
        />
      </section>

      <section className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <h2 className="text-base font-semibold text-foreground inline-flex items-center gap-2">
              <span className="material-icons text-base text-primary">track_changes</span>
              Initial goals
              <span className="text-xs text-muted-foreground font-normal">(optional)</span>
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Leave the title blank to skip a row. You can always add more later.
            </p>
          </div>
          <button
            type="button"
            onClick={addGoal}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-md border border-border text-foreground hover:bg-accent"
          >
            <span className="material-icons text-sm">add</span>
            Add goal
          </button>
        </div>

        <div className="space-y-3">
          {goals.map((g, idx) => (
            <div key={g.key} className="bg-muted/30 border border-border rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Goal #{idx + 1}</span>
                {goals.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeGoal(g.key)}
                    className="p-1 text-muted-foreground hover:text-destructive rounded"
                    aria-label="Remove this goal"
                  >
                    <span className="material-icons text-sm">close</span>
                  </button>
                )}
              </div>
              <input
                type="text"
                value={g.title}
                onChange={(e) => updateGoal(g.key, { title: e.target.value })}
                placeholder="Goal title (e.g. Reduce time-to-onboard by 30%)"
                className="w-full px-2 py-1.5 text-sm rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <textarea
                value={g.description}
                onChange={(e) => updateGoal(g.key, { description: e.target.value })}
                rows={2}
                placeholder="Description (optional)"
                className="w-full px-2 py-1.5 text-sm rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <label className="block">
                  <span className="text-[11px] font-medium text-muted-foreground">Unit</span>
                  <select
                    value={g.unit}
                    onChange={(e) => updateGoal(g.key, { unit: e.target.value as InlineGoal['unit'] })}
                    className="mt-1 w-full px-2 py-1.5 text-sm rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="">none</option>
                    <option value="percent">%</option>
                    <option value="usd_cents">$ (cents)</option>
                    <option value="count">count</option>
                    <option value="boolean">yes/no</option>
                  </select>
                </label>
                <label className="block">
                  <span className="text-[11px] font-medium text-muted-foreground">Target</span>
                  <input
                    type="number"
                    step="any"
                    value={g.targetMetric}
                    onChange={(e) => updateGoal(g.key, { targetMetric: e.target.value })}
                    className="mt-1 w-full px-2 py-1.5 text-sm rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </label>
                <label className="block">
                  <span className="text-[11px] font-medium text-muted-foreground">Current</span>
                  <input
                    type="number"
                    step="any"
                    value={g.currentMetric}
                    onChange={(e) => updateGoal(g.key, { currentMetric: e.target.value })}
                    className="mt-1 w-full px-2 py-1.5 text-sm rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </label>
                <label className="block">
                  <span className="text-[11px] font-medium text-muted-foreground">Target date</span>
                  <input
                    type="date"
                    value={g.targetDate}
                    onChange={(e) => updateGoal(g.key, { targetDate: e.target.value })}
                    className="mt-1 w-full px-2 py-1.5 text-sm rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </label>
              </div>
              <label className="block">
                <span className="text-[11px] font-medium text-muted-foreground">Initial status</span>
                <select
                  value={g.status}
                  onChange={(e) => updateGoal(g.key, { status: e.target.value as BrainGoalStatus })}
                  className="mt-1 w-full px-2 py-1.5 text-sm rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  {GOAL_STATUSES.map((s) => (
                    <option key={s} value={s}>{goalStatusChip(s).label}</option>
                  ))}
                </select>
              </label>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
