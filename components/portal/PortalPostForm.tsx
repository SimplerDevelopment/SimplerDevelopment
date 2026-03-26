'use client';

import { useRouter } from 'next/navigation';
import { useState, useEffect, useRef } from 'react';
import { BlockEditor } from '@/components/blocks/BlockEditor';
import { EditorWithPreview } from '@/components/blocks/EditorWithPreview';
import { BlockType } from '@/types/blocks';
import { Block, BlockEditorData } from '@/types/blocks';
import { Breakpoint } from '@/types/responsive';
import { PostEditorLayout } from '@/components/admin/PostEditorLayout';
import { ViewportSelector } from '@/components/blocks/ViewportSelector';
import { BlockEditorProvider } from '@/contexts/BlockEditorContext';
import { DesignTokensProvider } from '@/contexts/DesignTokensContext';
import { PostFormInnerControls } from '@/components/admin/PostFormInner';
import { VisualEditorShell } from '@/components/portal/VisualEditorShell';
import MediaPicker from '@/components/admin/MediaPicker';

interface Post {
  id?: number;
  title: string;
  slug: string;
  postType: string;
  excerpt?: string;
  content: string;
  coverImage?: string;
  published: boolean;
  publishedAt?: string | null;
  categoryIds?: number[];
  tagIds?: number[];
  seoTitle?: string;
  seoDescription?: string;
  ogImage?: string;
  noIndex?: boolean;
  canonicalUrl?: string;
}

interface TaxonomyItem {
  id: number;
  name: string;
  slug: string;
}

interface PortalPostFormProps {
  siteId: number;
  post?: Post;
  mode: 'create' | 'edit';
  siteUrl?: string | null;
}

const blockTypes: Array<{ type: BlockType; label: string; icon: string; category: string; description: string }> = [
  { type: 'heading', label: 'Heading', icon: '📝', category: 'Basic', description: 'Add a title or heading' },
  { type: 'text', label: 'Paragraph', icon: '📄', category: 'Basic', description: 'Start with plain text' },
  { type: 'button', label: 'Button', icon: '🔘', category: 'Basic', description: 'Add a call-to-action button' },
  { type: 'quote', label: 'Quote', icon: '💬', category: 'Basic', description: 'Add a quotation' },
  { type: 'image', label: 'Image', icon: '🖼️', category: 'Media', description: 'Insert an image' },
  { type: 'youtube', label: 'YouTube', icon: '📺', category: 'Media', description: 'Embed a YouTube video' },
  { type: 'video', label: 'Video', icon: '🎬', category: 'Media', description: 'Embed a video file' },
  { type: 'gallery', label: 'Gallery', icon: '🖼️', category: 'Media', description: 'Image gallery with lightbox' },
  { type: 'code', label: 'Code', icon: '💻', category: 'Media', description: 'Display code snippet' },
  { type: 'spacer', label: 'Spacer', icon: '↕️', category: 'Layout', description: 'Add vertical space' },
  { type: 'divider', label: 'Divider', icon: '➖', category: 'Layout', description: 'Add a horizontal line' },
  { type: 'columns', label: 'Columns', icon: '📊', category: 'Layout', description: 'Display content in columns' },
  { type: 'accordion', label: 'Accordion', icon: '📑', category: 'Layout', description: 'Collapsible content sections' },
  { type: 'tabs', label: 'Tabs', icon: '🗂️', category: 'Layout', description: 'Tabbed content sections' },
  { type: 'section', label: 'Section', icon: '📦', category: 'Layout', description: 'Container wrapper with styling' },
  { type: 'hero', label: 'Hero', icon: '🎯', category: 'Components', description: 'Hero section with CTA' },
  { type: 'cta', label: 'Call to Action', icon: '📢', category: 'Components', description: 'CTA section' },
  { type: 'card-grid', label: 'Card Grid', icon: '🎴', category: 'Components', description: 'Grid of cards' },
  { type: 'stats', label: 'Stats', icon: '📈', category: 'Components', description: 'Statistics display' },
  { type: 'testimonial', label: 'Testimonial', icon: '⭐', category: 'Components', description: 'Customer testimonial' },
  { type: 'featured-content', label: 'Featured Content', icon: '✨', category: 'Components', description: 'Featured content with image' },
];

