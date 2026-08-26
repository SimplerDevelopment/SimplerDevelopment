'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import MediaPicker from '@/components/admin/MediaPicker';
import CrmCompanyTypeaheadPicker from '@/components/portal/CrmCompanyTypeaheadPicker';
import CrmCustomFieldsPanel, { type CrmCustomFieldsPanelHandle } from '@/components/portal/CrmCustomFieldsPanel';
import { pBtnGhost, pBtnPrimary, pInput, pSelect } from '@/components/portal/portal-ui';
import {
  CONTACT_EDIT_TABS,
  CONTACT_SOURCE_OPTIONS,
  CONTACT_STATUS_OPTIONS,
  contactToEditForm,
  isEditFormDirty,
  type ContactEditFormState,
  type ContactEditTabId,
  type EditableContactSource,
} from '../_lib/contactEditForm';

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface ContactEditModalProps {
  contactId: number;
  contact: EditableContactSource;
  onClose: () => void;
  /** Called after the contact + custom fields both save successfully. The modal closes itself. */
  onSaved: () => void | Promise<void>;
}

/**
 * Edit-contact modal (PUX-025), sectioned into tabs. Replaces the inline
 * edit form that used to render directly in the page flow. Mirrors
 * `CompanyEditModal` (PUX-018) so both CRM detail pages share one shape.
 *
 * Owns its own form state and its own `CrmCustomFieldsPanel` instance (in
 * 'edit' mode) — separate from the page-level panel, which stays in 'view'
 * mode at all times now that editing only happens here. The parent mounts
 * this component only while open (matches `CrmAddDealModal` /
 * `CompanyEditModal`), so closing it discards all in-progress state; a
 * dirty edit prompts for confirmation first (same `confirm()` pattern
 * `CrmCustomFieldsPanel` already uses for its own inline edit mode).
 */
