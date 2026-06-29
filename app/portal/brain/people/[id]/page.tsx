'use client';

/**
 * Brain People — profile page.
 *
 * Loads the full person bundle (`person` + `manager` + `directReports` +
 * `orgUnits` + `expertise`) from `GET /api/portal/brain/people/<id>` and
 * renders it as a two-column layout:
 *
 *   [ header strip — avatar, name, status, manager link, edit/delete ]
 *   [ left: Profile · Expertise · Org membership · Direct reports     ]
 *   [ right: <PersonProfileSidebar /> — linked tasks/initiatives/etc.]
 *
 * Edit is inline-toggle for the simple text fields (full name, title, email,
 * status, notes); managerId / userId / org-membership changes live on a
 * dedicated edit page (`./edit`). Delete is a confirm-and-redirect modal.
 */

import { use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PersonProfileSidebar } from '@/components/brain/PersonProfileSidebar';
import { ExpertiseEditor, type ExpertiseChip } from '@/components/brain/ExpertiseEditor';
import type {
  BrainPerson,
  PersonOrgUnitSummary,
  PersonRelationSummary,
} from '@/lib/brain/people';
import type { BrainPersonStatus } from '@/lib/db/schema/brain';
import { PortalPageHeader } from '@/components/portal/PortalPageHeader';
import {
  pBtnPrimary,
  pBtnGhost,
  pCard,
  pInput,
  pSectionTitle,
} from '@/components/portal/portal-ui';

interface PersonBundle {
  person: BrainPerson;
  manager: PersonRelationSummary | null;
  directReports: PersonRelationSummary[];
  orgUnits: PersonOrgUnitSummary[];
  expertise: ExpertiseChip[];
}

const STATUS_TONE: Record<BrainPersonStatus, string> = {
  active:   'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  inactive: 'bg-muted text-muted-foreground',
  departed: 'bg-rose-500/10 text-rose-700 dark:text-rose-300',
};

const STATUS_OPTIONS: { value: BrainPersonStatus; label: string }[] = [
  { value: 'active',   label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'departed', label: 'Departed' },
];

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('') || '?';
}