function parseContentToBlocks(content: string): Block[] {
  if (!content) return [];
  try {
    const parsed = JSON.parse(content) as BlockEditorData;
    return parsed.blocks || [];
  } catch {
    return [];
  }
}

function generateSlug(title: string) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function createDefaultBlock(type: string, order: number): Block {
  const id = `block-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const base = { id, order };

  switch (type) {
    case 'heading': return { ...base, type: 'heading', content: 'New Heading', level: 2 } as Block;
    case 'text': return { ...base, type: 'text', content: 'New paragraph text.' } as Block;
    case 'image': return { ...base, type: 'image', url: '', alt: '' } as Block;
    case 'button': return { ...base, type: 'button', text: 'Click Me', url: '#', variant: 'primary', size: 'md' } as Block;
    case 'spacer': return { ...base, type: 'spacer', height: 'md' } as Block;
    case 'divider': return { ...base, type: 'divider' } as Block;
    case 'quote': return { ...base, type: 'quote', content: '', author: '' } as Block;
    case 'code': return { ...base, type: 'code', code: '', language: 'javascript' } as Block;
    case 'video': return { ...base, type: 'video', url: '' } as Block;
    case 'youtube': return { ...base, type: 'youtube', url: '' } as Block;
    case 'columns': return { ...base, type: 'columns', columns: [
      { id: `col-${Date.now()}-1`, width: 50, blocks: [] },
      { id: `col-${Date.now()}-2`, width: 50, blocks: [] },
    ], gap: 'md' } as Block;
    case 'tabs': return { ...base, type: 'tabs', tabs: [
      { id: `tab-${Date.now()}-1`, label: 'Tab 1', blocks: [] },
      { id: `tab-${Date.now()}-2`, label: 'Tab 2', blocks: [] },
    ] } as Block;
    case 'section': return { ...base, type: 'section', blocks: [] } as Block;
    case 'accordion': return { ...base, type: 'accordion', items: [
      { id: `acc-${Date.now()}-1`, title: 'Item 1', content: 'Content for item 1' },
      { id: `acc-${Date.now()}-2`, title: 'Item 2', content: 'Content for item 2' },
    ] } as Block;
    case 'hero': return { ...base, type: 'hero', title: 'Hero Title', subtitle: '', ctaText: 'Learn More', ctaLink: '#' } as Block;
    case 'cta': return { ...base, type: 'cta', title: 'Call to Action', primaryButtonText: 'Get Started', primaryButtonUrl: '#' } as Block;
    case 'testimonial': return { ...base, type: 'testimonial', quote: '', author: '' } as Block;
    case 'stats': return { ...base, type: 'stats', stats: [
      { id: `stat-${Date.now()}-1`, value: '100+', label: 'Clients' },
      { id: `stat-${Date.now()}-2`, value: '50', label: 'Projects' },
    ], columns: 3 } as Block;
    case 'card-grid': return { ...base, type: 'card-grid', cards: [
      { id: `card-${Date.now()}-1`, title: 'Card 1', description: 'Description' },
      { id: `card-${Date.now()}-2`, title: 'Card 2', description: 'Description' },
    ], columns: 3 } as Block;
    case 'gallery': return { ...base, type: 'gallery', images: [], layout: 'grid', columns: 3 } as Block;
    case 'featured-content': return { ...base, type: 'featured-content', title: '', description: '' } as Block;
    case 'services-grid': return { ...base, type: 'services-grid', services: [], columns: 3 } as Block;
    case 'blog-posts': return { ...base, type: 'blog-posts', limit: 3, columns: 3 } as Block;
    default: return { ...base, type: type as 'text', content: '' } as Block;
  }
}

export default function PortalPostForm({ siteId, post, mode, siteUrl }: PortalPostFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [contentMenuOpen, setContentMenuOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<'visual' | 'classic' | 'iframe'>(
    siteUrl && mode === 'edit' ? 'iframe' : 'visual',
  );
  const [iframeViewport, setIframeViewport] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [currentViewport, setCurrentViewport] = useState<Breakpoint>('desktop');
  const [blocks, setBlocks] = useState<Block[]>(parseContentToBlocks(post?.content || ''));
  const [formData, setFormData] = useState<Post>({
    title: post?.title || '',
    slug: post?.slug || '',
    postType: post?.postType || 'page',
    excerpt: post?.excerpt || '',
    content: post?.content || '',
    coverImage: post?.coverImage || '',
    published: post?.published || false,
    publishedAt: post?.publishedAt || null,
    categoryIds: post?.categoryIds || [],
    tagIds: post?.tagIds || [],
    seoTitle: post?.seoTitle || '',
    seoDescription: post?.seoDescription || '',
    ogImage: post?.ogImage || '',
    noIndex: post?.noIndex || false,
    canonicalUrl: post?.canonicalUrl || '',
  });

  // Load available categories & tags for this website
  const [availableCategories, setAvailableCategories] = useState<TaxonomyItem[]>([]);
  const [availableTags, setAvailableTags] = useState<TaxonomyItem[]>([]);

  useEffect(() => {
    fetch(`/api/portal/cms/websites/${siteId}/categories`)
      .then(r => r.json())
      .then(res => { if (res.success) setAvailableCategories(res.data); })
      .catch(() => {});
    fetch(`/api/portal/cms/websites/${siteId}/tags`)
      .then(r => r.json())
      .then(res => { if (res.success) setAvailableTags(res.data); })
      .catch(() => {});
  }, [siteId]);

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const title = e.target.value;
    setFormData(prev => ({
      ...prev,
      title,
      slug: mode === 'create' ? generateSlug(title) : prev.slug,
    }));
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setLoading(true);

    try {
      const contentData: BlockEditorData = { blocks, version: '1.0' };
      const contentToSave = JSON.stringify(contentData);

      const url = mode === 'create'
        ? `/api/portal/cms/websites/${siteId}/posts`
        : `/api/portal/cms/websites/${siteId}/posts/${post?.id}`;
      const method = mode === 'create' ? 'POST' : 'PUT';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, content: contentToSave }),
      });

      const data = await response.json();
      if (data.success) {
        router.push(`/portal/websites/${siteId}`);
        router.refresh();
      } else {
        alert(data.message || 'Failed to save');
      }
    } catch {
      alert('An error occurred while saving');
    } finally {
      setLoading(false);
    }
  };

  const layoutContent = (
    <form onSubmit={handleSubmit} className="container mx-auto px-4 py-6 space-y-6">
      {/* Settings panel */}
      {settingsOpen && (
        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-foreground">Post Settings</h3>
            <button type="button" onClick={() => setSettingsOpen(false)} className="text-muted-foreground hover:text-foreground">
              <span className="material-icons text-base">close</span>
            </button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Title</label>
              <input
                value={formData.title}
                onChange={handleTitleChange}
                placeholder="Page title"
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Slug</label>
              <input
                value={formData.slug}
                onChange={e => setFormData(prev => ({ ...prev, slug: e.target.value }))}
                placeholder="page-slug"
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground font-mono outline-none focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Type</label>
              <select
                value={formData.postType}
                onChange={e => setFormData(prev => ({ ...prev, postType: e.target.value }))}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground outline-none focus:border-primary"
              >
                <option value="page">Page</option>
                <option value="blog">Blog Post</option>
                <option value="landing">Landing Page</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Status</label>
              <select
                value={formData.published ? 'published' : 'draft'}
                onChange={e => setFormData(prev => ({ ...prev, published: e.target.value === 'published' }))}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground outline-none focus:border-primary"
              >
                <option value="draft">Draft</option>
                <option value="published">Published</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-muted-foreground mb-1">Excerpt</label>
              <textarea
                value={formData.excerpt}
                onChange={e => setFormData(prev => ({ ...prev, excerpt: e.target.value }))}
                rows={2}
                placeholder="Short description..."
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground outline-none focus:border-primary resize-none"
              />
            </div>

            {/* Categories */}
            {availableCategories.length > 0 && (
              <div className="col-span-2">
                <label className="block text-xs font-medium text-muted-foreground mb-1">Categories</label>
                <div className="flex flex-wrap gap-2">
                  {availableCategories.map(cat => {
                    const selected = formData.categoryIds?.includes(cat.id);
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setFormData(prev => ({
                          ...prev,
                          categoryIds: selected
                            ? (prev.categoryIds || []).filter(id => id !== cat.id)
                            : [...(prev.categoryIds || []), cat.id],
                        }))}
                        className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                          selected
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-background text-muted-foreground border-border hover:border-primary/40'
                        }`}
                      >
                        {cat.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Tags */}
            {availableTags.length > 0 && (
              <div className="col-span-2">
                <label className="block text-xs font-medium text-muted-foreground mb-1">Tags</label>
                <div className="flex flex-wrap gap-2">
                  {availableTags.map(tag => {
                    const selected = formData.tagIds?.includes(tag.id);
                    return (
                      <button
                        key={tag.id}
                        type="button"
                        onClick={() => setFormData(prev => ({
                          ...prev,
                          tagIds: selected
                            ? (prev.tagIds || []).filter(id => id !== tag.id)
                            : [...(prev.tagIds || []), tag.id],
                        }))}
                        className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                          selected
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'bg-background text-muted-foreground border-border hover:border-primary/40'
                        }`}
                      >
                        {tag.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Content Editor (non-iframe modes only — iframe mode renders outside the form) */}
      {editorMode !== 'iframe' && (
        <div className="bg-card border border-border shadow rounded-lg">
          <div className="p-6">
            {editorMode === 'visual' ? (
              <EditorWithPreview
                onChange={(newBlocks) => setBlocks(newBlocks)}
                blockTypes={blockTypes}
              />
            ) : (
              <BlockEditor blocks={blocks} onChange={setBlocks} />
            )}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-4">
        <button
          type="submit"
          disabled={loading}
          className="px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90 disabled:opacity-50"
        >
          {loading ? 'Saving...' : mode === 'create' ? 'Create Page' : 'Save Changes'}
        </button>
        <button
          type="button"
          onClick={() => router.push(`/portal/websites/${siteId}`)}
          className="px-4 py-2 text-sm font-medium text-foreground bg-card border border-border rounded-md hover:bg-accent"
        >
          Cancel
        </button>
      </div>
    </form>
  );

  return (
    <DesignTokensProvider>
      <BlockEditorProvider
        initialBlocks={blocks}
        onBlocksChange={setBlocks}
        initialViewport={currentViewport}
        onViewportChange={setCurrentViewport}
      >
        <PostEditorLayout
          postTitle={formData.title || (mode === 'create' ? 'New Page' : 'Edit Page')}
          onOpenSettings={() => setSettingsOpen(prev => !prev)}
          backHref={`/portal/websites/${siteId}`}
          liveUrl={siteUrl && post?.slug ? `${siteUrl}/blog/${post.slug}` : null}
          editorControls={
            editorMode === 'iframe' ? undefined : (
              <PostFormInnerControls
                contentMode="blocks"
                editorMode={editorMode}
                onEditorModeChange={(mode) => setEditorMode(mode)}
                contentMenuOpen={contentMenuOpen}
                onContentMenuToggle={() => setContentMenuOpen(prev => !prev)}
                onContentModeChange={() => {}}
              />
            )
          }
          centerControls={
            editorMode === 'iframe' ? (
              <div className="flex items-center gap-1">
                {(['desktop', 'tablet', 'mobile'] as const).map((vp) => (
                  <button
                    key={vp}
                    type="button"
                    onClick={() => setIframeViewport(vp)}
                    className={`rounded p-1.5 ${
                      iframeViewport === vp ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:bg-accent'
                    }`}
                    title={vp.charAt(0).toUpperCase() + vp.slice(1)}
                  >
                    <span className="material-icons text-lg">
                      {vp === 'desktop' ? 'computer' : vp === 'tablet' ? 'tablet' : 'phone_iphone'}
                    </span>
                  </button>
                ))}
              </div>
            ) : undefined
          }
          published={formData.published}
          onPublish={handleSubmit}
          onStatusChange={(status) => setFormData(prev => ({ ...prev, published: status === 'published' }))}
        >
          {editorMode === 'iframe' && siteUrl && post?.slug ? (
            <div className="relative flex-1">
              <VisualEditorShell
                blocks={blocks}
                selectedBlockId={null}
                iframeSrc={`${siteUrl}/blog/${post.slug}?_edit=true`}
                viewport={iframeViewport}
                onBlocksChange={setBlocks}
                onSelectBlock={() => {}}
                onAddBlock={(type) => {
                  const newBlock = createDefaultBlock(type, blocks.length);
                  setBlocks([...blocks, newBlock]);
                }}
                onDeleteBlock={(blockId) => setBlocks(blocks.filter(b => b.id !== blockId))}
                onUpdateBlock={(blockId, updates) => setBlocks(blocks.map(b => b.id === blockId ? ({ ...b, ...updates } as Block) : b))}
              />

              {/* Settings slide-over panel */}
              {settingsOpen && (
                <SettingsSlideOver
                  formData={formData}
                  setFormData={setFormData}
                  handleTitleChange={handleTitleChange}
                  siteId={siteId}
                  availableCategories={availableCategories}
                  setAvailableCategories={setAvailableCategories}
                  availableTags={availableTags}
                  setAvailableTags={setAvailableTags}
                  onClose={() => setSettingsOpen(false)}
                />
              )}
            </div>
          ) : (
            layoutContent
          )}
        </PostEditorLayout>
      </BlockEditorProvider>
    </DesignTokensProvider>
  );
}

// ─── Settings Slide-Over with Tabs ───────────────────────────────────────────

type SettingsTab = 'general' | 'seo' | 'taxonomy' | 'custom-fields';

const SETTINGS_TABS: { id: SettingsTab; label: string; icon: string }[] = [
  { id: 'general', label: 'General', icon: 'tune' },
  { id: 'seo', label: 'SEO', icon: 'search' },
  { id: 'taxonomy', label: 'Taxonomy', icon: 'label' },
  { id: 'custom-fields', label: 'Custom Fields', icon: 'input' },
];

interface CustomFieldDef {
  id: number;
  name: string;
  slug: string;
  fieldType: string;
  options: string[] | null;
  required: boolean;
  defaultValue: string | null;
  helpText: string | null;
}

interface CustomFieldValue {
  customFieldId: number;
  value: string | null;
}

function SettingsSlideOver({
  formData,
  setFormData,
  handleTitleChange,
  siteId,
  availableCategories,
  setAvailableCategories,
  availableTags,
  setAvailableTags,
  onClose,
}: {
  formData: Post;
  setFormData: React.Dispatch<React.SetStateAction<Post>>;
  handleTitleChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  siteId: number;
  availableCategories: TaxonomyItem[];
  setAvailableCategories: React.Dispatch<React.SetStateAction<TaxonomyItem[]>>;
  availableTags: TaxonomyItem[];
  setAvailableTags: React.Dispatch<React.SetStateAction<TaxonomyItem[]>>;
  onClose: () => void;
}) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [customFieldDefs, setCustomFieldDefs] = useState<CustomFieldDef[]>([]);
  const [customFieldValues, setCustomFieldValues] = useState<Record<number, string>>({});
  const [customFieldsLoaded, setCustomFieldsLoaded] = useState(false);

  // Load custom fields when tab is activated
  useEffect(() => {
    if (activeTab !== 'custom-fields' || customFieldsLoaded) return;

    // Fetch field definitions (all fields — could filter by postType if post_types are set up)
    fetch('/api/custom-fields')
      .then(r => r.json())
      .then(res => {
        if (res.success) setCustomFieldDefs(res.data);
      })
      .catch(() => {});

    // Fetch existing values for this post
    if (formData.id) {
      fetch(`/api/posts/${formData.id}/custom-fields`)
        .then(r => r.json())
        .then(res => {
          if (res.success) {
            const vals: Record<number, string> = {};
            for (const v of res.data) {
              vals[v.customFieldId] = v.value || '';
            }
            setCustomFieldValues(vals);
          }
        })
        .catch(() => {});
    }

    setCustomFieldsLoaded(true);
  }, [activeTab, customFieldsLoaded, formData.id]);

  const updateCustomFieldValue = (fieldId: number, value: string) => {
    setCustomFieldValues(prev => ({ ...prev, [fieldId]: value }));
    // Save immediately
    if (formData.id) {
      fetch(`/api/posts/${formData.id}/custom-fields`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customFieldId: fieldId, value }),
      }).catch(() => {});
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />
      <div className="fixed top-0 right-0 z-50 h-full w-96 bg-card border-l border-border shadow-xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border shrink-0">
          <h3 className="text-base font-semibold text-foreground">Page Details</h3>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <span className="material-icons text-xl">close</span>
          </button>
        </div>

        {/* Tabs — horizontal scroll */}
        <div className="flex overflow-x-auto border-b border-border shrink-0 scrollbar-none">
          {SETTINGS_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors shrink-0 ${
                activeTab === tab.id
                  ? 'text-primary border-b-2 border-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <span className="material-icons text-base">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {activeTab === 'general' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Title</label>
                <input
                  value={formData.title}
                  onChange={handleTitleChange}
                  placeholder="Page title"
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground outline-none focus:border-primary"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Slug</label>
                <input
                  value={formData.slug}
                  onChange={e => setFormData(prev => ({ ...prev, slug: e.target.value }))}
                  placeholder="page-slug"
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground font-mono outline-none focus:border-primary"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Type</label>
                <select
                  value={formData.postType}
                  onChange={e => setFormData(prev => ({ ...prev, postType: e.target.value }))}
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground outline-none focus:border-primary"
                >
                  <option value="page">Page</option>
                  <option value="blog">Blog Post</option>
                  <option value="landing">Landing Page</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Excerpt</label>
                <textarea
                  value={formData.excerpt}
                  onChange={e => setFormData(prev => ({ ...prev, excerpt: e.target.value }))}
                  rows={3}
                  placeholder="Short description..."
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground outline-none focus:border-primary resize-none"
                />
              </div>
              <MediaPicker
                value={formData.coverImage}
                onChange={(url) => setFormData(prev => ({ ...prev, coverImage: url }))}
                label="Cover Image"
                apiEndpoint={`/api/portal/cms/websites/${siteId}/media`}
              />
            </div>
          )}

          {activeTab === 'seo' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">SEO Title</label>
                <input
                  value={formData.seoTitle}
                  onChange={e => setFormData(prev => ({ ...prev, seoTitle: e.target.value }))}
                  placeholder={formData.title || 'Defaults to post title'}
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground outline-none focus:border-primary"
                />
                <p className="text-xs text-muted-foreground mt-1">{(formData.seoTitle || formData.title || '').length}/60 characters</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Meta Description</label>
                <textarea
                  value={formData.seoDescription}
                  onChange={e => setFormData(prev => ({ ...prev, seoDescription: e.target.value }))}
                  rows={3}
                  placeholder={formData.excerpt || 'Description for search engines...'}
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground outline-none focus:border-primary resize-none"
                />
                <p className="text-xs text-muted-foreground mt-1">{(formData.seoDescription || '').length}/160 characters</p>
              </div>
              <MediaPicker
                value={formData.ogImage}
                onChange={(url) => setFormData(prev => ({ ...prev, ogImage: url }))}
                label="Social Share Image (OG Image)"
                apiEndpoint={`/api/portal/cms/websites/${siteId}/media`}
              />
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Canonical URL</label>
                <input
                  value={formData.canonicalUrl}
                  onChange={e => setFormData(prev => ({ ...prev, canonicalUrl: e.target.value }))}
                  placeholder="https://..."
                  className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground outline-none focus:border-primary"
                />
              </div>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.noIndex || false}
                  onChange={e => setFormData(prev => ({ ...prev, noIndex: e.target.checked }))}
                  className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                />
                <span className="text-sm text-foreground">Hide from search engines (noindex)</span>
              </label>
            </div>
          )}

          {activeTab === 'taxonomy' && (
            <TaxonomyTabContent
              siteId={siteId}
              formData={formData}
              setFormData={setFormData}
              availableCategories={availableCategories}
              setAvailableCategories={setAvailableCategories}
              availableTags={availableTags}
              setAvailableTags={setAvailableTags}
            />
          )}

          {activeTab === 'custom-fields' && (
            <div className="space-y-4">
              {customFieldDefs.length === 0 ? (
                <div className="text-center py-8">
                  <span className="material-icons text-3xl text-muted-foreground mb-2 block">input</span>
                  <p className="text-sm text-muted-foreground">No custom fields defined yet.</p>
                  <p className="text-xs text-muted-foreground mt-1">Custom fields can be created in the admin post type settings.</p>
                </div>
              ) : (
                customFieldDefs.map((field) => (
                  <div key={field.id}>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">
                      {field.name}
                      {field.required && <span className="text-red-500 ml-0.5">*</span>}
                    </label>
                    {field.fieldType === 'textarea' ? (
                      <textarea
                        value={customFieldValues[field.id] || ''}
                        onChange={e => updateCustomFieldValue(field.id, e.target.value)}
                        rows={3}
                        placeholder={field.defaultValue || ''}
                        className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground outline-none focus:border-primary resize-none"
                      />
                    ) : field.fieldType === 'select' ? (
                      <select
                        value={customFieldValues[field.id] || ''}
                        onChange={e => updateCustomFieldValue(field.id, e.target.value)}
                        className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground outline-none focus:border-primary"
                      >
                        <option value="">Select...</option>
                        {(field.options || []).map((opt) => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    ) : field.fieldType === 'checkbox' ? (
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={customFieldValues[field.id] === 'true'}
                          onChange={e => updateCustomFieldValue(field.id, String(e.target.checked))}
                          className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                        />
                        <span className="text-sm text-foreground">{field.helpText || field.name}</span>
                      </label>
                    ) : field.fieldType === 'number' ? (
                      <input
                        type="number"
                        value={customFieldValues[field.id] || ''}
                        onChange={e => updateCustomFieldValue(field.id, e.target.value)}
                        placeholder={field.defaultValue || ''}
                        className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground outline-none focus:border-primary"
                      />
                    ) : field.fieldType === 'date' ? (
                      <input
                        type="date"
                        value={customFieldValues[field.id] || ''}
                        onChange={e => updateCustomFieldValue(field.id, e.target.value)}
                        className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground outline-none focus:border-primary"
                      />
                    ) : field.fieldType === 'image' ? (
                      <MediaPicker
                        value={customFieldValues[field.id] || ''}
                        onChange={(url) => updateCustomFieldValue(field.id, url)}
                        label=""
                        apiEndpoint={`/api/portal/cms/websites/${siteId}/media`}
                      />
                    ) : (
                      <input
                        type={field.fieldType === 'url' ? 'url' : field.fieldType === 'email' ? 'email' : 'text'}
                        value={customFieldValues[field.id] || ''}
                        onChange={e => updateCustomFieldValue(field.id, e.target.value)}
                        placeholder={field.defaultValue || ''}
                        className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground outline-none focus:border-primary"
                      />
                    )}
                    {field.helpText && field.fieldType !== 'checkbox' && (
                      <p className="text-xs text-muted-foreground mt-1">{field.helpText}</p>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Taxonomy Tab with Search & Select ────────────────────────────────────────

function TaxonomyTabContent({
  siteId,
  formData,
  setFormData,
  availableCategories,
  setAvailableCategories,
  availableTags,
  setAvailableTags,
}: {
  siteId: number;
  formData: Post;
  setFormData: React.Dispatch<React.SetStateAction<Post>>;
  availableCategories: TaxonomyItem[];
  setAvailableCategories: React.Dispatch<React.SetStateAction<TaxonomyItem[]>>;
  availableTags: TaxonomyItem[];
  setAvailableTags: React.Dispatch<React.SetStateAction<TaxonomyItem[]>>;
}) {
  return (
    <div className="space-y-6">
      <TaxonomySearchSelect
        label="Categories"
        items={availableCategories}
        selectedIds={formData.categoryIds || []}
        onToggle={(id) => setFormData(prev => ({
          ...prev,
          categoryIds: (prev.categoryIds || []).includes(id)
            ? (prev.categoryIds || []).filter(i => i !== id)
            : [...(prev.categoryIds || []), id],
        }))}
        onCreate={async (name) => {
          const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
          const res = await fetch(`/api/portal/cms/websites/${siteId}/categories`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, slug }),
          });
          const data = await res.json();
          if (data.success) {
            setAvailableCategories(prev => [...prev, data.data]);
            setFormData(prev => ({ ...prev, categoryIds: [...(prev.categoryIds || []), data.data.id] }));
          }
        }}
      />
      <TaxonomySearchSelect
        label="Tags"
        items={availableTags}
        selectedIds={formData.tagIds || []}
        onToggle={(id) => setFormData(prev => ({
          ...prev,
          tagIds: (prev.tagIds || []).includes(id)
            ? (prev.tagIds || []).filter(i => i !== id)
            : [...(prev.tagIds || []), id],
        }))}
        onCreate={async (name) => {
          const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
          const res = await fetch(`/api/portal/cms/websites/${siteId}/tags`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, slug }),
          });
          const data = await res.json();
          if (data.success) {
            setAvailableTags(prev => [...prev, data.data]);
            setFormData(prev => ({ ...prev, tagIds: [...(prev.tagIds || []), data.data.id] }));
          }
        }}
      />
    </div>
  );
}

// ─── Taxonomy Search & Select Combobox ───────────────────────────────────────

function TaxonomySearchSelect({
  label,
  items,
  selectedIds,
  onToggle,
  onCreate,
}: {
  label: string;
  items: TaxonomyItem[];
  selectedIds: number[];
  onToggle: (id: number) => void;
  onCreate: (name: string) => Promise<void>;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedItems = items.filter(i => selectedIds.includes(i.id));
  const lowerQuery = query.toLowerCase().trim();
  const filtered = lowerQuery
    ? items.filter(i => i.name.toLowerCase().includes(lowerQuery))
    : items;
  const exactMatch = items.some(i => i.name.toLowerCase() === lowerQuery);
  const showCreateOption = lowerQuery && !exactMatch;

  const handleCreate = async () => {
    if (!lowerQuery || creating) return;
    setCreating(true);
    await onCreate(query.trim());
    setQuery('');
    setCreating(false);
  };

  return (
    <div>
      <label className="block text-xs font-medium text-muted-foreground mb-2">{label}</label>

      {/* Selected chips */}
      {selectedItems.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {selectedItems.map(item => (
            <span
              key={item.id}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-primary text-primary-foreground"
            >
              {item.name}
              <button
                type="button"
                onClick={() => onToggle(item.id)}
                className="hover:bg-primary-foreground/20 rounded-full p-0.5"
              >
                <span className="material-icons text-xs">close</span>
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Search input */}
      <div className="relative">
        <div className="relative">
          <span className="material-icons text-base text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2">search</span>
          <input
            ref={inputRef}
            value={query}
            onChange={e => { setQuery(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                e.preventDefault();
                if (showCreateOption) handleCreate();
                else if (filtered.length === 1) { onToggle(filtered[0].id); setQuery(''); }
              }
              if (e.key === 'Escape') { setOpen(false); inputRef.current?.blur(); }
            }}
            placeholder={`Search or add ${label.toLowerCase()}...`}
            className="w-full pl-8 pr-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground outline-none focus:border-primary"
          />
        </div>

        {/* Dropdown */}
        {open && (filtered.length > 0 || showCreateOption) && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
            <div className="absolute left-0 right-0 top-full mt-1 z-20 bg-card border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto">
              {filtered.map(item => {
                const isSelected = selectedIds.includes(item.id);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => { onToggle(item.id); setQuery(''); setOpen(false); }}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-accent transition-colors ${
                      isSelected ? 'text-primary font-medium' : 'text-foreground'
                    }`}
                  >
                    <span className="material-icons text-base">
                      {isSelected ? 'check_box' : 'check_box_outline_blank'}
                    </span>
                    {item.name}
                  </button>
                );
              })}
              {showCreateOption && (
                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={creating}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left text-primary hover:bg-accent transition-colors border-t border-border"
                >
                  <span className="material-icons text-base">add_circle_outline</span>
                  {creating ? 'Creating...' : `Add "${query.trim()}"`}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
