'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { Block, BlockType } from '@/types/blocks';
import { VisualEditorShell } from '@/components/portal/VisualEditorShell';
import { EmailPreviewPane } from '@/components/email/EmailPreviewPane';
import BrandingProfileSelector from '@/components/portal/BrandingProfileSelector';
import type { EmailTemplateVariable } from '@/lib/db/schema';
import { getEventDefinition } from '@/lib/email/website-email-events';

interface Template {
  id: number;
  websiteId: number;
  event: string;
  name: string;
  subject: string;
  description: string | null;
  htmlContent: string;
  blockContent: { blocks: Block[]; version: string } | null;
  variables: EmailTemplateVariable[];
  brandingProfileId: number | null;
  enabled: boolean;
  isRequired: boolean;
}

type ActiveTab = 'visual' | 'html' | 'variables' | 'preview' | 'settings' | 'branding' | 'event';

export default function WebsiteEmailTemplatePage({ params }: { params: Promise<{ siteId: string; templateId: string }> }) {
  const { siteId, templateId } = use(params);
  const router = useRouter();
  const [template, setTemplate] = useState<Template | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [htmlContent, setHtmlContent] = useState('');
  const [brandingProfileId, setBrandingProfileId] = useState<number | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [activeTab, setActiveTab] = useState<ActiveTab>('visual');

  useEffect(() => {
    fetch(`/api/portal/cms/websites/${siteId}/email-templates/${templateId}`)
      .then(r => r.json())
      .then(res => {
        if (res.success) {
          const t = res.data as Template;
          setTemplate(t);
          setName(t.name);
          setSubject(t.subject);
          setBlocks(t.blockContent?.blocks ?? []);
          setHtmlContent(t.htmlContent);
          setBrandingProfileId(t.brandingProfileId);
          setEnabled(t.enabled);
          if (!t.blockContent?.blocks?.length && t.htmlContent) setActiveTab('html');
        }
      })
      .finally(() => setLoading(false));
  }, [siteId, templateId]);

  const eventDef = template ? getEventDefinition(template.event) : undefined;
  const variables = template?.variables ?? eventDef?.variables ?? [];

  async function save() {
    setSaving(true);
    setError('');
    const payload: Record<string, unknown> = { name, subject, brandingProfileId, enabled };
    if (activeTab === 'html' || activeTab === 'visual') {
      if (blocks.length > 0) {
        payload.blockContent = { blocks, version: '1' };
      } else {
        payload.htmlContent = htmlContent;
        payload.blockContent = null;
      }
    }
    const res = await fetch(`/api/portal/cms/websites/${siteId}/email-templates/${templateId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    setSaving(false);
    if (!data.success) { setError(data.message ?? 'Save failed'); return; }
    setTemplate(data.data);
  }

  function insertVariable(varKey: string) {
    navigator.clipboard.writeText(`%%${varKey}%%`);
  }

  function createEmailBlock(type: BlockType, order: number): Block {
    const id = `block-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const base = { id, order, type };
    switch (type) {
      case 'text': return { ...base, type: 'text', content: 'Start writing...', alignment: 'left', size: 'base' };
      case 'heading': return { ...base, type: 'heading', content: 'Heading', level: 2, alignment: 'left' };
      case 'image': return { ...base, type: 'image', url: '', alt: '', width: 'full', alignment: 'center' };
      case 'button': return { ...base, type: 'button', text: 'Click Here', url: '', variant: 'primary', size: 'md', alignment: 'center' };
      case 'spacer': return { ...base, type: 'spacer', height: 'md' };
      case 'divider': return { ...base, type: 'divider', lineStyle: 'solid' };
      case 'columns': return { ...base, type: 'columns', columns: [{ id: `col-${Date.now()}-1`, width: 50, blocks: [] }, { id: `col-${Date.now()}-2`, width: 50, blocks: [] }], gap: 'md' };
      case 'quote': return { ...base, type: 'quote', content: 'Quote text...', author: '' };
      case 'section': return { ...base, type: 'section', blocks: [] };
      case 'social-links': return { ...base, type: 'social-links', links: [], alignment: 'center' };
      case 'email-header': return { ...base, type: 'email-header', alignment: 'center' };
      case 'email-footer': return { ...base, type: 'email-footer', showUnsubscribe: false };
      default: return { ...base, type: 'text', content: '', alignment: 'left', size: 'base' };
    }
  }

  if (loading) return <div className="flex items-center justify-center py-20"><span className="material-icons animate-spin text-3xl text-muted-foreground">autorenew</span></div>;
  if (!template) return <div className="p-6 text-muted-foreground text-sm">Template not found.</div>;

  const inputClass = 'w-full border border-border rounded-md px-3 py-2 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary';

  const tabs: { id: ActiveTab; label: string; icon: string }[] = [
    { id: 'visual', label: 'Visual', icon: 'dashboard' },
    { id: 'html', label: 'HTML', icon: 'code' },
    { id: 'variables', label: 'Variables', icon: 'data_object' },
    { id: 'preview', label: 'Preview', icon: 'email' },
    { id: 'settings', label: 'Settings', icon: 'settings' },
    { id: 'branding', label: 'Branding', icon: 'palette' },
    { id: 'event', label: 'Event', icon: 'bolt' },
  ];

  return (
    <div className="w-full space-y-4 px-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href={`/portal/websites/${siteId}/email`} className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
            <span className="material-icons">arrow_back</span>
          </Link>
          <div>
            <h1 className="text-xl font-bold text-foreground">{name}</h1>
            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
              <span className="font-mono bg-muted px-1.5 py-0.5 rounded">{template.event}</span>
              {template.isRequired && <span className="text-amber-600 dark:text-amber-400">Required</span>}
              <span>·</span>
              <span className={enabled ? 'text-green-600' : 'text-gray-500'}>{enabled ? 'Active' : 'Disabled'}</span>
            </div>
          </div>
        </div>
        <button
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 transition-all"
        >
          {saving ? <span className="material-icons animate-spin text-base">autorenew</span> : <span className="material-icons text-base">save</span>}
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-3 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-400 text-sm">
          <span className="material-icons">error</span>{error}
          <button onClick={() => setError('')} className="ml-auto"><span className="material-icons text-base">close</span></button>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-border">
        <nav className="flex gap-1 -mb-px overflow-x-auto">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
              }`}
            >
              <span className="material-icons text-base">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      {activeTab === 'visual' && (
        <div className="rounded-xl overflow-hidden [&>div]:!h-[calc(100vh-200px)]" style={{ minHeight: '550px' }}>
          <VisualEditorShell
            key={`ws-email-${templateId}`}
            blocks={blocks}
            selectedBlockId={null}
            viewport="desktop"
            previewMode={false}
            initialZoom={100}
            iframeSrc="/portal/email/editor-preview?_edit=true"
            onBlocksChange={setBlocks}
            onSelectBlock={() => {}}
            onAddBlock={(type: string) => {
              const newBlock = createEmailBlock(type as BlockType, blocks.length + 1);
              setBlocks([...blocks, newBlock]);
            }}
            onDeleteBlock={(blockId: string) => setBlocks(blocks.filter(b => b.id !== blockId))}
            onUpdateBlock={(blockId: string, updates: Partial<Block>) => setBlocks(blocks.map(b => b.id === blockId ? { ...b, ...updates } as Block : b))}
            siteId={undefined}
          />
        </div>
      )}

      {activeTab === 'html' && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-border flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">HTML Content</h3>
            <p className="text-xs text-muted-foreground">Use %%variableName%% for dynamic content</p>
          </div>
          <div className="p-5">
            <textarea
              value={htmlContent}
              onChange={e => setHtmlContent(e.target.value)}
              rows={28}
              className={`${inputClass} font-mono text-xs`}
              placeholder={`<h1>Hello %%firstName%%,</h1>\n<p>Your order %%orderNumber%% has been confirmed.</p>`}
            />
          </div>
        </div>
      )}

      {activeTab === 'variables' && (
        <div className="bg-card border border-border rounded-xl p-6 space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Available Variables</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Click any variable to copy it to your clipboard, then paste it into the visual editor or HTML content.
              Variables are replaced with real data when the email is sent.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {variables.map(v => (
              <button
                key={v.key}
                onClick={() => insertVariable(v.key)}
                className="flex items-start gap-3 p-3 bg-muted/50 hover:bg-primary/5 hover:border-primary/20 border border-transparent rounded-lg transition-colors text-left group"
                title={`Click to copy %%${v.key}%%`}
              >
                <code className="font-mono text-xs text-primary bg-primary/10 px-2 py-1 rounded shrink-0 group-hover:bg-primary/20">%%{v.key}%%</code>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{v.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{v.description}</p>
                  <p className="text-xs text-muted-foreground/50 mt-1 font-mono">e.g. {v.sampleValue}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'preview' && (
        <div className="bg-card border border-border rounded-xl overflow-hidden" style={{ height: 'calc(100vh - 200px)' }}>
          <EmailPreviewPane blocks={blocks} />
        </div>
      )}

      {activeTab === 'settings' && (
        <div className="max-w-2xl space-y-6">
          <div className="bg-card border border-border rounded-xl p-6 space-y-5">
            <h2 className="text-lg font-semibold text-foreground">Template Settings</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Template Name</label>
                <input value={name} onChange={e => setName(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  Subject Line
                  <span className="text-muted-foreground/50 ml-1 font-normal">(supports %%variables%%)</span>
                </label>
                <input value={subject} onChange={e => setSubject(e.target.value)} className={inputClass} />
                <p className="text-xs text-muted-foreground mt-1.5">
                  The subject line of the email. You can use variables like %%firstName%% or %%orderNumber%%.
                </p>
              </div>
              <div className="pt-2">
                <label className="flex items-center gap-3 cursor-pointer">
                  <button
                    type="button"
                    onClick={() => setEnabled(!enabled)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${enabled ? 'bg-primary' : 'bg-border'}`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${enabled ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                  <div>
                    <span className="text-sm font-medium text-foreground">Enabled</span>
                    <p className="text-xs text-muted-foreground">When disabled, this email won't be sent even when the event fires.</p>
                  </div>
                </label>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'branding' && (
        <div className="max-w-2xl space-y-6">
          <div className="bg-card border border-border rounded-xl p-6 space-y-5">
            <h2 className="text-lg font-semibold text-foreground">Branding Profile</h2>
            <p className="text-sm text-muted-foreground">
              Select a branding profile to apply colors, fonts, and logo to this email template.
            </p>
            <BrandingProfileSelector
              value={brandingProfileId}
              onChange={setBrandingProfileId}
              allowNone
              noneLabel="No branding"
            />
            <div className="bg-muted/50 rounded-lg p-4 text-xs text-muted-foreground space-y-1">
              <p>When a branding profile is applied:</p>
              <ul className="list-disc pl-4 space-y-0.5">
                <li>Email header block uses the profile logo</li>
                <li>Buttons use the primary color</li>
                <li>Headings use the heading font and text color</li>
                <li>Footer uses the company name</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'event' && eventDef && (
        <div className="max-w-2xl space-y-6">
          <div className="bg-card border border-border rounded-xl p-6 space-y-4">
            <h2 className="text-lg font-semibold text-foreground">Event Details</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Event Name</label>
                <p className="text-sm text-foreground font-medium">{eventDef.name}</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Event Code</label>
                <p className="text-sm font-mono text-foreground bg-muted px-3 py-1.5 rounded-lg inline-block">{eventDef.event}</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Description</label>
                <p className="text-sm text-foreground">{eventDef.description}</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Category</label>
                <p className="text-sm text-foreground capitalize">{eventDef.category}</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Required</label>
                <p className="text-sm text-foreground">{eventDef.isRequired ? 'Yes — this template cannot be deleted' : 'No — optional template'}</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Available Variables</label>
                <p className="text-sm text-foreground">{eventDef.variables.length} variables available for this event</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