export default function ContactEditModal({ contactId, contact, onClose, onSaved }: ContactEditModalProps) {
  const initialForm = contactToEditForm(contact);
  const [editForm, setEditForm] = useState<ContactEditFormState>(initialForm);
  // Display label for the currently-selected company — seeded from the
  // contact's denormalised `companyName`, updated when the user picks a
  // different company from the typeahead. Not part of ContactEditFormState:
  // it's a display artifact of companyId, not a field the server persists.
  const [companyLabel, setCompanyLabel] = useState<string | null>(contact.companyName);
  const [activeTab, setActiveTab] = useState<ContactEditTabId>('general');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const customFieldsRef = useRef<CrmCustomFieldsPanelHandle>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Partial<Record<ContactEditTabId, HTMLButtonElement | null>>>({});
  const titleId = useId();

  const dirty = isEditFormDirty(initialForm, editForm);

  const requestClose = useCallback(() => {
    const customFieldsDirty = customFieldsRef.current?.isDirty?.() ?? false;
    if ((dirty || customFieldsDirty) && !window.confirm('Discard unsaved changes?')) return;
    onClose();
  }, [dirty, onClose]);

  // Escape-to-close, gated by the same dirty check as every other close path.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        requestClose();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [requestClose]);

  // Focus trap: focus the first field on open, cycle Tab/Shift+Tab within
  // the dialog, restore focus to whatever triggered the modal on close.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const container = dialogRef.current;
    const first = container?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
    first?.focus();

    function onKeyDown(e: KeyboardEvent) {
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
    // Intentionally runs once on mount/unmount only — re-running would steal focus back on every keystroke.
  }, []);

  function selectTab(id: ContactEditTabId) {
    setActiveTab(id);
    tabRefs.current[id]?.focus();
  }

  // Roving-tabindex arrow-key navigation between tabs (WAI-ARIA tabs pattern).
  function onTabListKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const ids = CONTACT_EDIT_TABS.map(t => t.id);
    const idx = ids.indexOf(activeTab);
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      selectTab(ids[(idx + 1) % ids.length]);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      selectTab(ids[(idx - 1 + ids.length) % ids.length]);
    } else if (e.key === 'Home') {
      e.preventDefault();
      selectTab(ids[0]);
    } else if (e.key === 'End') {
      e.preventDefault();
      selectTab(ids[ids.length - 1]);
    }
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    // Same payload shape the inline form sent: every editForm field, with
    // companyId converted from the typeahead's string id to number|null.
    const body = { ...editForm, companyId: editForm.companyId ? Number(editForm.companyId) : null };
    const res = await fetch(`/api/portal/crm/contacts/${contactId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const d = await res.json();
    if (!d.success) {
      setSaving(false);
      setError(d.message ?? 'Failed to save contact.');
      return;
    }
    // Save also flushes any pending custom-field edits via the always-mounted ref.
    const cfOk = await (customFieldsRef.current?.save() ?? Promise.resolve(true));
    setSaving(false);
    if (!cfOk) return;
    await onSaved();
  }

  function setField<K extends keyof ContactEditFormState>(key: K, value: ContactEditFormState[K]) {
    setEditForm(f => ({ ...f, [key]: value }));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4" onClick={requestClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={e => e.stopPropagation()}
        className="bg-card border border-border rounded-2xl shadow-2xl my-8 w-full max-w-2xl overflow-hidden"
      >
        <form onSubmit={saveEdit}>
          <div className="flex items-center justify-between px-6 py-4 border-b border-border">
            <h2 id={titleId} className="font-display text-[17px] font-extrabold tracking-[-0.02em] text-foreground">
              Edit Contact
            </h2>
            <button type="button" onClick={requestClose} aria-label="Close" className="text-muted-foreground hover:text-foreground">
              <span className="material-icons text-base">close</span>
            </button>
          </div>

          {error && (
            <div className="mx-6 mt-4 flex items-center gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-xl px-3 py-2">
              <span className="material-icons text-base">error</span>
              {error}
            </div>
          )}

          <div role="tablist" aria-label="Contact edit sections" onKeyDown={onTabListKeyDown} className="flex border-b border-border px-2">
            {CONTACT_EDIT_TABS.map(tab => (
              <button
                key={tab.id}
                type="button"
                ref={el => { tabRefs.current[tab.id] = el; }}
                role="tab"
                id={`contact-edit-tab-${tab.id}`}
                aria-selected={activeTab === tab.id}
                aria-controls={`contact-edit-panel-${tab.id}`}
                tabIndex={activeTab === tab.id ? 0 : -1}
                onClick={() => selectTab(tab.id)}
                className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
                  activeTab === tab.id
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                <span className="material-icons text-base">{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>

          <div className="p-6 max-h-[60vh] overflow-y-auto">
            <div
              id="contact-edit-panel-general"
              role="tabpanel"
              aria-labelledby="contact-edit-tab-general"
              hidden={activeTab !== 'general'}
              className="grid sm:grid-cols-2 gap-4"
            >
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">First Name</label>
                <input required value={editForm.firstName} onChange={e => setField('firstName', e.target.value)} className={pInput} />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Last Name</label>
                <input required value={editForm.lastName} onChange={e => setField('lastName', e.target.value)} className={pInput} />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Title</label>
                <input value={editForm.title} onChange={e => setField('title', e.target.value)} className={pInput} />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Company</label>
                <CrmCompanyTypeaheadPicker
                  value={editForm.companyId}
                  selectedLabel={companyLabel}
                  onChange={opt => {
                    setField('companyId', opt ? String(opt.id) : '');
                    setCompanyLabel(opt ? opt.name : null);
                  }}
                  placeholder="Select company…"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Status</label>
                <select value={editForm.status} onChange={e => setField('status', e.target.value)} className={pSelect}>
                  {CONTACT_STATUS_OPTIONS.map(s => (
                    <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <MediaPicker value={editForm.avatarUrl} onChange={url => setField('avatarUrl', url)} label="Avatar" mimeTypeFilter="image" />
              </div>
            </div>

            <div
              id="contact-edit-panel-details"
              role="tabpanel"
              aria-labelledby="contact-edit-tab-details"
              hidden={activeTab !== 'details'}
              className="grid sm:grid-cols-2 gap-4"
            >
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Email</label>
                <input type="email" value={editForm.email} onChange={e => setField('email', e.target.value)} className={pInput} />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Phone</label>
                <input value={editForm.phone} onChange={e => setField('phone', e.target.value)} className={pInput} />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">LinkedIn URL</label>
                <input
                  type="url"
                  value={editForm.linkedinUrl}
                  onChange={e => setField('linkedinUrl', e.target.value)}
                  placeholder="https://linkedin.com/in/..."
                  className={pInput}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Source</label>
                <select value={editForm.source} onChange={e => setField('source', e.target.value)} className={pSelect}>
                  <option value="">None</option>
                  {CONTACT_SOURCE_OPTIONS.map(s => (
                    <option key={s} value={s}>{s.replace('-', ' ')}</option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-muted-foreground mb-1">Address</label>
                <input value={editForm.address} onChange={e => setField('address', e.target.value)} className={pInput} />
              </div>
            </div>

            <div
              id="contact-edit-panel-custom-fields"
              role="tabpanel"
              aria-labelledby="contact-edit-tab-custom-fields"
              hidden={activeTab !== 'custom-fields'}
            >
              <CrmCustomFieldsPanel ref={customFieldsRef} entityType="contact" entityId={contactId} externalMode="edit" />
            </div>
          </div>

          <div className="flex gap-2 justify-end px-6 py-4 border-t border-border">
            <button type="button" onClick={requestClose} className={pBtnGhost}>
              Cancel
            </button>
            <button type="submit" disabled={saving} className={pBtnPrimary}>
              {saving && <span className="material-icons animate-spin text-sm">refresh</span>}
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