function fmtDate(value: string | Date | null | undefined): string | null {
  if (!value) return null;
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function BrainPersonProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const personId = parseInt(id, 10);
  const router = useRouter();

  const [bundle, setBundle] = useState<PersonBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Form state — only used while `editing` is true.
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formTitle, setFormTitle] = useState('');
  const [formStatus, setFormStatus] = useState<BrainPersonStatus>('active');
  const [formNotes, setFormNotes] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/portal/brain/people/${personId}`);
      const json = await r.json();
      if (!r.ok || !json.success) {
        setError(json.message || 'Failed to load person.');
        return;
      }
      setBundle(json.data as PersonBundle);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }, [personId]);

  // Kick off the initial fetch (and any re-fetch when `load` changes) via an
  // async IIFE so the effect body never mutates state synchronously
  // (react-hooks/set-state-in-effect).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!cancelled) await load();
    })();
    return () => { cancelled = true; };
  }, [load]);

  const startEdit = useCallback(() => {
    if (!bundle) return;
    setFormName(bundle.person.fullName);
    setFormEmail(bundle.person.email ?? '');
    setFormTitle(bundle.person.title ?? '');
    setFormStatus(bundle.person.status);
    setFormNotes(bundle.person.notes ?? '');
    setEditing(true);
  }, [bundle]);

  const saveEdit = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      const r = await fetch(`/api/portal/brain/people/${personId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: formName.trim(),
          email: formEmail.trim() || null,
          title: formTitle.trim() || null,
          status: formStatus,
          notes: formNotes.trim() || null,
        }),
      });
      const json = await r.json();
      if (!r.ok || !json.success) {
        setError(json.message || 'Could not save changes.');
        return;
      }
      setEditing(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setSaving(false);
    }
  }, [personId, formName, formEmail, formTitle, formStatus, formNotes, load]);

  const doDelete = useCallback(async () => {
    setDeleting(true);
    try {
      const r = await fetch(`/api/portal/brain/people/${personId}`, { method: 'DELETE' });
      const json = await r.json();
      if (!r.ok || !json.success) {
        setError(json.message || 'Could not delete person.');
        setDeleting(false);
        return;
      }
      router.push('/portal/brain/people');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
      setDeleting(false);
    }
  }, [personId, router]);

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto py-12 flex items-center justify-center text-muted-foreground text-sm">
        <span className="material-icons animate-spin mr-2">progress_activity</span>
        Loading…
      </div>
    );
  }

  if (error && !bundle) {
    return (
      <div className="max-w-3xl mx-auto py-8 px-4">
        <Link
          href="/portal/brain/people"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-4"
        >
          <span className="material-icons text-sm">chevron_left</span>
          Back to People
        </Link>
        <div className="bg-destructive/10 border border-destructive/30 rounded-2xl p-4 text-sm text-destructive">
          <div className="flex items-center gap-2 font-medium mb-1">
            <span className="material-icons text-base">error_outline</span>
            Couldn&apos;t load person
          </div>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  if (!bundle) return null;

  const { person, manager, directReports, orgUnits, expertise } = bundle;
  const primaryUnit = orgUnits.find((u) => u.primary);
  const profileUrls = Array.isArray(person.profileUrls) ? person.profileUrls : [];

  return (
    <div className="max-w-5xl mx-auto py-8 space-y-6">
      <Link
        href="/portal/brain/people"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <span className="material-icons text-sm">chevron_left</span>
        Back to People
      </Link>

      <PortalPageHeader
        eyebrow="Company Brain"
        title={
          <span className="flex items-center gap-3">
            <span className="shrink-0 w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center text-base font-bold">
              {initialsOf(person.fullName)}
            </span>
            <span className="flex items-center gap-2 flex-wrap">
              {person.fullName}
              <span className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded-lg font-semibold ${STATUS_TONE[person.status]}`}>
                {person.status}
              </span>
            </span>
          </span>
        }
        subtitle={
          <span className="flex items-center gap-3 flex-wrap text-[14.5px]">
            {person.title && <span>{person.title}</span>}
            {primaryUnit && (
              <span className="inline-flex items-center gap-1">
                <span className="material-icons text-[14px]">account_tree</span>
                {primaryUnit.name}
              </span>
            )}
            {manager && (
              <Link
                href={`/portal/brain/people/${manager.id}`}
                className="inline-flex items-center gap-1 hover:underline"
              >
                <span className="material-icons text-[14px]">supervisor_account</span>
                Reports to {manager.fullName}
              </Link>
            )}
            {person.email && (
              <a href={`mailto:${person.email}`} className="inline-flex items-center gap-1 hover:underline">
                <span className="material-icons text-[14px]">mail</span>
                {person.email}
              </a>
            )}
          </span>
        }
        actions={
          !editing ? (
            <>
              <button
                type="button"
                onClick={startEdit}
                className={pBtnGhost}
              >
                <span className="material-icons text-base">edit</span>
                Edit
              </button>
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-rose-500/30 bg-card px-4 py-2.5 text-sm font-semibold text-rose-600 dark:text-rose-400 transition hover:border-rose-500/50 hover:bg-rose-500/5"
              >
                <span className="material-icons text-base">delete</span>
                Delete
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setEditing(false)}
                disabled={saving}
                className={pBtnGhost}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveEdit}
                disabled={saving || !formName.trim()}
                className={pBtnPrimary}
              >
                {saving ? (
                  <>
                    <span className="material-icons animate-spin text-base">progress_activity</span>
                    Saving…
                  </>
                ) : (
                  <>
                    <span className="material-icons text-base">check</span>
                    Save
                  </>
                )}
              </button>
            </>
          )
        }
      />

      {error && bundle && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-2xl p-3 text-sm text-destructive flex items-center gap-2">
          <span className="material-icons text-base">error_outline</span>
          {error}
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Profile */}
          <section className={`${pCard} p-5`}>
            <h2 className={`${pSectionTitle} mb-4 flex items-center gap-1.5`}>
              <span className="material-icons text-base text-primary">badge</span>
              Profile
            </h2>
            {editing ? (
              <div className="space-y-4">
                <FormRow label="Full name">
                  <input
                    type="text"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className={pInput}
                  />
                </FormRow>
                <FormRow label="Title">
                  <input
                    type="text"
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    className={pInput}
                  />
                </FormRow>
                <FormRow label="Email">
                  <input
                    type="email"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    className={pInput}
                  />
                </FormRow>
                <FormRow label="Status">
                  <select
                    value={formStatus}
                    onChange={(e) => setFormStatus(e.target.value as BrainPersonStatus)}
                    className={pInput}
                  >
                    {STATUS_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </FormRow>
                <FormRow label="Notes">
                  <textarea
                    value={formNotes}
                    onChange={(e) => setFormNotes(e.target.value)}
                    rows={4}
                    className={`${pInput} resize-y`}
                  />
                </FormRow>
              </div>
            ) : (
              <dl className="text-sm space-y-2.5">
                <Detail label="Email">{person.email ?? <Muted />}</Detail>
                <Detail label="Title">{person.title ?? <Muted />}</Detail>
                <Detail label="Start date">{fmtDate(person.startDate) ?? <Muted />}</Detail>
                <Detail label="End date">{fmtDate(person.endDate) ?? <Muted />}</Detail>
                <Detail label="Notes">
                  {person.notes
                    ? <span className="whitespace-pre-wrap">{person.notes}</span>
                    : <Muted />
                  }
                </Detail>
                <Detail label="Profile links">
                  {profileUrls.length === 0 ? (
                    <Muted />
                  ) : (
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {profileUrls.map((row, i) => (
                        <a
                          key={i}
                          href={row.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-muted text-xs font-semibold text-foreground hover:bg-accent transition"
                        >
                          <span className="material-icons text-[13px]">link</span>
                          {row.label || row.url}
                        </a>
                      ))}
                    </div>
                  )}
                </Detail>
              </dl>
            )}
          </section>

          {/* Expertise */}
          <section className={`${pCard} p-5`}>
            <h2 className={`${pSectionTitle} mb-4 flex items-center gap-1.5`}>
              <span className="material-icons text-base text-primary">workspace_premium</span>
              Expertise
            </h2>
            <ExpertiseEditor
              personId={person.id}
              expertise={expertise}
              onChange={(next) => setBundle((b) => (b ? { ...b, expertise: next } : b))}
            />
          </section>

          {/* Org membership */}
          <section className={`${pCard} p-5`}>
            <h2 className={`${pSectionTitle} mb-4 flex items-center gap-1.5`}>
              <span className="material-icons text-base text-primary">account_tree</span>
              Org membership
            </h2>
            {orgUnits.length === 0 ? (
              <p className="text-sm text-muted-foreground">Not assigned to any org units yet.</p>
            ) : (
              <ul className="space-y-2">
                {orgUnits.map((u) => (
                  <li key={u.id} className="flex items-center justify-between gap-2 text-sm">
                    <Link
                      href={`/portal/brain/people?orgUnitId=${u.id}`}
                      className="text-foreground hover:underline truncate"
                    >
                      {u.name}
                    </Link>
                    <div className="flex items-center gap-2 shrink-0">
                      {u.roleInUnit && (
                        <span className="text-xs text-muted-foreground">{u.roleInUnit}</span>
                      )}
                      {u.primary && (
                        <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded-lg font-semibold bg-primary/10 text-primary">
                          Primary
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Reports / Direct reports */}
          <section className={`${pCard} p-5`}>
            <h2 className={`${pSectionTitle} mb-4 flex items-center gap-1.5`}>
              <span className="material-icons text-base text-primary">supervisor_account</span>
              Reporting
            </h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <h3 className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground mb-2">
                  Reports to
                </h3>
                {manager ? (
                  <Link
                    href={`/portal/brain/people/${manager.id}`}
                    className="inline-flex items-center gap-1.5 text-sm text-foreground hover:underline"
                  >
                    <span className="material-icons text-base text-muted-foreground">person</span>
                    {manager.fullName}
                  </Link>
                ) : (
                  <p className="text-sm text-muted-foreground">No manager set.</p>
                )}
              </div>
              <div>
                <h3 className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground mb-2">
                  Direct reports
                </h3>
                {directReports.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No direct reports.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {directReports.map((r) => (
                      <li key={r.id}>
                        <Link
                          href={`/portal/brain/people/${r.id}`}
                          className="inline-flex items-center gap-1.5 text-sm text-foreground hover:underline"
                        >
                          <span className="material-icons text-base text-muted-foreground">person</span>
                          {r.fullName}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </section>
        </div>

        <div className="lg:col-span-1">
          <PersonProfileSidebar
            person={{ id: person.id, userId: person.userId ?? null }}
          />
        </div>
      </div>

      {confirmingDelete && (
        <div
          className="fixed inset-0 z-30 bg-black/40 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className={`${pCard} p-6 max-w-md w-full`}>
            <h3 className="text-base font-bold text-foreground flex items-center gap-1.5">
              <span className="material-icons text-rose-500">warning</span>
              Delete this person?
            </h3>
            <p className="text-sm text-muted-foreground mt-2">
              <strong className="text-foreground">{person.fullName}</strong> will be removed from your team roster.
              Their org-unit memberships and expertise links will be cleared.
              Direct reports will be unassigned (their <em>reports-to</em> will be cleared).
              This cannot be undone.
            </p>
            <div className="flex items-center justify-end gap-2 mt-5">
              <button
                type="button"
                onClick={() => setConfirmingDelete(false)}
                disabled={deleting}
                className={pBtnGhost}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={doDelete}
                disabled={deleting}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-rose-700 disabled:opacity-50"
              >
                {deleting ? (
                  <>
                    <span className="material-icons animate-spin text-base">progress_activity</span>
                    Deleting…
                  </>
                ) : (
                  <>
                    <span className="material-icons text-base">delete</span>
                    Delete
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FormRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground mb-1.5">{label}</span>
      {children}
    </label>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[8rem_1fr] gap-2 items-baseline">
      <dt className="font-mono text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{label}</dt>
      <dd className="text-sm text-foreground min-w-0">{children}</dd>
    </div>
  );
}

function Muted() {
  return <span className="text-muted-foreground">—</span>;
}
