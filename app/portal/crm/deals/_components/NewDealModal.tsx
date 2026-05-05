'use client';

import { useMemo, useState } from 'react';
import Select from 'react-select';
import MarkdownView from '@/components/portal/MarkdownView';
import * as api from '../_lib/api';
import { inputClass, rsClassNames } from '../_lib/ui';
import type { Company, Contact, DealFormState, Pipeline } from '../_lib/types';

interface NewDealModalProps {
  pipelines: Pipeline[];
  selectedPipelineId: number | null;
  contacts: Contact[];
  companies: Company[];
  /** Initial form values — caller seeds pipelineId/stageId based on the
   *  active pipeline so the form matches the kanban they're looking at. */
  initialForm: DealFormState;
  onCompanyCreated: (c: Company) => void;
  onContactCreated: (c: Contact) => void;
  onCreated: () => void;
}

/**
 * Inline "New Deal" form that renders below the filter bar. Owns its own
 * form state and inline company/contact creation flows; submits through
 * `_lib/api.createDeal` and notifies the parent via `onCreated`.
 */
export default function NewDealModal({
  pipelines,
  selectedPipelineId,
  contacts,
  companies,
  initialForm,
  onCompanyCreated,
  onContactCreated,
  onCreated,
}: NewDealModalProps) {
  const [form, setForm] = useState<DealFormState>(initialForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notesPreview, setNotesPreview] = useState(false);

  // Inline company creation state
  const [newCompanyName, setNewCompanyName] = useState('');
  const [creatingCompany, setCreatingCompany] = useState(false);
  const [showNewCompany, setShowNewCompany] = useState(false);

  // Inline contact creation state
  const [newContactFirst, setNewContactFirst] = useState('');
  const [newContactLast, setNewContactLast] = useState('');
  const [newContactEmail, setNewContactEmail] = useState('');
  const [creatingContact, setCreatingContact] = useState(false);
  const [showNewContact, setShowNewContact] = useState(false);

  function resetNewContact() {
    setNewContactFirst('');
    setNewContactLast('');
    setNewContactEmail('');
    setShowNewContact(false);
  }

  async function handleCreateCompany() {
    if (!newCompanyName.trim()) return;
    setCreatingCompany(true);
    const d = await api.createCompany(newCompanyName.trim());
    setCreatingCompany(false);
    if (!d.success || !d.data) return;
    onCompanyCreated(d.data);
    setForm((f) => ({ ...f, companyId: String(d.data!.id), contactId: '' }));
    setNewCompanyName('');
    setShowNewCompany(false);
  }

  async function handleCreateContact() {
    if (!newContactFirst.trim()) return;
    setCreatingContact(true);
    const d = await api.createContact({
      firstName: newContactFirst.trim(),
      lastName: newContactLast.trim() || null,
      email: newContactEmail.trim() || null,
      companyId: form.companyId ? Number(form.companyId) : null,
    });
    setCreatingContact(false);
    if (!d.success || !d.data) return;
    const created: Contact = {
      id: d.data.id,
      firstName: d.data.firstName,
      lastName: d.data.lastName ?? '',
      companyId: d.data.companyId ?? null,
    };
    onContactCreated(created);
    setForm((f) => ({ ...f, contactId: String(created.id) }));
    resetNewContact();
  }

  // Contact options: strictly limited to the selected company; empty when
  // none chosen so the react-select can render disabled.
  const contactOptions = useMemo(() => {
    if (!form.companyId) return [] as { value: number; label: string }[];
    const cid = Number(form.companyId);
    return contacts
      .filter((c) => c.companyId === cid)
      .map((c) => ({
        value: c.id,
        label: `${c.firstName} ${c.lastName}`.trim() || `Contact #${c.id}`,
      }));
  }, [contacts, form.companyId]);

  // Stages for the chosen pipeline (defaults to the page's active pipeline).
  const formPipelineId = form.pipelineId ? Number(form.pipelineId) : selectedPipelineId;
  const formStages =
    pipelines
      .find((p) => p.id === formPipelineId)
      ?.stages?.slice()
      .sort((a, b) => a.order - b.order) ?? [];

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    const body = {
      title: form.title,
      value: Math.round(parseFloat(form.value || '0') * 100),
      contactId: form.contactId ? Number(form.contactId) : null,
      companyId: form.companyId ? Number(form.companyId) : null,
      pipelineId: form.pipelineId ? Number(form.pipelineId) : selectedPipelineId,
      stageId: form.stageId ? Number(form.stageId) : (formStages[0]?.id ?? null),
      priority: form.priority,
      expectedCloseDate: form.expectedCloseDate || null,
      notes: form.notes || null,
    };
    const d = await api.createDeal(body);
    setSaving(false);
    if (!d.success) {
      setError(d.message ?? 'Failed to create deal.');
      return;
    }
    onCreated();
  }

  return (
    <form onSubmit={handleSubmit} className="bg-card border border-border rounded-xl p-6 space-y-4">
      <h3 className="font-semibold text-foreground">New Deal</h3>
      {error && (
        <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
          <span className="material-icons text-base">error</span>
          {error}
        </div>
      )}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Title *</label>
          <input
            required
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Value ($) *</label>
          <input
            required
            type="number"
            step="0.01"
            min="0"
            value={form.value}
            onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))}
            placeholder="0.00"
            className={inputClass}
          />
        </div>
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-medium text-muted-foreground">Company</label>
            <button
              type="button"
              onClick={() => setShowNewCompany((v) => !v)}
              className="text-xs text-primary hover:underline"
            >
              {showNewCompany ? 'Cancel' : '+ New'}
            </button>
          </div>
          {showNewCompany ? (
            <div className="flex gap-1">
              <input
                value={newCompanyName}
                onChange={(e) => setNewCompanyName(e.target.value)}
                placeholder="Company name"
                className={inputClass}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleCreateCompany();
                  }
                }}
              />
              <button
                type="button"
                onClick={handleCreateCompany}
                disabled={creatingCompany}
                className="px-2 py-2 bg-primary text-primary-foreground rounded-lg text-sm shrink-0 hover:bg-primary/90 disabled:opacity-50"
              >
                <span className="material-icons text-base">{creatingCompany ? 'refresh' : 'check'}</span>
              </button>
            </div>
          ) : (
            <select
              value={form.companyId}
              onChange={(e) => setForm((f) => ({ ...f, companyId: e.target.value, contactId: '' }))}
              className={inputClass}
            >
              <option value="">None</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
        </div>
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-medium text-muted-foreground">
              Contact
              {form.companyId && <span className="text-primary ml-1">(filtered)</span>}
            </label>
            <button
              type="button"
              onClick={() => {
                if (showNewContact) {
                  resetNewContact();
                } else {
                  setShowNewContact(true);
                }
              }}
              className="text-xs text-primary hover:underline"
            >
              {showNewContact ? 'Cancel' : '+ New'}
            </button>
          </div>
          {showNewContact ? (
            <div className="space-y-1.5">
              <div className="flex gap-1">
                <input
                  value={newContactFirst}
                  onChange={(e) => setNewContactFirst(e.target.value)}
                  placeholder="First name *"
                  className={inputClass}
                />
                <input
                  value={newContactLast}
                  onChange={(e) => setNewContactLast(e.target.value)}
                  placeholder="Last name"
                  className={inputClass}
                />
              </div>
              <div className="flex gap-1">
                <input
                  value={newContactEmail}
                  onChange={(e) => setNewContactEmail(e.target.value)}
                  placeholder="Email"
                  type="email"
                  className={inputClass}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleCreateContact();
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={handleCreateContact}
                  disabled={creatingContact || !newContactFirst.trim()}
                  className="px-2 py-2 bg-primary text-primary-foreground rounded-lg text-sm shrink-0 hover:bg-primary/90 disabled:opacity-50"
                >
                  <span className="material-icons text-base">{creatingContact ? 'refresh' : 'check'}</span>
                </button>
              </div>
              {form.companyId && (
                <p className="text-[10px] text-muted-foreground">
                  Will be assigned to {companies.find((c) => c.id === Number(form.companyId))?.name}
                </p>
              )}
            </div>
          ) : (
            <Select
              isClearable
              isDisabled={!form.companyId}
              options={contactOptions}
              value={contactOptions.find((o) => String(o.value) === form.contactId) ?? null}
              onChange={(v) => setForm((f) => ({ ...f, contactId: v ? String(v.value) : '' }))}
              placeholder={form.companyId ? 'Select contact…' : 'Select a company first'}
              noOptionsMessage={() => (form.companyId ? 'No contacts at this company' : 'Select a company first')}
              classNames={rsClassNames}
              classNamePrefix="rs"
            />
          )}
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Pipeline</label>
          <select
            value={form.pipelineId}
            onChange={(e) => {
              const pid = Number(e.target.value);
              const pStages =
                pipelines
                  .find((p) => p.id === pid)
                  ?.stages?.slice()
                  .sort((a, b) => a.order - b.order) ?? [];
              setForm((f) => ({
                ...f,
                pipelineId: e.target.value,
                stageId: String(pStages[0]?.id ?? ''),
              }));
            }}
            className={inputClass}
          >
            {pipelines.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Stage</label>
          <select
            value={form.stageId}
            onChange={(e) => setForm((f) => ({ ...f, stageId: e.target.value }))}
            className={inputClass}
          >
            {formStages.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Priority</label>
          <select
            value={form.priority}
            onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
            className={inputClass}
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Expected Close Date</label>
          <input
            type="date"
            value={form.expectedCloseDate}
            onChange={(e) => setForm((f) => ({ ...f, expectedCloseDate: e.target.value }))}
            className={inputClass}
          />
        </div>
        <div className="sm:col-span-2 lg:col-span-3">
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-medium text-muted-foreground">
              Notes <span className="text-muted-foreground/60">(markdown)</span>
            </label>
            <div className="flex gap-1 text-[11px]">
              <button
                type="button"
                onClick={() => setNotesPreview(false)}
                className={`px-2 py-0.5 rounded ${
                  !notesPreview ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Write
              </button>
              <button
                type="button"
                onClick={() => setNotesPreview(true)}
                className={`px-2 py-0.5 rounded ${
                  notesPreview ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Preview
              </button>
            </div>
          </div>
          {notesPreview ? (
            <div className="min-h-[100px] px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground">
              {form.notes.trim() ? (
                <MarkdownView>{form.notes}</MarkdownView>
              ) : (
                <span className="text-muted-foreground italic">Nothing to preview.</span>
              )}
            </div>
          ) : (
            <textarea
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              rows={5}
              placeholder="**Bold**, _italic_, lists, links, `code`…"
              className={inputClass + ' font-mono resize-y'}
            />
          )}
        </div>
      </div>
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {saving && <span className="material-icons animate-spin text-sm">refresh</span>}
          Create Deal
        </button>
      </div>
    </form>
  );
}
