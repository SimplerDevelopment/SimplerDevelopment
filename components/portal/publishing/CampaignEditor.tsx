'use client';

// Publishing Command Center — create / edit modal for a single campaign.
//
// Opens in two modes:
//   - campaign={existing row} → PATCH on save (existing slug is preserved).
//   - campaign=null            → POST on save (slug auto-derived from name).

import { useState, useEffect, useCallback } from 'react';
import type { CampaignRow } from './PublishingCampaignsList';

interface CampaignFormState {
  name: string;
  slug: string;
  description: string;
  color: string;
  startDate: string;
  endDate: string;
  status: 'active' | 'completed' | 'archived';
}

interface Props {
  /** null = create mode. */
  campaign: CampaignRow | null;
  onSaved: () => void | Promise<void>;
  onCancel: () => void;
}

const STATUSES: CampaignFormState['status'][] = ['active', 'completed', 'archived'];

function slugifyClient(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
}

function isoToDateInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  // <input type="date"> wants YYYY-MM-DD in the user's local timezone.
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export default function CampaignEditor({ campaign, onSaved, onCancel }: Props) {
  const isEdit = campaign != null;
  const [form, setForm] = useState<CampaignFormState>({
    name: campaign?.name ?? '',
    slug: campaign?.slug ?? '',
    description: campaign?.description ?? '',
    color: campaign?.color ?? '#6366f1',
    startDate: isoToDateInput(campaign?.startDate ?? null),
    endDate: isoToDateInput(campaign?.endDate ?? null),
    status: ((campaign?.status ?? 'active') as CampaignFormState['status']),
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Only auto-update slug in create mode while the user hasn't manually
  // edited it. Track this with a flag so once the user types in the slug
  // field we stop derivation.
  const [slugTouched, setSlugTouched] = useState(isEdit);

  useEffect(() => {
    if (!slugTouched && !isEdit) {
      setForm((f) => ({ ...f, slug: slugifyClient(f.name) }));
    }
  }, [form.name, slugTouched, isEdit]);

  const onSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);
      setSaving(true);
      try {
        const payload: Record<string, unknown> = {
          name: form.name,
          slug: form.slug || undefined,
          description: form.description || null,
          color: form.color,
          startDate: form.startDate ? new Date(form.startDate).toISOString() : null,
          endDate: form.endDate ? new Date(form.endDate).toISOString() : null,
          status: form.status,
        };
        const url = isEdit
          ? `/api/portal/publishing/campaigns/${campaign!.id}`
          : '/api/portal/publishing/campaigns';
        const method = isEdit ? 'PATCH' : 'POST';
        const r = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const json = await r.json();
        if (!r.ok || !json.success) {
          throw new Error(json.message || `${method} failed`);
        }
        await onSaved();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Save failed');
      } finally {
        setSaving(false);
      }
    },
    [form, isEdit, campaign, onSaved],
  );

  return (
    <div
      role="dialog"
      aria-modal
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onCancel}
    >
      <form
        className="w-full max-w-lg rounded-lg bg-white dark:bg-gray-900 p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        onSubmit={onSubmit}
      >
        <h3 className="text-lg font-semibold mb-3">
          {isEdit ? 'Edit campaign' : 'New campaign'}
        </h3>

        {error && (
          <div className="mb-3 rounded border border-red-300 bg-red-50 p-2 text-xs text-red-700 dark:border-red-700 dark:bg-red-950/30 dark:text-red-300">
            {error}
          </div>
        )}

        <Field label="Name" required>
          <input
            type="text"
            required
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="w-full rounded border border-gray-300 dark:border-gray-700 dark:bg-gray-800 px-2 py-1.5 text-sm"
            placeholder="Fall 2026 outbound"
          />
        </Field>

        <Field label="Slug" hint="Used internally; auto-generated from name.">
          <input
            type="text"
            value={form.slug}
            onChange={(e) => {
              setSlugTouched(true);
              setForm({ ...form, slug: slugifyClient(e.target.value) });
            }}
            className="w-full rounded border border-gray-300 dark:border-gray-700 dark:bg-gray-800 px-2 py-1.5 text-sm font-mono text-xs"
            placeholder="fall-2026-outbound"
          />
        </Field>

        <Field label="Description">
          <textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={2}
            className="w-full rounded border border-gray-300 dark:border-gray-700 dark:bg-gray-800 px-2 py-1.5 text-sm"
            placeholder="Optional context for the team."
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Color">
            <input
              type="color"
              value={form.color}
              onChange={(e) => setForm({ ...form, color: e.target.value })}
              className="h-9 w-full rounded border border-gray-300 dark:border-gray-700"
            />
          </Field>
          <Field label="Status">
            <select
              value={form.status}
              onChange={(e) =>
                setForm({ ...form, status: e.target.value as CampaignFormState['status'] })
              }
              className="w-full rounded border border-gray-300 dark:border-gray-700 dark:bg-gray-800 px-2 py-1.5 text-sm"
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Start date">
            <input
              type="date"
              value={form.startDate}
              onChange={(e) => setForm({ ...form, startDate: e.target.value })}
              className="w-full rounded border border-gray-300 dark:border-gray-700 dark:bg-gray-800 px-2 py-1.5 text-sm"
            />
          </Field>
          <Field label="End date">
            <input
              type="date"
              value={form.endDate}
              onChange={(e) => setForm({ ...form, endDate: e.target.value })}
              className="w-full rounded border border-gray-300 dark:border-gray-700 dark:bg-gray-800 px-2 py-1.5 text-sm"
            />
          </Field>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded border border-gray-300 dark:border-gray-700 px-3 py-1.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || !form.name.trim()}
            className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create campaign'}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-3">
      <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">
        {label}
        {required && <span className="text-red-600"> *</span>}
      </label>
      {children}
      {hint && <p className="mt-0.5 text-[11px] text-gray-500">{hint}</p>}
    </div>
  );
}
