'use client';

import { useState, useEffect, useRef, use } from 'react';
import Link from 'next/link';
import type { Block, BlockType, BlockEditorData } from '@/types/blocks';
import { VisualEditorShell } from '@/components/portal/VisualEditorShell';
import { EmailPreviewPane } from '@/components/email/EmailPreviewPane';
import { removeBlockById } from '@/lib/utils/blockHelpers';
import { applyBrandDefaults, type BrandDefaultsContext } from '@/lib/branding/block-defaults';
import { bindEmailToYjs, type EmailYjsBinding } from '@/lib/realtime/email-binding';
import {
  EmailCollaborationProvider,
  useEmailPresence,
} from './_components/EmailCollaborationProvider';
import { EmailPresenceBar } from './_components/EmailPresenceBar';
import { EmailFieldFocusIndicator } from './_components/EmailFieldFocusIndicator';

interface Campaign {
  id: number;
  name: string;
  subject: string;
  previewText: string | null;
  fromName: string;
  fromEmail: string;
  replyTo: string | null;
  listId: number;
  listName: string | null;
  htmlContent: string;
  blockContent: BlockEditorData | null;
  status: string;
  scheduledAt: string | null;
  sentAt: string | null;
  totalRecipients: number;
  totalSent: number;
  totalOpened: number;
  totalClicked: number;
  totalBounced: number;
  totalUnsubscribed: number;
}

interface Send {
  id: number;
  email: string;
  name: string | null;
  sentAt: string | null;
  openedAt: string | null;
  clickedAt: string | null;
  bouncedAt: string | null;
}

const statusColor: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700',
  scheduled: 'bg-blue-100 text-blue-700',
  sending: 'bg-yellow-100 text-yellow-700',
  sent: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
};

export default function PortalCampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <EmailCollaborationProvider entityId={id}>
      <PortalCampaignDetailPageInner id={id} />
    </EmailCollaborationProvider>
  );
}

