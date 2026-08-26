'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import MediaPicker from '@/components/admin/MediaPicker';
import CrmCustomFieldsPanel, { type CrmCustomFieldsPanelHandle } from '@/components/portal/CrmCustomFieldsPanel';
import { pBtnGhost, pBtnPrimary, pInput, pSelect } from '@/components/portal/portal-ui';
import {
  COMPANY_EDIT_TABS,
  COMPANY_SIZE_OPTIONS,
  companyToEditForm,
  isEditFormDirty,
  type CompanyEditFormState,
  type CompanyEditTabId,
  type EditableCompanySource,
} from '../_lib/companyEditForm';

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface CompanyEditModalProps {
  companyId: number;
  company: EditableCompanySource;
  onClose: () => void;
  /** Called after the company + custom fields both save successfully. The modal closes itself. */
  onSaved: () => void | Promise<void>;
}

/**
 * Edit-company modal (PUX-018), sectioned into tabs. Replaces the inline
 * edit form that used to render directly in the page flow.
 *
 * Owns its own form state and its own `CrmCustomFieldsPanel` instance (in
 * 'edit' mode) — separate from the page-level panel, which stays in 'view'
 * mode at all times now that editing only happens here. The parent mounts
 * this component only while open (matches `CrmAddDealModal`), so closing it
 * discards all in-progress state; a dirty edit prompts for confirmation
 * first (same `confirm()` pattern `CrmCustomFieldsPanel` already uses for
 * its own inline edit mode).
 */
export default function CompanyEditModal({ companyId, company, onClose, onSaved }: CompanyEditModalProps) {
  const initialForm = companyToEditForm(company);
  const [editForm, setEditForm] = useState<CompanyEditFormState>(initialForm);
  const [activeTab, setActiveTab] = useState<CompanyEditTabId>('general');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const customFieldsRef = useRef<CrmCustomFieldsPanelHandle>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Partial<Record<CompanyEditTabId, HTMLButtonElement | null>>>({});
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

  function selectTab(id: CompanyEditTabId) {
    setActiveTab(id);
    tabRefs.current[id]?.focus();
  }

  // Roving-tabindex arrow-key navigation between tabs (WAI-ARIA tabs pattern).
  function onTabListKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const ids = COMPANY_EDIT_TABS.map(t => t.id);
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
    const payload: Record<string, unknown> = {
      name: editForm.name,
      domain: editForm.domain,
      industry: editForm.industry,
      size: editForm.size,
      phone: editForm.phone,
      website: editForm.website,
      address: editForm.address,
      logoUrl: editForm.logoUrl,
      notes: editForm.notes,
    };
    // Only forward lat/lng if the user typed something. An empty string means
    // "leave unset and let the server auto-derive from the address".
    if (editForm.latitude.trim() !== '') payload.latitude = editForm.latitude.trim();
    if (editForm.longitude.trim() !== '') payload.longitude = editForm.longitude.trim();

    const res = await fetch(`/api/portal/crm/companies/${companyId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const d = await res.json();
    if (!d.success) {
      setSaving(false);
      setError(d.message ?? 'Failed to save company.');
      return;
    }
    const cfOk = await (customFieldsRef.current?.save() ?? Promise.resolve(true));
    setSaving(false);
    if (!cfOk) return;
    await onSaved();
  }

  function setField<K extends keyof CompanyEditFormState>(key: K, value: CompanyEditFormState[K]) {
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
              Edit Company
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

          <div role="tablist" aria-label="Company edit sections" onKeyDown={onTabListKeyDown} className="flex border-b border-border px-2">
            {COMPANY_EDIT_TABS.map(tab => (
              <button
                key={tab.id}
                type="button"
                ref={el => { tabRefs.current[tab.id] = el; }}
                role="tab"
                id={`company-edit-tab-${tab.id}`}
                aria-selected={activeTab === tab.id}
                aria-controls={`company-edit-panel-${tab.id}`}
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
              id="company-edit-panel-general"
              role="tabpanel"
              aria-labelledby="company-edit-tab-general"
              hidden={activeTab !== 'general'}
              className="grid sm:grid-cols-2 gap-4"
            >
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Name *</label>
                <input required value={editForm.name} onChange={e => setField('name', e.target.value)} className={pInput} />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Domain</label>
                <input value={editForm.domain} onChange={e => setField('domain', e.target.value)} className={pInput} />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Industry</label>
                <input value={editForm.industry} onChange={e => setField('industry', e.target.value)} className={pInput} />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Size</label>
                <select value={editForm.size} onChange={e => setField('size', e.target.value)} className={pSelect}>
                  <option value="">Select size</option>
                  {COMPANY_SIZE_OPTIONS.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>

            <div
              id="company-edit-panel-details"
              role="tabpanel"
              aria-labelledby="company-edit-tab-details"
              hidden={activeTab !== 'details'}
              className="grid sm:grid-cols-2 gap-4"
            >
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Phone</label>
                <input value={editForm.phone} onChange={e => setField('phone', e.target.value)} className={pInput} />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Website</label>
                <input value={editForm.website} onChange={e => setField('website', e.target.value)} className={pInput} />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-muted-foreground mb-1">Address</label>
                <textarea
                  value={editForm.address}
                  onChange={e => setField('address', e.target.value)}
                  rows={2}
                  placeholder="123 Main St, City, State"
                  className="w-full rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm text-foreground outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/15 resize-y"
                />
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Latitude</label>
                    <input
                      type="number"
                      step="any"
                      min={-90}
                      max={90}
                      value={editForm.latitude}
                      onChange={e => setField('latitude', e.target.value)}
                      placeholder="e.g. 40.7128"
                      className={pInput}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Longitude</label>
                    <input
                      type="number"
                      step="any"
                      min={-180}
                      max={180}
                      value={editForm.longitude}
                      onChange={e => setField('longitude', e.target.value)}
                      placeholder="e.g. -74.0060"
                      className={pInput}
                    />
                  </div>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">Auto-derived from address on save if left blank.</p>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-muted-foreground mb-1">Notes</label>
                <textarea
                  value={editForm.notes}
                  onChange={e => setField('notes', e.target.value)}
                  rows={3}
                  className="w-full rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm text-foreground outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/15 resize-y"
                />
              </div>
            </div>

            <div
              id="company-edit-panel-branding"
              role="tabpanel"
              aria-labelledby="company-edit-tab-branding"
              hidden={activeTab !== 'branding'}
            >
              <MediaPicker value={editForm.logoUrl} onChange={url => setField('logoUrl', url)} label="Logo" mimeTypeFilter="image" />
            </div>

            <div
              id="company-edit-panel-custom-fields"
              role="tabpanel"
              aria-labelledby="company-edit-tab-custom-fields"
              hidden={activeTab !== 'custom-fields'}
            >
              <CrmCustomFieldsPanel ref={customFieldsRef} entityType="company" entityId={companyId} externalMode="edit" />
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
