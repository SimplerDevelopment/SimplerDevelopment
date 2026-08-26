'use client';

import { useEffect, useId, useRef, useState } from 'react';
import CrmDuplicateWarning from '@/components/portal/CrmDuplicateWarning';
import CrmCompanyTypeaheadPicker from '@/components/portal/CrmCompanyTypeaheadPicker';
import { pBtnPrimary } from '@/components/portal/portal-ui';
import MediaPicker from '@/components/admin/MediaPicker';

const sourceOptions = ['web', 'referral', 'cold-call', 'event', 'social', 'other'];

// Focus-trap target selector, matching the pattern in
// app/portal/crm/companies/[id]/_components/CompanyEditModal.tsx (PUX-018) —
// there is no shared Modal/Dialog primitive component in the repo, every
// hand-rolled dialog (CompanyEditModal, CrmAddDealModal) repeats this.
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface CrmAddContactModalProps {
  onClose: () => void;
  /** Called after the contact is created. Mirrors CrmAddDealModal — the
   *  modal does not close itself on success; the parent decides what
   *  "created" means (close + refetch its own contacts list). */
  onCreated: () => void;
}

/**
 * Add Contact modal for the CRM contacts list page (OBQA-026 items 1 + 2).
 * Extracted out of app/portal/crm/contacts/page.tsx to keep that file under
 * the repo's file-size budget — same domain/job as CrmAddDealModal, split
 * into its own file only because this modal is exclusive to the contacts
 * list page (see app/portal/crm/contacts/page.tsx for the trigger + list).
 */