function PortalCampaignDetailPageInner({ id }: { id: string }) {
  const presence = useEmailPresence();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [sends, setSends] = useState<Send[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ sent: number; failed: number; total: number } | null>(null);
  const [tab, setTab] = useState<'overview' | 'content' | 'sends'>('overview');

  // Edit state
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ subject: '', previewText: '', htmlContent: '' });
  const [editBlocks, setEditBlocks] = useState<Block[]>([]);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    fetch(`/api/portal/email/campaigns/${id}`)
      .then(r => r.json())
      .then(d => {
        setCampaign(d.data?.campaign ?? null);
        setSends(d.data?.sends ?? []);
        setLoading(false);
      });
  }, [id]);

  // Brand defaults — pre-fill new email blocks (header logo, footer company name, etc.)
  const [brandDefaults, setBrandDefaults] = useState<BrandDefaultsContext | null>(null);
  useEffect(() => {
    fetch('/api/portal/branding/defaults')
      .then(r => r.json())
      .then(d => { if (d.success && d.data) setBrandDefaults(d.data); })
      .catch(() => {});
  }, []);

  const hasBlockContent = !!campaign?.blockContent?.blocks;

  // ── Yjs binding for the blocks variant ───────────────────────────────
  // Only attach when (a) the campaign uses blockContent (not htmlContent),
  // (b) we're in edit mode, and (c) the realtime ydoc is available. The
  // binding seeds the Y.Doc with local state on first connect, and routes
  // subsequent local edits through `applyLocalBlocks` so peers receive
  // them. Remote edits flow back through onRemoteBlocks → setEditBlocks.
  const bindingRef = useRef<EmailYjsBinding | null>(null);
  const editingRef = useRef(false);
  editingRef.current = editing;

  useEffect(() => {
    bindingRef.current = null;
    if (!editing || !hasBlockContent) return;
    const ydoc = presence.ydoc;
    if (!ydoc) return;
    const binding = bindEmailToYjs({
      ydoc,
      initialBlocks: editBlocks,
      onRemoteBlocks: (remote) => {
        // Skip remote echoes after we've already left edit mode.
        if (!editingRef.current) return;
        setEditBlocks(remote);
      },
    });
    bindingRef.current = binding;
    return () => {
      binding.unbind();
      if (bindingRef.current === binding) bindingRef.current = null;
    };
    // editBlocks intentionally omitted — we only (re)bind when the editor
    // opens, the doc rotates, or the variant changes. Subsequent edits
    // flow through handleEditBlocksChange.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, hasBlockContent, presence.ydoc]);

  /**
   * Single funnel for any local block-array mutation made from the visual
   * editor. When a binding is attached, push the new state through Yjs so
   * peers sync; when unbound (realtime disabled / not yet connected), fall
   * through to a plain setState so editing still works offline.
   */
  function handleEditBlocksChange(next: Block[]) {
    setEditBlocks(next);
    bindingRef.current?.applyLocalBlocks(next);
  }

  function startEdit() {
    if (!campaign) return;
    setEditForm({ subject: campaign.subject, previewText: campaign.previewText ?? '', htmlContent: campaign.htmlContent });
    if (campaign.blockContent?.blocks) {
      setEditBlocks(campaign.blockContent.blocks);
    }
    setEditing(true);
    setTab('content');
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    setEditSaving(true);
    setEditError('');

    const payload: Record<string, unknown> = { ...editForm };
    if (hasBlockContent) {
      payload.blockContent = { blocks: editBlocks, version: '1' };
    }

    const res = await fetch(`/api/portal/email/campaigns/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    setEditSaving(false);
    if (!data.success) { setEditError(data.message ?? 'Save failed'); return; }
    setCampaign(prev => prev ? { ...prev, ...editForm, blockContent: hasBlockContent ? { blocks: editBlocks, version: '1' } : prev.blockContent } : prev);
    setEditing(false);
  }

  async function sendCampaign() {
    if (!campaign) return;
    if (!confirm(`Send "${campaign.name}" to all active subscribers now?`)) return;
    setSending(true);
    const res = await fetch(`/api/portal/email/campaigns/${id}/send`, { method: 'POST' });
    const data = await res.json();
    setSending(false);
    if (!data.success) { alert(data.message); return; }
    setSendResult(data.data);
    setCampaign(prev => prev ? { ...prev, status: 'sent', sentAt: new Date().toISOString(), totalSent: data.data.sent } : prev);
  }

  if (loading) return <div className="p-6 text-muted-foreground text-sm">Loading…</div>;
  if (!campaign) return <div className="p-6 text-muted-foreground text-sm">Campaign not found.</div>;

  const openRate = campaign.totalSent > 0 ? Math.round(campaign.totalOpened / campaign.totalSent * 100) : 0;
  const clickRate = campaign.totalSent > 0 ? Math.round(campaign.totalClicked / campaign.totalSent * 100) : 0;
  const bounceRate = campaign.totalSent > 0 ? Math.round(campaign.totalBounced / campaign.totalSent * 100) : 0;

  const inputClass = 'w-full border border-border rounded-md px-3 py-2 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary';

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-2">
          <Link href="/portal/email/campaigns" className="text-muted-foreground hover:text-foreground">
            <span className="material-icons text-base">arrow_back</span>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-foreground">{campaign.name}</h1>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor[campaign.status] ?? 'bg-gray-100 text-gray-700'}`}>
                {campaign.status}
              </span>
            </div>
            <p className="text-muted-foreground text-sm mt-0.5">{campaign.subject}</p>
          </div>
        </div>
        <div className="flex gap-2 shrink-0 items-center">
          <EmailPresenceBar />
          {campaign.status === 'draft' && !editing && (
            <button onClick={startEdit}
              className="flex items-center gap-1.5 px-3 py-2 border border-border rounded-lg text-sm text-foreground hover:bg-accent transition-colors">
              <span className="material-icons text-base">edit</span>
              Edit
            </button>
          )}
          {(campaign.status === 'draft' || campaign.status === 'scheduled') && (
            <button onClick={sendCampaign} disabled={sending}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors">
              <span className="material-icons text-base">{sending ? 'hourglass_empty' : 'send'}</span>
              {sending ? 'Sending…' : 'Send Now'}
            </button>
          )}
        </div>
      </div>

      {sendResult && (
        <div className="bg-green-50 border border-green-200 text-green-800 text-sm px-4 py-3 rounded-lg">
          Sent successfully: {sendResult.sent} delivered{sendResult.failed > 0 ? `, ${sendResult.failed} failed` : ''}.
        </div>
      )}

      {/* Stats */}
      {campaign.status === 'sent' && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Sent', value: campaign.totalSent, icon: 'send' },
            { label: 'Open Rate', value: `${openRate}%`, icon: 'drafts' },
            { label: 'Click Rate', value: `${clickRate}%`, icon: 'touch_app' },
            { label: 'Bounce Rate', value: `${bounceRate}%`, icon: 'error_outline' },
          ].map(stat => (
            <div key={stat.label} className="bg-card border border-border rounded-lg p-4">
              <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
                <span className="material-icons text-sm">{stat.icon}</span>
                <span className="text-xs">{stat.label}</span>
              </div>
              <p className="text-xl font-bold text-foreground">{stat.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-border flex gap-1">
        {(['overview', 'content', 'sends'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium capitalize border-b-2 transition-colors ${tab === t ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
            {t}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="bg-card border border-border rounded-lg divide-y divide-border">
          {[
            { label: 'From', value: `${campaign.fromName} <${campaign.fromEmail}>` },
            { label: 'Reply-To', value: campaign.replyTo ?? '—' },
            { label: 'List', value: campaign.listName ?? '—' },
            { label: 'Preview Text', value: campaign.previewText ?? '—' },
            { label: 'Sent At', value: campaign.sentAt ? new Date(campaign.sentAt).toLocaleString() : '—' },
            { label: 'Unsubscribes', value: campaign.totalUnsubscribed },
          ].map(row => (
            <div key={row.label} className="flex px-5 py-3 gap-4">
              <span className="text-sm text-muted-foreground w-28 shrink-0">{row.label}</span>
              <span className="text-sm text-foreground">{row.value}</span>
            </div>
          ))}
        </div>
      )}

      {tab === 'content' && (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <h3 className="font-semibold text-foreground">{editing ? 'Edit Content' : 'Email Preview'}</h3>
            {editing && hasBlockContent && (
              <button type="button" onClick={() => setShowPreview(!showPreview)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${showPreview ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent'}`}>
                <span className="material-icons text-sm align-middle mr-1">preview</span>
                Preview
              </button>
            )}
          </div>
          {editing ? (
            <div>
              <div className="p-5 space-y-4">
                {editError && <p className="text-sm text-red-600">{editError}</p>}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">Subject *</label>
                    <EmailFieldFocusIndicator fieldPath="subject">
                      <input
                        required
                        value={editForm.subject}
                        onChange={e => setEditForm(p => ({ ...p, subject: e.target.value }))}
                        onFocus={() => presence.setFocusedField('subject')}
                        onBlur={() => presence.setFocusedField(null)}
                        className={inputClass}
                      />
                    </EmailFieldFocusIndicator>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-1">Preview Text</label>
                    <EmailFieldFocusIndicator fieldPath="previewText">
                      <input
                        value={editForm.previewText}
                        onChange={e => setEditForm(p => ({ ...p, previewText: e.target.value }))}
                        onFocus={() => presence.setFocusedField('previewText')}
                        onBlur={() => presence.setFocusedField(null)}
                        className={inputClass}
                      />
                    </EmailFieldFocusIndicator>
                  </div>
                </div>
              </div>

              {hasBlockContent ? (
                <div className={showPreview ? 'flex gap-4 p-4' : 'p-4'}>
                  <div className={`${showPreview ? 'flex-1 min-w-0' : 'w-full'}`}>
                    <div className="rounded-xl overflow-hidden [&>div]:!h-[calc(100vh-340px)]" style={{ minHeight: '500px' }}>
                      <VisualEditorShell
                        key={`email-edit-${campaign.id}`}
                        blocks={editBlocks}
                        selectedBlockId={null}
                        viewport="desktop"
                        previewMode={false}
                        initialZoom={100}
                        iframeSrc="/portal/email/editor-preview?_edit=true"
                        onBlocksChange={handleEditBlocksChange}
                        onSelectBlock={(blockId) => {
                          presence.setSelection(blockId ? { blockId } : null);
                        }}
                        onAddBlock={(type: string) => {
                          const id = `block-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
                          let newBlock = { id, type: type as BlockType, order: editBlocks.length + 1, content: type === 'text' ? 'New text...' : type === 'heading' ? 'New heading' : undefined, level: type === 'heading' ? 2 : undefined } as Block;
                          if (brandDefaults) newBlock = applyBrandDefaults(newBlock, brandDefaults);
                          handleEditBlocksChange([...editBlocks, newBlock]);
                        }}
                        onDeleteBlock={(blockId: string) => handleEditBlocksChange(removeBlockById(editBlocks, blockId))}
                        onUpdateBlock={(blockId: string, updates: Partial<Block>) => handleEditBlocksChange(editBlocks.map(b => b.id === blockId ? { ...b, ...updates } as Block : b))}
                        siteId={undefined}
                      />
                    </div>
                  </div>
                  {showPreview && (
                    <div className="w-[380px] shrink-0 bg-card border border-border rounded-xl overflow-hidden" style={{ height: 'calc(100vh - 340px)' }}>
                      <EmailPreviewPane blocks={editBlocks} />
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-5 pt-0">
                  <label className="block text-sm font-medium text-foreground mb-1">HTML Content *</label>
                  <textarea required value={editForm.htmlContent} onChange={e => setEditForm(p => ({ ...p, htmlContent: e.target.value }))}
                    rows={16} className={`${inputClass} font-mono text-xs`} />
                </div>
              )}

              <div className="flex gap-2 p-5 pt-0">
                <button type="button" onClick={saveEdit} disabled={editSaving}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 disabled:opacity-50">
                  {editSaving ? 'Saving...' : 'Save Changes'}
                </button>
                <button type="button" onClick={() => setEditing(false)}
                  className="px-4 py-2 border border-border rounded-md text-sm text-muted-foreground hover:bg-accent">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="p-5">
              <div className="border border-border rounded-md p-6 bg-white text-sm max-w-2xl mx-auto overflow-auto"
                dangerouslySetInnerHTML={{ __html: campaign.htmlContent }} />
            </div>
          )}
        </div>
      )}

      {tab === 'sends' && (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <h3 className="font-semibold text-foreground">Send Log ({sends.length})</h3>
          </div>
          {sends.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">No sends recorded yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="text-left px-5 py-2.5 font-medium text-muted-foreground">Recipient</th>
                  <th className="text-center px-3 py-2.5 font-medium text-muted-foreground">Sent</th>
                  <th className="text-center px-3 py-2.5 font-medium text-muted-foreground">Opened</th>
                  <th className="text-center px-3 py-2.5 font-medium text-muted-foreground">Clicked</th>
                  <th className="text-center px-3 py-2.5 font-medium text-muted-foreground">Bounced</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {sends.map(s => (
                  <tr key={s.id}>
                    <td className="px-5 py-2.5">
                      <p className="text-foreground">{s.email}</p>
                      {s.name && <p className="text-xs text-muted-foreground">{s.name}</p>}
                    </td>
                    {[s.sentAt, s.openedAt, s.clickedAt].map((ts, i) => (
                      <td key={i} className="px-3 py-2.5 text-center">
                        <span className={`material-icons text-base ${ts ? 'text-green-500' : 'text-muted-foreground'}`}>
                          {ts ? 'check_circle' : 'radio_button_unchecked'}
                        </span>
                      </td>
                    ))}
                    <td className="px-3 py-2.5 text-center">
                      <span className={`material-icons text-base ${s.bouncedAt ? 'text-red-500' : 'text-muted-foreground'}`}>
                        {s.bouncedAt ? 'error' : 'radio_button_unchecked'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
