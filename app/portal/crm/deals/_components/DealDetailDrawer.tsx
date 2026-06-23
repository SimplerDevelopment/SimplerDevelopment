'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Select from 'react-select';
import CrmCustomFieldsPanel from '@/components/portal/CrmCustomFieldsPanel';
import CrmCompanyTypeaheadPicker from '@/components/portal/CrmCompanyTypeaheadPicker';
import MarkdownView from '@/components/portal/MarkdownView';
import * as api from '../_lib/api';
import {
  ARTIFACT_ICONS,
  ARTIFACT_LABELS,
  artifactUrl,
  formatDateForInput,
  inputClass,
  rsClassNames,
} from '../_lib/ui';
import type {
  Artifact,
  AvailableArtifact,
  Comment,
  Company,
  Contact,
  Deal,
  DealEditFormState,
  MentionUser,
  PanelTab,
  Pipeline,
} from '../_lib/types';

interface DealDetailDrawerProps {
  deal: Deal;
  pipelines: Pipeline[];
  contacts: Contact[];
  onCompanyCreated: (c: Company) => void;
  onContactCreated: (c: Contact) => void;
  onSaved: () => void;
  onDeleted: () => void;
  onClose: () => void;
}

/**
 * Slide-over drawer with three tabs (Details / Artifacts / Comments) for an
 * existing deal. Owns its own form state, artifacts/comments fetches and
 * mention dropdown — extracted as-is from page.tsx with no behavior changes.
 */
