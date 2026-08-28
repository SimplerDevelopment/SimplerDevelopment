'use client';

import { useState, useEffect, useRef, useCallback, use } from 'react';
import { useCampaignSendingPoll } from '@/components/portal/email/use-campaign-sending-poll';
import Link from 'next/link';
import { sanitizeRichHtml } from '@/lib/security/sanitize-html';
import type { Block } from '@/types/blocks';
import type { BrandDefaultsContext } from '@/lib/branding/block-defaults';
import { bindEmailToYjs, type EmailYjsBinding } from '@/lib/realtime/email-binding';
import {
  EmailCollaborationProvider,
  useEmailPresence,
} from './_components/EmailCollaborationProvider';
import { EmailPresenceBar } from './_components/EmailPresenceBar';
import { EmailAbConfig } from './_components/EmailAbConfig';
import { CampaignSendsTab, type Send } from './_components/CampaignSendsTab';
import { CampaignStatsGrid } from './_components/CampaignStatsGrid';
import { CampaignOverviewInfo } from './_components/CampaignOverviewInfo';
import { CampaignContentEditor } from './_components/CampaignContentEditor';
import type { Campaign } from './_components/campaign-types';
import { PortalPageHeader } from '@/components/portal/PortalPageHeader';
import { pBtnPrimary, pBtnGhost, pCard, pCardPad, pInput, pSectionTitle, sBtnGhost } from '@/components/portal/portal-ui';
import { useFeatureFlag } from '@/components/portal/FeatureFlagsProvider';
import CampaignScheduleAction from './_components/CampaignScheduleAction';
import CampaignSettingsPreview from './_components/CampaignSettingsPreview';
import { scheduledLabel } from '@/lib/email/campaign-rates';

