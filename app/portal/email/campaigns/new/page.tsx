'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { Block, BlockType } from '@/types/blocks';
import { VisualEditorShell } from '@/components/portal/VisualEditorShell';
import { EmailPreviewPane } from '@/components/email/EmailPreviewPane';

interface EmailList {
  id: number;
  name: string;
  subscriberCount: number;
}

type EditorMode = 'visual' | 'html';

export default function NewPortalCampaignPage() {
  const router = useRouter();
  const [lists, setLists] = useState<EmailList[]>([]);
  const [form, setForm] = useState({
    name: '',
    subject: '',
    previewText: '',
    fromName: '',
    fromEmail: '',
    replyTo: '',
    listId: '',
    htmlContent: '',
  });
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [editorMode, setEditorMode] = useState<EditorMode>('visual');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [settingsCollapsed, setSettingsCollapsed] = useState(false);
  const [editorLeftCollapsed, setEditorLeftCollapsed] = useState(false);
  const [editorRightCollapsed, setEditorRightCollapsed] = useState(false);
  const [showEmailPreview, setShowEmailPreview] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);

  useEffect(() => {
    fetch('/api/portal/email/lists')
      .then(r => r.json())
      .then(d => setLists(d.data ?? []));
  }, []);

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(p => ({ ...p, [field]: e.target.value }));

  async function save() {
    setSaving(true);
    setError('');

    const payload: Record<string, unknown> = { ...form };
    if (editorMode === 'visual') {
      payload.blockContent = { blocks, version: '1' };
      if (!payload.htmlContent) payload.htmlContent = '';
    }

    const res = await fetch('/api/portal/email/campaigns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    setSaving(false);
    if (!data.success) { setError(data.message ?? 'Failed to create campaign'); return; }
    router.push(`/portal/email/campaigns/${data.data.id}`);
  }

  function handleBlocksChange(newBlocks: Block[]) {
    setBlocks(newBlocks);
  }

  const inputClass = 'w-full border border-border rounded-md px-3 py-2 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary';
  const labelClass = 'block text-xs font-medium text-muted-foreground mb-1';

  const canSave = form.name.trim() && form.subject.trim() && form.fromName.trim() && form.fromEmail.trim() && form.listId && (editorMode === 'visual' ? blocks.length > 0 : form.htmlContent.trim());

  return (
    <div className="w-full space-y-4 px-2">
      {/* Header — modeled after pitch deck editor */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/portal/email/campaigns"
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <span className="material-icons">arrow_back</span>
          </Link>
          <div>
            <h1 className="text-xl font-bold text-foreground">New Campaign</h1>
            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
              <span className="inline-flex items-center gap-1">
                <span className="material-icons text-xs">edit_note</span>
                Draft
              </span>
              {blocks.length > 0 && (
                <>
                  <span>·</span>
                  <span>{blocks.length} block{blocks.length !== 1 ? 's' : ''}</span>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Editor mode toggle */}
          <div className="inline-flex rounded-lg border border-border overflow-hidden">
            <button
              onClick={() => setEditorMode('visual')}
              className={`px-3 py-1.5 text-xs font-medium flex items-center gap-1 transition-colors ${
                editorMode === 'visual' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent'
              }`}
            >
              <span className="material-icons text-sm">dashboard</span>
              Visual
            </button>
            <button
              onClick={() => setEditorMode('html')}
              className={`px-3 py-1.5 text-xs font-medium flex items-center gap-1 transition-colors ${
                editorMode === 'html' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent'
              }`}
            >
              <span className="material-icons text-sm">code</span>
              HTML
            </button>
          </div>

          {editorMode === 'visual' && (
            <button
              onClick={() => setShowEmailPreview(!showEmailPreview)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-border rounded-lg transition-colors ${
                showEmailPreview ? 'bg-primary/10 text-primary border-primary' : 'text-muted-foreground hover:text-foreground hover:bg-accent'
              }`}
            >
              <span className="material-icons text-base">email</span>
              Email Preview
            </button>
          )}

          <button
            onClick={save}
            disabled={saving || !canSave}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 transition-all"
          >
            {saving ? (
              <span className="material-icons animate-spin text-base">autorenew</span>
            ) : (
              <span className="material-icons text-base">save</span>
            )}
            {saving ? 'Saving...' : 'Save Campaign'}
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-3 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-400 text-sm">
          <span className="material-icons">error</span>
          {error}
          <button onClick={() => setError('')} className="ml-auto"><span className="material-icons text-base">close</span></button>
        </div>
      )}

      {/* Main layout — settings sidebar + editor */}
      <div className="flex gap-4">
        {/* Settings sidebar — collapsible, like the slides panel */}
        <div className={`shrink-0 transition-all duration-200 ${settingsCollapsed ? 'w-12' : 'w-72'}`}>
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            {settingsCollapsed ? (
              <>
                <button
                  onClick={() => setSettingsCollapsed(false)}
                  className="w-full p-2 border-b border-border text-muted-foreground hover:text-foreground transition-colors"
                  title="Expand settings"
                >
                  <span className="material-icons text-base">chevron_right</span>
                </button>
                <div className="flex flex-col items-center gap-2 py-3">
                  <span className="material-icons text-sm text-muted-foreground" title="Campaign details">campaign</span>
                  <span className="material-icons text-sm text-muted-foreground" title="Sender">person</span>
                  <span className="material-icons text-sm text-muted-foreground" title="Recipients">group</span>
                </div>
              </>
            ) : (
              <>
                <div className="p-3 border-b border-border flex items-center justify-between">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Settings</span>
                  <button
                    onClick={() => setSettingsCollapsed(true)}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                    title="Collapse settings"
                  >
                    <span className="material-icons text-base">chevron_left</span>
                  </button>
                </div>
                <div className="max-h-[calc(100vh-220px)] overflow-y-auto p-4 space-y-5">
                  {/* Campaign Details */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      <span className="material-icons text-sm">campaign</span>
                      Campaign
                    </div>
                    <div>
                      <label className={labelClass}>Name *</label>
                      <input value={form.name} onChange={set('name')} className={inputClass} placeholder="e.g. March Newsletter" />
                    </div>
                    <div>
                      <label className={labelClass}>Subject Line *</label>
                      <input value={form.subject} onChange={set('subject')} className={inputClass} placeholder="What's your email about?" />
                    </div>
                    <div>
                      <label className={labelClass}>Preview Text</label>
                      <input value={form.previewText} onChange={set('previewText')} className={inputClass} placeholder="Short summary in inbox" />
                    </div>
                  </div>

                  <hr className="border-border" />

                  {/* Sender */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      <span className="material-icons text-sm">person</span>
                      Sender
                    </div>
                    <div>
                      <label className={labelClass}>From Name *</label>
                      <input value={form.fromName} onChange={set('fromName')} className={inputClass} placeholder="Your Name or Company" />
                    </div>
                    <div>
                      <label className={labelClass}>From Email *</label>
                      <input type="email" value={form.fromEmail} onChange={set('fromEmail')} className={inputClass} placeholder="hello@yourdomain.com" />
                    </div>
                    <div>
                      <label className={labelClass}>Reply-To</label>
                      <input type="email" value={form.replyTo} onChange={set('replyTo')} className={inputClass} placeholder="Optional" />
                    </div>
                  </div>

                  <hr className="border-border" />

                  {/* Recipients */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      <span className="material-icons text-sm">group</span>
                      Recipients
                    </div>
                    <div>
                      <label className={labelClass}>Subscriber List *</label>
                      <select value={form.listId} onChange={set('listId')} className={inputClass}>
                        <option value="">Select a list...</option>
                        {lists.map(l => (
                          <option key={l.id} value={l.id}>{l.name} ({l.subscriberCount})</option>
                        ))}
                      </select>
                      {lists.length === 0 && (
                        <p className="text-xs text-muted-foreground mt-1">
                          <Link href="/portal/email/lists" className="text-primary hover:underline">Create a list first</Link>
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Editor area */}
        <div className="flex-1 min-w-0 space-y-4">
          {editorMode === 'visual' ? (
            <div className={showEmailPreview ? 'flex gap-4' : ''}>
              <div className={`${showEmailPreview ? 'flex-1 min-w-0' : 'w-full'}`}>
                {/* Visual Editor Shell — same as pitch deck */}
                <div className="rounded-xl overflow-hidden [&>div]:!h-[calc(100vh-180px)]" style={{ minHeight: '600px' }}>
                  <VisualEditorShell
                    key={`email-editor`}
                    blocks={blocks}
                    selectedBlockId={null}
                    viewport="desktop"
                    previewMode={previewMode}
                    initialZoom={100}
                    leftCollapsed={editorLeftCollapsed}
                    rightCollapsed={editorRightCollapsed}
                    onLeftCollapsedChange={setEditorLeftCollapsed}
                    onRightCollapsedChange={setEditorRightCollapsed}
                    iframeSrc={`/portal/email/editor-preview?${previewMode ? '' : '_edit=true'}`}
                    onBlocksChange={handleBlocksChange}
                    onSelectBlock={() => {}}
                    onAddBlock={(type: string) => {
                      const newBlock = createEmailBlock(type as BlockType, blocks.length + 1);
                      handleBlocksChange([...blocks, newBlock]);
                    }}
                    onDeleteBlock={(blockId: string) => {
                      handleBlocksChange(blocks.filter(b => b.id !== blockId));
                    }}
                    onUpdateBlock={(blockId: string, updates: Partial<Block>) => {
                      handleBlocksChange(blocks.map(b => b.id === blockId ? { ...b, ...updates } as Block : b));
                    }}
                    siteId={undefined}
                  />
                </div>
              </div>

              {showEmailPreview && (
                <div className="w-[400px] shrink-0 bg-card border border-border rounded-xl overflow-hidden" style={{ height: 'calc(100vh - 180px)' }}>
                  <EmailPreviewPane blocks={blocks} />
                </div>
              )}
            </div>
          ) : (
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-border">
                <h3 className="text-sm font-semibold text-foreground">Raw HTML Content</h3>
              </div>
              <div className="p-5 space-y-3">
                <textarea
                  value={form.htmlContent}
                  onChange={set('htmlContent')}
                  rows={24}
                  className={`${inputClass} font-mono text-xs`}
                  placeholder={`<h1>Hello,</h1>\n<p>Your email content here...</p>`}
                />
                <p className="text-xs text-muted-foreground">
                  Write HTML directly. An unsubscribe footer is added automatically on send.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function createEmailBlock(type: BlockType, order: number): Block {
  const id = `block-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const base = { id, order, type };

  switch (type) {
    case 'text':
      return { ...base, type: 'text', content: 'Start writing your email content...', alignment: 'left', size: 'base' };
    case 'heading':
      return { ...base, type: 'heading', content: 'Email Heading', level: 2, alignment: 'left' };
    case 'image':
      return { ...base, type: 'image', url: '', alt: '', width: 'full', alignment: 'center' };
    case 'button':
      return { ...base, type: 'button', text: 'Click Here', url: '', variant: 'primary', size: 'md', alignment: 'center' };
    case 'spacer':
      return { ...base, type: 'spacer', height: 'md' };
    case 'divider':
      return { ...base, type: 'divider', lineStyle: 'solid' };
    case 'columns':
      return { ...base, type: 'columns', columns: [
        { id: `col-${Date.now()}-1`, width: 50, blocks: [] },
        { id: `col-${Date.now()}-2`, width: 50, blocks: [] },
      ], gap: 'md' };
    case 'quote':
      return { ...base, type: 'quote', content: 'Add a memorable quote...', author: '' };
    case 'section':
      return { ...base, type: 'section', blocks: [] };
    case 'social-links':
      return { ...base, type: 'social-links', links: [], alignment: 'center' };
    case 'email-header':
      return { ...base, type: 'email-header', alignment: 'center' };
    case 'email-footer':
      return { ...base, type: 'email-footer', showUnsubscribe: true };
    default:
      return { ...base, type: 'text', content: 'New block', alignment: 'left', size: 'base' };
  }
}