export default function DealDetailDrawer({
  deal,
  pipelines,
  contacts,
  onCompanyCreated,
  onContactCreated,
  onSaved,
  onDeleted,
  onClose,
}: DealDetailDrawerProps) {
  const [editForm, setEditForm] = useState<DealEditFormState>({
    title: deal.title,
    value: String(deal.value / 100),
    contactId: deal.contactId ? String(deal.contactId) : '',
    companyId: deal.companyId ? String(deal.companyId) : '',
    pipelineId: String(deal.pipelineId),
    stageId: String(deal.stageId),
    priority: deal.priority,
    status: deal.status,
    expectedCloseDate: formatDateForInput(deal.expectedCloseDate),
    notes: deal.notes ?? '',
  });
  // Display label for the currently-selected company in the typeahead picker.
  // Seeded from the deal's denormalised companyName so the closed-state of
  // the dropdown reads correctly before any search has happened.
  const [companyLabel, setCompanyLabel] = useState<string | null>(deal.companyName ?? null);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');
  const [editNotesPreview, setEditNotesPreview] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [panelTab, setPanelTab] = useState<PanelTab>('details');

  // Artifacts state
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [availableArtifacts, setAvailableArtifacts] = useState<AvailableArtifact[]>([]);
  const [artifactsLoading, setArtifactsLoading] = useState(false);
  const [showArtifactPicker, setShowArtifactPicker] = useState(false);
  const [artifactTypeFilter, setArtifactTypeFilter] = useState('');

  // Comments state
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentBody, setCommentBody] = useState('');
  const [commentFiles, setCommentFiles] = useState<File[]>([]);
  const [postingComment, setPostingComment] = useState(false);
  const [mentionUsers, setMentionUsers] = useState<MentionUser[]>([]);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const commentInputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Inline company creation
  const [newCompanyName, setNewCompanyName] = useState('');
  const [creatingCompany, setCreatingCompany] = useState(false);
  const [showNewCompany, setShowNewCompany] = useState(false);

  // Inline contact creation
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

  // Initial load: artifacts/comments/mentions for the active deal.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setArtifactsLoading(true);
      const [a, av, c, m] = await Promise.all([
        api.fetchArtifacts(deal.id),
        api.fetchAvailableArtifacts(deal.id),
        api.fetchComments(deal.id),
        api.fetchMentionUsers(),
      ]);
      if (cancelled) return;
      setArtifacts(a);
      setAvailableArtifacts(av);
      setComments(c);
      setMentionUsers(m);
      setArtifactsLoading(false);
      setCommentsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [deal.id]);

  const editDealContactOptions = useMemo(() => {
    if (!editForm.companyId) return [] as { value: number; label: string }[];
    const cid = Number(editForm.companyId);
    return contacts
      .filter((c) => c.companyId === cid)
      .map((c) => ({
        value: c.id,
        label: `${c.firstName} ${c.lastName}`.trim() || `Contact #${c.id}`,
      }));
  }, [contacts, editForm.companyId]);

  const editPipelineId = editForm.pipelineId ? Number(editForm.pipelineId) : deal.pipelineId;
  const editStages =
    pipelines
      .find((p) => p.id === editPipelineId)
      ?.stages?.slice()
      .sort((a, b) => a.order - b.order) ?? [];

  async function handleCreateCompany() {
    if (!newCompanyName.trim()) return;
    setCreatingCompany(true);
    const d = await api.createCompany(newCompanyName.trim());
    setCreatingCompany(false);
    if (!d.success || !d.data) return;
    onCompanyCreated(d.data);
    setEditForm((f) => ({ ...f, companyId: String(d.data!.id), contactId: '' }));
    setCompanyLabel(d.data.name);
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
      companyId: editForm.companyId ? Number(editForm.companyId) : null,
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
    setEditForm((f) => ({ ...f, contactId: String(created.id) }));
    resetNewContact();
  }

  async function saveDeal(e: React.FormEvent) {
    e.preventDefault();
    setEditSaving(true);
    setEditError('');
    const body = {
      title: editForm.title,
      value: Math.round(parseFloat(editForm.value || '0') * 100),
      contactId: editForm.contactId ? Number(editForm.contactId) : null,
      companyId: editForm.companyId ? Number(editForm.companyId) : null,
      pipelineId: Number(editForm.pipelineId),
      stageId: Number(editForm.stageId),
      priority: editForm.priority,
      status: editForm.status,
      expectedCloseDate: editForm.expectedCloseDate || null,
      notes: editForm.notes || null,
    };
    const d = await api.updateDeal(deal.id, body);
    setEditSaving(false);
    if (!d.success) {
      setEditError(d.message ?? 'Failed to save deal.');
      return;
    }
    onSaved();
  }

  async function handleDelete() {
    if (!confirm('Delete this deal? This cannot be undone.')) return;
    setDeleting(true);
    await api.deleteDeal(deal.id);
    setDeleting(false);
    onDeleted();
  }

  // ── Artifacts handlers ──
  async function refreshArtifacts() {
    const a = await api.fetchArtifacts(deal.id);
    setArtifacts(a);
  }

  async function handleAddArtifact(type: string, artifactId: number) {
    await api.addArtifact(deal.id, type, artifactId);
    await refreshArtifacts();
    setShowArtifactPicker(false);
  }

  async function togglePin(artifactDbId: number, pinned: boolean) {
    await api.updateArtifactPin(deal.id, artifactDbId, pinned);
    setArtifacts((prev) => prev.map((a) => (a.id === artifactDbId ? { ...a, pinned } : a)));
  }

  async function handleRemoveArtifact(artifactDbId: number) {
    await api.removeArtifact(deal.id, artifactDbId);
    setArtifacts((prev) => prev.filter((a) => a.id !== artifactDbId));
  }

  // ── Comments handlers ──
  async function refreshComments() {
    const c = await api.fetchComments(deal.id);
    setComments(c);
  }

  async function handlePostComment() {
    if (!commentBody.trim() && commentFiles.length === 0) return;
    setPostingComment(true);
    const res = await api.postComment(deal.id, commentBody, commentFiles);
    setPostingComment(false);
    if (!res.ok) {
      setEditError('Failed to post comment. Please try again.');
      return;
    }
    setCommentBody('');
    setCommentFiles([]);
    await refreshComments();
  }

  async function handleDeleteComment(commentId: number) {
    await api.deleteComment(deal.id, commentId);
    setComments((prev) => prev.filter((c) => c.id !== commentId));
  }

  function handleCommentKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handlePostComment();
      return;
    }
    if (showMentions && e.key === 'Escape') {
      setShowMentions(false);
    }
  }

  function handleCommentChange(value: string) {
    setCommentBody(value);
    const textarea = commentInputRef.current;
    if (!textarea) return;
    const cursor = textarea.selectionStart;
    const textBefore = value.slice(0, cursor);
    const atMatch = textBefore.match(/@(\w*)$/);
    if (atMatch) {
      setShowMentions(true);
      setMentionQuery(atMatch[1].toLowerCase());
    } else {
      setShowMentions(false);
    }
  }

  function insertMention(user: MentionUser) {
    const textarea = commentInputRef.current;
    if (!textarea) return;
    const cursor = textarea.selectionStart;
    const textBefore = commentBody.slice(0, cursor);
    const textAfter = commentBody.slice(cursor);
    const atIndex = textBefore.lastIndexOf('@');
    const mention = `@[${user.name}](${user.id}) `;
    const newValue = textBefore.slice(0, atIndex) + mention + textAfter;
    setCommentBody(newValue);
    setShowMentions(false);
    setTimeout(() => {
      textarea.focus();
      const pos = atIndex + mention.length;
      textarea.setSelectionRange(pos, pos);
    }, 0);
  }

  function renderCommentBody(body: string): string {
    const escaped = body
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
    return escaped.replace(/@\[([^\]]+)\]\(\d+\)/g, '<strong class="text-primary">@$1</strong>');
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40 transition-opacity" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-card border-l border-border shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="bg-card border-b border-border px-6 py-4 flex items-center justify-between flex-wrap gap-3 shrink-0">
          <h2 className="text-lg font-semibold text-foreground truncate">{deal.title}</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="flex items-center gap-1 px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10 rounded-lg transition-colors disabled:opacity-50"
            >
              <span className="material-icons text-base">delete</span>
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-accent transition-colors">
              <span className="material-icons text-xl text-muted-foreground">close</span>
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border shrink-0">
          {(
            [
              ['details', 'edit', 'Details'],
              ['artifacts', 'attach_file', 'Artifacts'],
              ['comments', 'chat', 'Comments'],
            ] as const
          ).map(([tab, icon, label]) => (
            <button
              key={tab}
              onClick={() => setPanelTab(tab as PanelTab)}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-sm font-medium transition-colors ${
                panelTab === tab
                  ? 'text-primary border-b-2 border-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <span className="material-icons text-base">{icon}</span>
              {label}
              {tab === 'artifacts' && artifacts.length > 0 && (
                <span className="text-[10px] bg-accent px-1.5 py-0.5 rounded-full">{artifacts.length}</span>
              )}
              {tab === 'comments' && comments.length > 0 && (
                <span className="text-[10px] bg-accent px-1.5 py-0.5 rounded-full">{comments.length}</span>
              )}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto">
          {/* === DETAILS TAB === */}
          {panelTab === 'details' && (
            <form onSubmit={saveDeal} className="p-6 space-y-5">
              {editError && (
                <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
                  <span className="material-icons text-base">error</span>
                  {editError}
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Title</label>
                <input
                  required
                  value={editForm.title}
                  onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))}
                  className={inputClass}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Value ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={editForm.value}
                    onChange={(e) => setEditForm((f) => ({ ...f, value: e.target.value }))}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Priority</label>
                  <select
                    value={editForm.priority}
                    onChange={(e) => setEditForm((f) => ({ ...f, priority: e.target.value }))}
                    className={inputClass}
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Status</label>
                  <select
                    value={editForm.status}
                    onChange={(e) => setEditForm((f) => ({ ...f, status: e.target.value }))}
                    className={inputClass}
                  >
                    <option value="open">Open</option>
                    <option value="won">Won</option>
                    <option value="lost">Lost</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Expected Close</label>
                  <input
                    type="date"
                    value={editForm.expectedCloseDate}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, expectedCloseDate: e.target.value }))
                    }
                    className={inputClass}
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium text-muted-foreground">Company</label>
                  <button
                    type="button"
                    onClick={() => setShowNewCompany((v) => !v)}
                    className="text-xs text-primary hover:underline"
                  >
                    {showNewCompany ? 'Cancel' : '+ New Company'}
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
                  <CrmCompanyTypeaheadPicker
                    value={editForm.companyId}
                    selectedLabel={companyLabel}
                    onChange={(opt) => {
                      setEditForm((f) => ({
                        ...f,
                        companyId: opt ? String(opt.id) : '',
                        contactId: '',
                      }));
                      setCompanyLabel(opt ? opt.name : null);
                    }}
                    placeholder="Select company…"
                  />
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    Contact
                    {editForm.companyId && <span className="text-primary ml-1">(filtered)</span>}
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
                    {showNewContact ? 'Cancel' : '+ New Contact'}
                  </button>
                </div>
                {showNewContact ? (
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-1">
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
                        <span className="material-icons text-base">
                          {creatingContact ? 'refresh' : 'check'}
                        </span>
                      </button>
                    </div>
                    {editForm.companyId && (
                      <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <span className="material-icons text-[10px]">link</span>
                        Will be assigned to{' '}
                        {companyLabel ?? `company #${editForm.companyId}`}
                      </p>
                    )}
                  </div>
                ) : (
                  <Select
                    isClearable
                    isDisabled={!editForm.companyId}
                    options={editDealContactOptions}
                    value={
                      editDealContactOptions.find((o) => String(o.value) === editForm.contactId) ??
                      null
                    }
                    onChange={(v) =>
                      setEditForm((f) => ({ ...f, contactId: v ? String(v.value) : '' }))
                    }
                    placeholder={editForm.companyId ? 'Select contact…' : 'Select a company first'}
                    noOptionsMessage={() =>
                      editForm.companyId ? 'No contacts at this company' : 'Select a company first'
                    }
                    classNames={rsClassNames}
                    classNamePrefix="rs"
                  />
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">Pipeline</label>
                  <select
                    value={editForm.pipelineId}
                    onChange={(e) => {
                      const pid = Number(e.target.value);
                      const pStages =
                        pipelines
                          .find((p) => p.id === pid)
                          ?.stages?.slice()
                          .sort((a, b) => a.order - b.order) ?? [];
                      setEditForm((f) => ({
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
                    value={editForm.stageId}
                    onChange={(e) => setEditForm((f) => ({ ...f, stageId: e.target.value }))}
                    className={inputClass}
                  >
                    {editStages.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    Notes <span className="text-muted-foreground/60">(markdown)</span>
                  </label>
                  <div className="flex gap-1 text-[11px]">
                    <button
                      type="button"
                      onClick={() => setEditNotesPreview(false)}
                      className={`px-2 py-0.5 rounded ${
                        !editNotesPreview
                          ? 'bg-accent text-foreground'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      Write
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditNotesPreview(true)}
                      className={`px-2 py-0.5 rounded ${
                        editNotesPreview
                          ? 'bg-accent text-foreground'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      Preview
                    </button>
                  </div>
                </div>
                {editNotesPreview ? (
                  <div className="min-h-[100px] px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground">
                    {editForm.notes.trim() ? (
                      <MarkdownView>{editForm.notes}</MarkdownView>
                    ) : (
                      <span className="text-muted-foreground italic">Nothing to preview.</span>
                    )}
                  </div>
                ) : (
                  <textarea
                    value={editForm.notes}
                    onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
                    rows={5}
                    placeholder="**Bold**, _italic_, lists, links, `code`…"
                    className={inputClass + ' font-mono resize-y'}
                  />
                )}
              </div>

              {/* Pinned Artifacts Preview */}
              {artifacts.filter((a) => a.pinned).length > 0 && (
                <div className="pt-2 border-t border-border">
                  <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                    <span className="material-icons text-xs">push_pin</span> Pinned Artifacts
                  </p>
                  <div className="space-y-1">
                    {artifacts
                      .filter((a) => a.pinned)
                      .map((a) => {
                        const url = artifactUrl(a.artifactType, a.artifactId);
                        const inner = (
                          <>
                            <span className="material-icons text-sm text-muted-foreground">
                              {ARTIFACT_ICONS[a.artifactType] || 'attachment'}
                            </span>
                            <span className="truncate">{a.displayTitle}</span>
                            <span className="text-muted-foreground ml-auto shrink-0">
                              {ARTIFACT_LABELS[a.artifactType]}
                            </span>
                            {url && (
                              <span className="material-icons text-xs text-muted-foreground shrink-0">
                                open_in_new
                              </span>
                            )}
                          </>
                        );
                        return url ? (
                          <a
                            key={a.id}
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 text-xs text-foreground bg-accent/50 rounded-lg px-2 py-1.5 hover:bg-accent transition-colors"
                            title="Open artifact"
                          >
                            {inner}
                          </a>
                        ) : (
                          <div
                            key={a.id}
                            className="flex items-center gap-2 text-xs text-foreground bg-accent/50 rounded-lg px-2 py-1.5"
                          >
                            {inner}
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between pt-2 border-t border-border">
                <p className="text-xs text-muted-foreground">
                  Created {new Date(deal.createdAt).toLocaleDateString()}
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 text-sm font-medium text-foreground bg-accent rounded-lg hover:bg-accent/80 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={editSaving}
                    className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                  >
                    {editSaving && <span className="material-icons animate-spin text-sm">refresh</span>}
                    Save Changes
                  </button>
                </div>
              </div>

              <div className="pt-4 border-t border-border space-y-3">
                <p className="text-sm font-medium text-foreground flex items-center gap-2">
                  <span className="material-icons text-base text-muted-foreground">tune</span>
                  Custom Fields
                </p>
                <CrmCustomFieldsPanel entityType="deal" entityId={deal.id} />
              </div>
            </form>
          )}

          {/* === ARTIFACTS TAB === */}
          {panelTab === 'artifacts' && (
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-foreground">Linked Artifacts</p>
                <button
                  onClick={() => setShowArtifactPicker((p) => !p)}
                  className="flex items-center gap-1 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:bg-primary/90 transition-colors"
                >
                  <span className="material-icons text-sm">{showArtifactPicker ? 'close' : 'add'}</span>
                  {showArtifactPicker ? 'Cancel' : 'Link Artifact'}
                </button>
              </div>

              {showArtifactPicker && (
                <div className="bg-accent/30 border border-border rounded-lg p-4 space-y-3">
                  <div className="flex gap-1 flex-wrap">
                    <button
                      onClick={() => setArtifactTypeFilter('')}
                      className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                        !artifactTypeFilter
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-accent text-foreground hover:bg-accent/80'
                      }`}
                    >
                      All
                    </button>
                    {Object.entries(ARTIFACT_LABELS).map(([type, label]) => (
                      <button
                        key={type}
                        onClick={() => setArtifactTypeFilter(type)}
                        className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                          artifactTypeFilter === type
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-accent text-foreground hover:bg-accent/80'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <div className="max-h-48 overflow-y-auto space-y-1">
                    {availableArtifacts
                      .filter((a) => !artifactTypeFilter || a.type === artifactTypeFilter)
                      .filter(
                        (a) =>
                          !artifacts.some(
                            (linked) => linked.artifactType === a.type && linked.artifactId === a.id,
                          ),
                      )
                      .map((a) => (
                        <button
                          key={`${a.type}-${a.id}`}
                          onClick={() => handleAddArtifact(a.type, a.id)}
                          className="w-full flex items-center gap-2 px-3 py-2 text-left rounded-lg hover:bg-accent transition-colors"
                        >
                          <span className="material-icons text-sm text-muted-foreground">
                            {ARTIFACT_ICONS[a.type] || 'attachment'}
                          </span>
                          <span className="text-sm text-foreground truncate">{a.title}</span>
                          <span className="text-[10px] text-muted-foreground ml-auto shrink-0">
                            {ARTIFACT_LABELS[a.type]}
                          </span>
                        </button>
                      ))}
                    {availableArtifacts
                      .filter((a) => !artifactTypeFilter || a.type === artifactTypeFilter)
                      .filter(
                        (a) =>
                          !artifacts.some(
                            (linked) => linked.artifactType === a.type && linked.artifactId === a.id,
                          ),
                      ).length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-4">
                        No available artifacts
                        {artifactTypeFilter ? ` of type "${ARTIFACT_LABELS[artifactTypeFilter]}"` : ''}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {artifactsLoading ? (
                <div className="flex justify-center py-8">
                  <span className="material-icons animate-spin text-primary">refresh</span>
                </div>
              ) : artifacts.length === 0 ? (
                <div className="text-center py-12">
                  <span className="material-icons text-3xl text-muted-foreground/50 block mb-2">
                    attach_file
                  </span>
                  <p className="text-sm text-muted-foreground">No artifacts linked yet</p>
                  <p className="text-xs text-muted-foreground">
                    Link websites, campaigns, proposals, and more
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {artifacts.map((a) => {
                    const url = artifactUrl(a.artifactType, a.artifactId);
                    return (
                      <div
                        key={a.id}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors ${
                          a.pinned ? 'bg-primary/5 border-primary/20' : 'bg-card border-border'
                        }`}
                      >
                        <span className="material-icons text-lg text-muted-foreground">
                          {ARTIFACT_ICONS[a.artifactType] || 'attachment'}
                        </span>
                        {url ? (
                          <a
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-1 min-w-0 group"
                            title="Open artifact"
                          >
                            <p className="text-sm font-medium text-foreground truncate group-hover:text-primary group-hover:underline">
                              {a.displayTitle}
                            </p>
                            <p className="text-[10px] text-muted-foreground">
                              {ARTIFACT_LABELS[a.artifactType]}
                            </p>
                          </a>
                        ) : (
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">
                              {a.displayTitle}
                            </p>
                            <p className="text-[10px] text-muted-foreground">
                              {ARTIFACT_LABELS[a.artifactType]}
                            </p>
                          </div>
                        )}
                        {url && (
                          <a
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1 rounded text-muted-foreground hover:text-primary hover:bg-accent transition-colors"
                            title="Open in new tab"
                          >
                            <span className="material-icons text-sm">open_in_new</span>
                          </a>
                        )}
                        <button
                          onClick={() => togglePin(a.id, !a.pinned)}
                          className={`p-1 rounded transition-colors ${
                            a.pinned
                              ? 'text-primary hover:bg-primary/10'
                              : 'text-muted-foreground hover:bg-accent'
                          }`}
                          title={a.pinned ? 'Unpin' : 'Pin'}
                        >
                          <span className="material-icons text-sm">
                            {a.pinned ? 'push_pin' : 'push_pin'}
                          </span>
                        </button>
                        <button
                          onClick={() => handleRemoveArtifact(a.id)}
                          className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                          title="Remove"
                        >
                          <span className="material-icons text-sm">close</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* === COMMENTS TAB === */}
          {panelTab === 'comments' && (
            <div className="flex flex-col h-full">
              <div className="p-4 border-b border-border space-y-2">
                <div className="relative">
                  <textarea
                    ref={commentInputRef}
                    value={commentBody}
                    onChange={(e) => handleCommentChange(e.target.value)}
                    onKeyDown={handleCommentKeyDown}
                    placeholder="Add a comment... (@ to mention, Cmd+Enter to send)"
                    rows={3}
                    className={inputClass + ' resize-none'}
                  />
                  {showMentions && (
                    <div className="absolute left-0 bottom-full mb-1 w-56 bg-card border border-border rounded-lg shadow-lg max-h-40 overflow-y-auto z-20">
                      {mentionUsers
                        .filter((u) => u.name?.toLowerCase().includes(mentionQuery))
                        .map((u) => (
                          <button
                            key={u.id}
                            onClick={() => insertMention(u)}
                            className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent transition-colors"
                          >
                            <span className="material-icons text-sm text-muted-foreground">person</span>
                            {u.name}
                          </button>
                        ))}
                      {mentionUsers.filter((u) => u.name?.toLowerCase().includes(mentionQuery))
                        .length === 0 && (
                        <p className="px-3 py-2 text-xs text-muted-foreground">No matches</p>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        if (e.target.files)
                          setCommentFiles((prev) => [...prev, ...Array.from(e.target.files!)]);
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <span className="material-icons text-sm">attach_file</span>
                      Attach
                    </button>
                    {commentFiles.length > 0 && (
                      <span className="text-xs text-muted-foreground">
                        {commentFiles.length} file{commentFiles.length > 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={handlePostComment}
                    disabled={postingComment || (!commentBody.trim() && commentFiles.length === 0)}
                    className="flex items-center gap-1 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                  >
                    {postingComment ? (
                      <span className="material-icons animate-spin text-sm">refresh</span>
                    ) : (
                      <span className="material-icons text-sm">send</span>
                    )}
                    Send
                  </button>
                </div>
                {commentFiles.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {commentFiles.map((f, i) => (
                      <span
                        key={i}
                        className="flex items-center gap-1 bg-accent text-xs px-2 py-1 rounded"
                      >
                        <span className="material-icons text-xs">description</span>
                        <span className="truncate max-w-[120px]">{f.name}</span>
                        <button
                          onClick={() => setCommentFiles((prev) => prev.filter((_, j) => j !== i))}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <span className="material-icons text-xs">close</span>
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {commentsLoading ? (
                  <div className="flex justify-center py-8">
                    <span className="material-icons animate-spin text-primary">refresh</span>
                  </div>
                ) : comments.length === 0 ? (
                  <div className="text-center py-12">
                    <span className="material-icons text-3xl text-muted-foreground/50 block mb-2">
                      chat_bubble_outline
                    </span>
                    <p className="text-sm text-muted-foreground">No comments yet</p>
                  </div>
                ) : (
                  comments.map((c) => (
                    <div key={c.id} className="group">
                      <div className="flex items-start gap-2">
                        <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                          <span className="material-icons text-sm text-primary">person</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-foreground">
                              {c.authorName || 'Unknown'}
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              {new Date(c.createdAt).toLocaleString()}
                            </span>
                            <button
                              onClick={() => handleDeleteComment(c.id)}
                              className="ml-auto opacity-0 group-hover:opacity-100 p-0.5 rounded text-muted-foreground hover:text-destructive transition-all"
                              title="Delete"
                            >
                              <span className="material-icons text-xs">delete</span>
                            </button>
                          </div>
                          <div
                            className="text-sm text-foreground mt-0.5 whitespace-pre-wrap"
                            dangerouslySetInnerHTML={{ __html: renderCommentBody(c.body) }}
                          />
                          {c.attachments && c.attachments.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mt-2">
                              {c.attachments.map((att, i) => (
                                <a
                                  key={i}
                                  href={att.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-1.5 bg-accent text-xs text-foreground px-2.5 py-1.5 rounded-lg hover:bg-accent/80 transition-colors"
                                >
                                  <span className="material-icons text-sm text-muted-foreground">
                                    {att.mimeType?.startsWith('image/') ? 'image' : 'description'}
                                  </span>
                                  <span className="truncate max-w-[140px]">{att.filename}</span>
                                </a>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
