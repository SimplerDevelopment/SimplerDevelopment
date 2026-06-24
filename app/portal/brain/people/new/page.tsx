'use client';

/**
 * Brain People — create form.
 *
 * Captures every field on `CreatePersonInput`. The manager picker uses the
 * shared `<PersonPicker />` so existing people show up by name. The userId
 * dropdown is populated from `/api/portal/mentionable-users` (active staff
 * + members of the active client). On success we redirect to the new
 * person's profile; org-unit memberships and expertise tags can be added
 * from there.
 */

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PersonPicker } from '@/components/brain/PersonPicker';
import type { BrainPersonStatus } from '@/lib/db/schema/brain';
import { PortalPageHeader } from '@/components/portal/PortalPageHeader';
import { pBtnPrimary, pBtnGhost } from '@/components/portal/portal-ui';

interface MentionableUser {
  id: number;
  name: string | null;
}

const STATUS_OPTIONS: { value: BrainPersonStatus; label: string }[] = [
  { value: 'active',   label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'departed', label: 'Departed' },
];

interface ProfileUrlRow {
  label: string;
  url: string;
}

export default function NewBrainPersonPage() {
  const router = useRouter();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [title, setTitle] = useState('');
  const [status, setStatus] = useState<BrainPersonStatus>('active');
  const [notes, setNotes] = useState('');
  const [userId, setUserId] = useState<number | null>(null);
  const [managerId, setManagerId] = useState<number | null>(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [profileUrls, setProfileUrls] = useState<ProfileUrlRow[]>([]);

  const [users, setUsers] = useState<MentionableUser[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/portal/mentionable-users');
        const json = await r.json();
        if (r.ok && json.success) setUsers((json.data ?? []) as MentionableUser[]);
      } catch {
        // optional — fall back to "no linked user"
      }
    })();
  }, []);

  const canSubmit = useMemo(() => fullName.trim().length > 0 && !submitting, [fullName, submitting]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const cleanedProfileUrls = profileUrls
        .map((row) => ({ label: row.label.trim(), url: row.url.trim() }))
        .filter((row) => row.label && row.url);

      const body: Record<string, unknown> = {
        fullName: fullName.trim(),
        status,
      };
      if (email.trim()) body.email = email.trim();
      if (title.trim()) body.title = title.trim();
      if (notes.trim()) body.notes = notes.trim();
      if (userId !== null) body.userId = userId;
      if (managerId !== null) body.managerId = managerId;
      if (startDate) body.startDate = startDate;
      if (endDate) body.endDate = endDate;
      if (cleanedProfileUrls.length > 0) body.profileUrls = cleanedProfileUrls;

      const r = await fetch('/api/portal/brain/people', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await r.json();
      if (!r.ok || !json.success) {
        setError(json.message || 'Could not create person.');
        return;
      }
      router.push(`/portal/brain/people/${json.data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setSubmitting(false);
    }
  }, [canSubmit, fullName, email, title, status, notes, userId, managerId, startDate, endDate, profileUrls, router]);

  return (
    <div className="max-w-2xl mx-auto py-6 space-y-6">
      <Link
        href="/portal/brain/people"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-4"
      >
        <span className="material-icons text-sm">chevron_left</span>
        Back to People
      </Link>

      <PortalPageHeader
        eyebrow="Company Brain"
        title={<><span className="material-icons text-primary">person_add</span> New person</>}
        subtitle="Add someone to your internal team. You can attach expertise tags and org-unit memberships from the profile after creating."
      />

      <div className="rounded-2xl border border-border bg-card p-5">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Full name" required>
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
            maxLength={200}
            className={inputCls}
            placeholder="Jane Doe"
          />
        </Field>

        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Email">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputCls}
              placeholder="jane@example.com"
            />
          </Field>
          <Field label="Title">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={inputCls}
              placeholder="Director of Engineering"
            />
          </Field>
        </div>

        <Field label="Linked user account" hint="Surfaces this person's open tasks on their profile.">
          <select
            value={userId !== null ? String(userId) : ''}
            onChange={(e) => setUserId(e.target.value ? parseInt(e.target.value, 10) : null)}
            className="w-full appearance-none rounded-xl border border-border bg-card px-3.5 py-2.5 pr-10 text-sm text-foreground outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/15"
          >
            <option value="">— none —</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name ?? `User #${u.id}`}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Reports to (manager)">
          <PersonPicker
            value={managerId}
            onChange={setManagerId}
            placeholder="Search for a manager…"
          />
        </Field>

        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Start date">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className={inputCls}
            />
          </Field>
          <Field label="End date">
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className={inputCls}
            />
          </Field>
        </div>

        <Field label="Status">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as BrainPersonStatus)}
            className="w-full appearance-none rounded-xl border border-border bg-card px-3.5 py-2.5 pr-10 text-sm text-foreground outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/15"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </Field>

        <Field label="Notes" hint="Private context — visible only to your team.">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            className={`${inputCls} resize-y`}
            placeholder="Background, hire details, etc."
          />
        </Field>

        <Field label="Profile links" hint="LinkedIn, GitHub, personal site, etc.">
          <div className="space-y-2">
            {profileUrls.map((row, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="text"
                  value={row.label}
                  onChange={(e) => {
                    const next = [...profileUrls];
                    next[i] = { ...next[i], label: e.target.value };
                    setProfileUrls(next);
                  }}
                  placeholder="Label"
                  className={`${inputCls} flex-1`}
                />
                <input
                  type="url"
                  value={row.url}
                  onChange={(e) => {
                    const next = [...profileUrls];
                    next[i] = { ...next[i], url: e.target.value };
                    setProfileUrls(next);
                  }}
                  placeholder="https://…"
                  className={`${inputCls} flex-[2]`}
                />
                <button
                  type="button"
                  onClick={() => setProfileUrls(profileUrls.filter((_, j) => j !== i))}
                  className="p-1.5 text-muted-foreground hover:text-foreground"
                  aria-label="Remove link"
                >
                  <span className="material-icons text-base">close</span>
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setProfileUrls([...profileUrls, { label: '', url: '' }])}
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <span className="material-icons text-sm">add</span>
              Add link
            </button>
          </div>
        </Field>

        {error && (
          <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-3 text-sm text-destructive flex items-center gap-2">
            <span className="material-icons text-base">error_outline</span>
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
          <Link
            href="/portal/brain/people"
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-semibold text-foreground transition hover:border-foreground/25 hover:shadow-sm disabled:opacity-50"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={!canSubmit}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-foreground px-4 py-2.5 text-sm font-bold text-background transition hover:-translate-y-px hover:shadow-lg hover:shadow-foreground/20 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
          >
            {submitting ? (
              <>
                <span className="material-icons animate-spin text-base">progress_activity</span>
                Creating…
              </>
            ) : (
              <>
                <span className="material-icons text-base">check</span>
                Create person
              </>
            )}
          </button>
        </div>
      </form>
      </div>
    </div>
  );
}

const inputCls =
  'w-full rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/50 focus:border-primary focus:ring-4 focus:ring-primary/15';

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
    <label className="block">
      <span className="text-xs font-medium text-foreground mb-1 flex items-center gap-1">
        {label}
        {required && <span className="text-rose-500">*</span>}
      </span>
      {children}
      {hint && <span className="block text-[11px] text-muted-foreground mt-1">{hint}</span>}
    </label>
  );
}