export default function CrmAddContactModal({ onClose, onCreated }: CrmAddContactModalProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    linkedinUrl: '',
    title: '',
    companyId: '',
    source: '',
    status: 'lead',
    avatarUrl: '',
  });
  const [formCompanyLabel, setFormCompanyLabel] = useState<string | null>(null);

  // Inline "create new company" panel, revealed under the company picker
  // (OBQA-026 item 2).
  const [showCreateCompany, setShowCreateCompany] = useState(false);
  const [newCompanyName, setNewCompanyName] = useState('');
  const [creatingCompany, setCreatingCompany] = useState(false);
  const [createCompanyError, setCreateCompanyError] = useState('');

  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  // Escape-to-close + focus trap, mirroring CompanyEditModal (PUX-018). The
  // parent only mounts this component while open (matches CrmAddDealModal),
  // so this runs once on mount/unmount only.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const container = dialogRef.current;
    const first = container?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    first?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !container) return;
      const focusable = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
        .filter(el => el.offsetParent !== null);
      if (focusable.length === 0) return;
      const firstEl = focusable[0];
      const lastEl = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previouslyFocused?.focus();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    const body = {
      ...form,
      companyId: form.companyId ? Number(form.companyId) : null,
    };
    const res = await fetch('/api/portal/crm/contacts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const d = await res.json();
    setSaving(false);
    if (!d.success) {
      setError(d.message ?? 'Failed to create contact.');
      return;
    }
    onCreated();
  }

  // POSTs to the same endpoint the companies page's "Add Company" flow uses
  // (app/portal/crm/companies/page.tsx handleSubmit) — only `name` is
  // required server-side, so the inline panel only asks for that.
  async function handleCreateCompany() {
    const name = newCompanyName.trim();
    if (!name) return;
    setCreatingCompany(true);
    setCreateCompanyError('');
    const res = await fetch('/api/portal/crm/companies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    const d = await res.json();
    setCreatingCompany(false);
    if (!d.success) {
      setCreateCompanyError(d.message ?? 'Failed to create company.');
      return;
    }
    setForm(f => ({ ...f, companyId: String(d.data.id) }));
    setFormCompanyLabel(d.data.name);
    setShowCreateCompany(false);
    setNewCompanyName('');
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={e => e.stopPropagation()}
        className="bg-card border border-border rounded-2xl shadow-2xl my-8 w-full max-w-4xl overflow-hidden"
      >
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 id={titleId} className="font-semibold text-foreground">New Contact</h3>
            <button type="button" onClick={onClose} aria-label="Close" className="text-muted-foreground hover:text-foreground">
              <span className="material-icons text-base">close</span>
            </button>
          </div>
          <CrmDuplicateWarning email={form.email} phone={form.phone} firstName={form.firstName} lastName={form.lastName} />
          {error && (
            <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
              <span className="material-icons text-base">error</span>
              {error}
            </div>
          )}
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">First Name *</label>
              <input
                required
                value={form.firstName}
                onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))}
                className="w-full rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/50 focus:border-primary focus:ring-4 focus:ring-primary/15"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Last Name *</label>
              <input
                required
                value={form.lastName}
                onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))}
                className="w-full rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/50 focus:border-primary focus:ring-4 focus:ring-primary/15"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                className="w-full rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/50 focus:border-primary focus:ring-4 focus:ring-primary/15"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Phone</label>
              <input
                value={form.phone}
                onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                className="w-full rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/50 focus:border-primary focus:ring-4 focus:ring-primary/15"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">LinkedIn URL</label>
              <input
                type="url"
                value={form.linkedinUrl}
                onChange={e => setForm(f => ({ ...f, linkedinUrl: e.target.value }))}
                placeholder="https://linkedin.com/in/..."
                className="w-full rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/50 focus:border-primary focus:ring-4 focus:ring-primary/15"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Title</label>
              <input
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                className="w-full rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/50 focus:border-primary focus:ring-4 focus:ring-primary/15"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Company</label>
              <CrmCompanyTypeaheadPicker
                value={form.companyId}
                selectedLabel={formCompanyLabel}
                onChange={opt => {
                  setForm(f => ({ ...f, companyId: opt ? String(opt.id) : '' }));
                  setFormCompanyLabel(opt ? opt.name : null);
                }}
                placeholder="Select company…"
              />
              {!showCreateCompany ? (
                <button
                  type="button"
                  onClick={() => { setShowCreateCompany(true); setCreateCompanyError(''); }}
                  className="mt-1.5 text-xs font-medium text-primary hover:underline"
                >
                  + Create new company…
                </button>
              ) : (
                <div className="mt-2 flex items-start gap-2">
                  <div className="flex-1">
                    <input
                      autoFocus
                      value={newCompanyName}
                      onChange={e => setNewCompanyName(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleCreateCompany();
                        }
                      }}
                      placeholder="New company name"
                      className="w-full rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/50 focus:border-primary focus:ring-4 focus:ring-primary/15"
                    />
                    {createCompanyError && (
                      <p className="mt-1 text-xs text-destructive">{createCompanyError}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={handleCreateCompany}
                    disabled={creatingCompany || !newCompanyName.trim()}
                    className={pBtnPrimary}
                  >
                    {creatingCompany && <span className="material-icons animate-spin text-sm">refresh</span>}
                    Create
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowCreateCompany(false); setNewCompanyName(''); setCreateCompanyError(''); }}
                    aria-label="Cancel create company"
                    className="p-2 text-muted-foreground hover:text-foreground"
                  >
                    <span className="material-icons text-base">close</span>
                  </button>
                </div>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Source</label>
              <select
                value={form.source}
                onChange={e => setForm(f => ({ ...f, source: e.target.value }))}
                className="w-full appearance-none rounded-xl border border-border bg-card px-3.5 py-2.5 pr-10 text-sm text-foreground outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/15"
              >
                <option value="">Select source</option>
                {sourceOptions.map(s => (
                  <option key={s} value={s}>{s.replace('-', ' ')}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Status</label>
              <select
                value={form.status}
                onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                className="w-full appearance-none rounded-xl border border-border bg-card px-3.5 py-2.5 pr-10 text-sm text-foreground outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/15"
              >
                <option value="lead">Lead</option>
                <option value="active">Active</option>
                <option value="customer">Customer</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
            <div className="sm:col-span-2 lg:col-span-1">
              <MediaPicker
                value={form.avatarUrl ?? ''}
                onChange={(url) => setForm(f => ({ ...f, avatarUrl: url }))}
                label="Avatar"
                mimeTypeFilter="image"
              />
            </div>
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className={pBtnPrimary}
            >
              {saving && <span className="material-icons animate-spin text-sm">refresh</span>}
              Create Contact
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