const statusColor: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  scheduled: 'bg-blue-100 text-blue-700',
  sending: 'bg-yellow-100 text-yellow-700',
  ab_testing: 'bg-purple-100 text-purple-700',
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
  const [sendResult, setSendResult] = useState<{ queued: true; totalTargets: number } | null>(null);
  const [tab, setTab] = useState<'overview' | 'content' | 'sends'>('overview');
  // PUX-175 (design doc screen 34): preview beside settings, the A/B panel as its own card, stats as soon as
  // anything sent, Schedule as the one teal. Flag off is today's three tabs.
  const studio = useFeatureFlag('portal-redesign');

  // Edit state
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ subject: '', previewText: '', htmlContent: '' });
  const [editBlocks, setEditBlocks] = useState<Block[]>([]);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/portal/email/campaigns/${id}`)
      .then(r => r.json())
      .then(d => {
        setCampaign(d.data?.campaign ?? null);
        setSends(d.data?.sends ?? []);
        setLoading(false);
      });
  }, [id]);

  // Durable async send (PUX-046): poll for the terminal status — see the hook.
  const onSendingPollData = useCallback((data: unknown) => {
    const d = data as { campaign?: Campaign; sends?: Send[] } | null;
    setCampaign(d?.campaign ?? null);
    setSends(d?.sends ?? []);
  }, []);
  useCampaignSendingPoll(id, campaign?.status === 'sending', onSendingPollData);

  // Brand defaults — pre-fill new email blocks (header logo, footer company name, etc.)
  const [brandDefaults, setBrandDefaults] = useState<BrandDefaultsContext | null>(null);
  useEffect(() => {
    fetch('/api/portal/branding/defaults')
      .then(r => r.json())
      .then(d => { if (d.success && d.data) setBrandDefaults(d.data); })
      .catch(() => {});
  }, []);

  const hasBlockContent = !!campaign?.blockContent?.blocks || !!(campaign?.contentBlocks && campaign.contentBlocks.length > 0);

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
    if (campaign.contentBlocks && campaign.contentBlocks.length > 0) {
      setEditBlocks(campaign.contentBlocks);
    } else if (campaign.blockContent?.blocks) {
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
      // Also store as the new flat contentBlocks tree so the cached
      // block-builder send path picks it up. useBlockEditor stays whatever
      // the user opted into; default keeps existing template flow intact.
      payload.contentBlocks = editBlocks;
    }

    const res = await fetch(`/api/portal/email/campaigns/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    setEditSaving(false);
    if (!data.success) { setEditError(data.message ?? 'Save failed'); return; }
    setCampaign(prev => prev ? {
      ...prev,
      ...editForm,
      blockContent: hasBlockContent ? { blocks: editBlocks, version: '1' } : prev.blockContent,
      contentBlocks: hasBlockContent ? editBlocks : prev.contentBlocks,
    } : prev);
    setEditing(false);
  }

  async function toggleUseBlockEditor() {
    if (!campaign) return;
    const next = !campaign.useBlockEditor;
    const res = await fetch(`/api/portal/email/campaigns/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ useBlockEditor: next }),
    });
    const data = await res.json();
    if (data.success) {
      setCampaign(prev => prev ? { ...prev, useBlockEditor: next } : prev);
    }
  }

  async function sendTestEmail() {
    if (!campaign) return;
    setSendingTest(true);
    setTestResult(null);
    const blocks = hasBlockContent && editBlocks.length > 0
      ? editBlocks
      : campaign.contentBlocks ?? campaign.blockContent?.blocks ?? [];
    if (!blocks || blocks.length === 0) {
      setTestResult('No blocks to render');
      setSendingTest(false);
      return;
    }
    const res = await fetch('/api/portal/email/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        campaignId: campaign.id,
        subject: editing ? editForm.subject : campaign.subject,
        preheader: editing ? editForm.previewText : campaign.previewText,
        blocks,
        sendTest: true,
      }),
    });
    const data = await res.json();
    setSendingTest(false);
    if (!data.success) {
      setTestResult(data.message ?? 'Failed to send test');
      return;
    }
    if (data.data?.testSent?.ok) {
      setTestResult(`Test sent to ${data.data.testSent.to}`);
    } else if (data.data?.testSent) {
      setTestResult(`Test failed to send to ${data.data.testSent.to}`);
    } else {
      setTestResult('Test rendered (no recipient)');
    }
  }

  async function sendCampaign() {
    if (!campaign) return;
    if (!confirm(`Send "${campaign.name}" to all active subscribers now?`)) return;
    setSending(true);
    const res = await fetch(`/api/portal/email/campaigns/${id}/send`, { method: 'POST' });
    const data = await res.json();
    setSending(false);
    if (!data.success) { alert(data.message); return; }
    // Route queues the send + flips status server-side; the poll catches the end.
    setSendResult(data.data);
    setCampaign(prev => prev ? { ...prev, status: 'sending' } : prev);
  }

  if (loading) return <div className="p-6 text-muted-foreground text-sm">Loading…</div>;
  if (!campaign) return <div className="p-6 text-muted-foreground text-sm">Campaign not found.</div>;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <Link href="/portal/email/campaigns" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-3">
          <span className="material-icons text-base">arrow_back</span>
          Campaigns
        </Link>
        <PortalPageHeader
          eyebrow="Email"
          title={
            <span className="flex items-center gap-2 flex-wrap">
              {campaign.name}
              <span className={`text-base font-normal px-2 py-0.5 rounded-full ${statusColor[campaign.status] ?? 'bg-muted text-muted-foreground'}`}>{campaign.status}</span>
            </span>
          }
          subtitle={campaign.subject}
          actions={
            <div className="flex items-center gap-2">
              <EmailPresenceBar />
              {campaign.status === 'draft' && !editing && (
                <button onClick={startEdit} className={studio ? sBtnGhost : pBtnGhost}>
                  <span className="material-icons text-base">edit</span>Edit
                </button>
              )}
              {campaign.status === 'draft' && (campaign.useBlockEditor || hasBlockContent) && (
                <button
                  onClick={sendTestEmail}
                  disabled={sendingTest}
                  className={`${studio ? sBtnGhost : pBtnGhost} disabled:opacity-50`}
                  title="Send the rendered email to your own address"
                >
                  <span className="material-icons text-base">science</span>
                  {sendingTest ? 'Sending…' : 'Send test'}
                </button>
              )}
              {(campaign.status === 'draft' || campaign.status === 'scheduled') && (
                <button onClick={sendCampaign} disabled={sending} className={`${studio ? sBtnGhost : pBtnPrimary} disabled:opacity-50`}>
                  <span className="material-icons text-base">{sending ? 'hourglass_empty' : 'send'}</span>
                  {sending ? 'Sending…' : studio ? 'Send now' : 'Send Now'}
                </button>
              )}
              {studio && (campaign.status === 'draft' || campaign.status === 'scheduled') && (
                <CampaignScheduleAction campaignId={String(campaign.id)} scheduledAt={campaign.scheduledAt} disabled={sending}
                  onScheduled={(patch) => setCampaign(prev => prev ? { ...prev, ...patch } : prev)} />
              )}
            </div>
          }
        />
      </div>

      {sendResult && (
        <div className="bg-blue-50 border border-blue-200 text-blue-800 text-sm px-4 py-3 rounded-lg">
          Queued — sending to {sendResult.totalTargets} subscriber{sendResult.totalTargets === 1 ? '' : 's'} in the background.
        </div>
      )}

      {testResult && (
        <div className="bg-blue-50 border border-blue-200 text-blue-800 text-sm px-4 py-3 rounded-lg flex items-center justify-between">
          <span>{testResult}</span>
          <button onClick={() => setTestResult(null)} className="text-blue-700 hover:text-blue-900">
            <span className="material-icons text-base">close</span>
          </button>
        </div>
      )}

      {/* Stats — studio: as soon as anything has been sent (a test batch counts); legacy: only once status is 'sent' */}
      {(studio ? campaign.totalSent > 0 : campaign.status === 'sent') && (
        <CampaignStatsGrid campaign={campaign} />
      )}

      {studio && !editing && (
        <CampaignSettingsPreview
          campaign={campaign}
          blocks={hasBlockContent ? ((campaign.contentBlocks && campaign.contentBlocks.length > 0 ? campaign.contentBlocks : campaign.blockContent?.blocks) as Block[] | null ?? null) : null}
          sendTime={campaign.status === 'sent' && campaign.sentAt ? `Sent ${new Date(campaign.sentAt).toLocaleString()}` : campaign.scheduledAt ? `Scheduled ${scheduledLabel(campaign.scheduledAt)}` : 'Not scheduled — use Schedule above'}
          onEdit={campaign.status === 'draft' ? startEdit : undefined}
        />
      )}
      {studio && (
        <EmailAbConfig
          campaign={campaign}
          onChange={(patch) => setCampaign(prev => prev ? { ...prev, ...patch } as Campaign : prev)}
        />
      )}

      {/* Tabs (legacy) */}
      {!studio && <div className="border-b border-border flex gap-1">
        {(['overview', 'content', 'sends'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium capitalize border-b-2 transition-colors ${tab === t ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
            {t}
          </button>
        ))}
      </div>}

      {!studio && tab === 'overview' && (
        <>
        <EmailAbConfig
          campaign={campaign}
          onChange={(patch) => setCampaign(prev => prev ? { ...prev, ...patch } as Campaign : prev)}
        />
        <CampaignOverviewInfo campaign={campaign} onToggleUseBlockEditor={toggleUseBlockEditor} />
        </>
      )}

      {(studio ? editing : tab === 'content') && (
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <h3 className="font-semibold text-foreground">{editing ? 'Edit Content' : 'Email Preview'}</h3>
            {editing && hasBlockContent && (
              <button type="button" onClick={() => setShowPreview(!showPreview)}
                className={`px-3 py-1 text-xs font-medium rounded-xl transition-colors ${showPreview ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent'}`}>
                <span className="material-icons text-sm align-middle mr-1">preview</span>
                Preview
              </button>
            )}
          </div>
          {editing ? (
            <CampaignContentEditor
              campaign={campaign}
              editForm={editForm}
              setEditForm={setEditForm}
              editBlocks={editBlocks}
              onBlocksChange={handleEditBlocksChange}
              editError={editError}
              editSaving={editSaving}
              onSave={saveEdit}
              onCancel={() => setEditing(false)}
              showPreview={showPreview}
              hasBlockContent={hasBlockContent}
              brandDefaults={brandDefaults}
              presence={presence}
            />
          ) : (
            <div className="p-5">
              <div className="border border-border rounded-xl p-6 bg-white text-sm max-w-2xl mx-auto overflow-auto"
                dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(campaign.htmlContent) }} />
            </div>
          )}
        </div>
      )}

      {(studio || tab === 'sends') && (
        <CampaignSendsTab sends={sends} />
      )}
    </div>
  );
}
