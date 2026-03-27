'use client';

import { useRouter } from 'next/navigation';
import { useState, useEffect, useRef, useCallback } from 'react';
import { BlockEditor } from '@/components/blocks/BlockEditor';
import { EditorWithPreview } from '@/components/blocks/EditorWithPreview';
import { BlockType } from '@/types/blocks';
import { Block, BlockEditorData } from '@/types/blocks';
import { Breakpoint } from '@/types/responsive';
import { PostEditorLayout } from '@/components/admin/PostEditorLayout';
import RevisionHistory from '@/components/portal/RevisionHistory';
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
  siteDomain?: string;
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

export default function PortalPostForm({ siteId, post, mode, siteUrl, siteDomain }: PortalPostFormProps) {
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
  const [undoRedo, setUndoRedo] = useState<{ sendUndo: () => void; sendRedo: () => void; canUndo: boolean; canRedo: boolean } | null>(null);
  const [previewMode, setPreviewMode] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [postSaveStatus, setPostSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const postSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [iframeSaveVersion, setIframeSaveVersion] = useState(0);
  const [useLocalhost, setUseLocalhost] = useState(false);
  const [localPort, setLocalPort] = useState('3003');
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from localStorage after mount to avoid SSR mismatch
  useEffect(() => {
    setUseLocalhost(localStorage.getItem('editor-use-localhost') === 'true');
    setLocalPort(localStorage.getItem('editor-local-port') || '3003');
    setHydrated(true);
  }, []);

  // On localhost, the starter site serves pages at the root (no /sites/[domain] prefix)
  const localhostBase = `http://localhost:${localPort}`;
  const effectiveSiteUrl = useLocalhost ? localhostBase : siteUrl;

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem('editor-use-localhost', String(useLocalhost));
  }, [useLocalhost, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem('editor-local-port', localPort);
  }, [localPort, hydrated]);

  // Notify layout to hide/show sidebar when preview mode changes
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('portalPreviewMode', { detail: { active: previewMode } }));
    return () => {
      // Ensure sidebar returns when unmounting while in preview
      window.dispatchEvent(new CustomEvent('portalPreviewMode', { detail: { active: false } }));
    };
  }, [previewMode]);
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

  // Autosave: debounce block/form changes (only in edit mode with iframe editor)
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const blocksRef = useRef(blocks);
  const formDataRef = useRef(formData);
  const isSavingRef = useRef(false);
  blocksRef.current = blocks;
  formDataRef.current = formData;

  const savePost = useCallback(async (trigger: 'autosave' | 'manual' | 'publish' = 'manual') => {
    if (mode !== 'edit' || !post?.id || isSavingRef.current) return;
    isSavingRef.current = true;
    if (trigger !== 'autosave') {
      setLoading(true);
    }
    setPostSaveStatus('saving');
    if (postSaveTimer.current) clearTimeout(postSaveTimer.current);

    try {
      const contentData: BlockEditorData = { blocks: blocksRef.current, version: '1.0' };
      const contentToSave = JSON.stringify(contentData);

      const response = await fetch(`/api/portal/cms/websites/${siteId}/posts/${post.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formDataRef.current, content: contentToSave, revisionTrigger: trigger }),
      });

      const data = await response.json();
      if (data.success) {
        setPostSaveStatus('saved');
        postSaveTimer.current = setTimeout(() => setPostSaveStatus('idle'), 3000);
        if (trigger !== 'autosave' && editorMode !== 'iframe') {
          router.push(`/portal/websites/${siteId}`);
        }
        // Reload iframe to reflect saved content
        setIframeSaveVersion(v => v + 1);
        router.refresh();
      } else {
        setPostSaveStatus('error');
        postSaveTimer.current = setTimeout(() => setPostSaveStatus('idle'), 5000);
      }
    } catch {
      setPostSaveStatus('error');
      postSaveTimer.current = setTimeout(() => setPostSaveStatus('idle'), 5000);
    } finally {
      isSavingRef.current = false;
      setLoading(false);
    }
  }, [mode, post?.id, siteId, editorMode, router]);

  // Debounced autosave on block changes (2s after last change)
  const initialBlocksRef = useRef(JSON.stringify(blocks));
  useEffect(() => {
    if (mode !== 'edit' || editorMode !== 'iframe') return;
    const currentContent = JSON.stringify(blocks);
    if (currentContent === initialBlocksRef.current) return;
    initialBlocksRef.current = currentContent;

    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => {
      savePost('autosave');
    }, 2000);

    return () => { if (autosaveTimer.current) clearTimeout(autosaveTimer.current); };
  }, [blocks, mode, editorMode, savePost]);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);

    if (mode === 'create') {
      setLoading(true);
      setPostSaveStatus('saving');
      if (postSaveTimer.current) clearTimeout(postSaveTimer.current);
      try {
        const contentData: BlockEditorData = { blocks, version: '1.0' };
        const contentToSave = JSON.stringify(contentData);
        const response = await fetch(`/api/portal/cms/websites/${siteId}/posts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...formData, content: contentToSave }),
        });
        const data = await response.json();
        if (data.success) {
          setPostSaveStatus('saved');
          router.push(`/portal/websites/${siteId}`);
          router.refresh();
        } else {
          setPostSaveStatus('error');
          postSaveTimer.current = setTimeout(() => setPostSaveStatus('idle'), 5000);
        }
      } catch {
        setPostSaveStatus('error');
        postSaveTimer.current = setTimeout(() => setPostSaveStatus('idle'), 5000);
      } finally {
        setLoading(false);
      }
    } else {
      await savePost(formData.published ? 'publish' : 'manual');
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
          liveUrl={effectiveSiteUrl && post?.slug ? `${effectiveSiteUrl}${formData.postType === 'page' ? '' : '/blog'}/${post.slug}` : null}
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
              <div className="flex items-center gap-3">
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
                <div className="h-5 w-px bg-border" />
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setUseLocalhost(!useLocalhost)}
                    className={`flex items-center gap-1 rounded px-2 py-1 text-xs font-medium transition-colors ${
                      useLocalhost ? 'bg-orange-500/15 text-orange-600' : 'text-muted-foreground hover:bg-accent'
                    }`}
                    title={useLocalhost ? `Using localhost:${localPort}` : 'Switch to localhost'}
                  >
                    <span className="material-icons text-sm">{useLocalhost ? 'lan' : 'cloud'}</span>
                    {useLocalhost ? 'Local' : 'Prod'}
                  </button>
                  {useLocalhost && (
                    <input
                      type="text"
                      value={localPort}
                      onChange={(e) => setLocalPort(e.target.value.replace(/\D/g, ''))}
                      className="w-12 rounded border border-border bg-background px-1.5 py-0.5 text-xs text-foreground font-mono text-center"
                      title="Local port number"
                    />
                  )}
                </div>
              </div>
            ) : undefined
          }
          published={formData.published}
          onPublish={handleSubmit}
          onStatusChange={(status) => setFormData(prev => ({ ...prev, published: status === 'published' }))}
          previewMode={previewMode}
          onPreviewToggle={editorMode === 'iframe' ? () => setPreviewMode(prev => !prev) : undefined}
          onHistoryToggle={editorMode === 'iframe' && mode === 'edit' ? () => setHistoryOpen(prev => !prev) : undefined}
          historyOpen={historyOpen}
          saveStatus={postSaveStatus}
          extraNavControls={editorMode === 'iframe' && undoRedo ? (
            <div className="flex items-center gap-0.5 ml-1">
              <button
                type="button"
                onClick={undoRedo.sendUndo}
                disabled={!undoRedo.canUndo}
                className={`flex items-center justify-center w-7 h-7 rounded-md transition-colors ${undoRedo.canUndo ? 'hover:bg-accent text-foreground' : 'text-muted-foreground/30 cursor-default'}`}
                title="Undo (Cmd+Z)"
              >
                <span className="material-icons text-lg">undo</span>
              </button>
              <button
                type="button"
                onClick={undoRedo.sendRedo}
                disabled={!undoRedo.canRedo}
                className={`flex items-center justify-center w-7 h-7 rounded-md transition-colors ${undoRedo.canRedo ? 'hover:bg-accent text-foreground' : 'text-muted-foreground/30 cursor-default'}`}
                title="Redo (Cmd+Shift+Z)"
              >
                <span className="material-icons text-lg">redo</span>
              </button>
            </div>
          ) : undefined}
        >
          {editorMode === 'iframe' && effectiveSiteUrl && post?.slug ? (
            <div className="relative flex-1">
              <VisualEditorShell
                blocks={blocks}
                selectedBlockId={null}
                iframeSrc={(() => {
                  const basePath = formData.postType === 'page' ? `/${post.slug}` : `/blog/${post.slug}`;
                  const sep = previewMode ? '?' : '&';
                  const cacheBust = iframeSaveVersion > 0 ? `${sep}_v=${iframeSaveVersion}` : '';
                  return previewMode ? `${effectiveSiteUrl}${basePath}${cacheBust}` : `${effectiveSiteUrl}${basePath}?_edit=true${cacheBust}`;
                })()}
                viewport={iframeViewport}
                previewMode={previewMode}
                onBlocksChange={setBlocks}
                onSelectBlock={() => {}}
                onAddBlock={(type) => {
                  const newBlock = createDefaultBlock(type, blocks.length);
                  setBlocks([...blocks, newBlock]);
                }}
                onDeleteBlock={(blockId) => setBlocks(blocks.filter(b => b.id !== blockId))}
                onUndoRedoChange={setUndoRedo}
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

              {/* Revision History panel */}
              {post && (
                <RevisionHistory
                  siteId={siteId}
                  postId={post.id!}
                  open={historyOpen}
                  onClose={() => setHistoryOpen(false)}
                  onRevert={() => {
                    // Reload the page to get the reverted content
                    window.location.reload();
                  }}
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

// ─── Manage Custom Fields Modal ──────────────────────────────────────────────

const FIELD_TYPES = [
  { value: 'text', label: 'Text' },
  { value: 'textarea', label: 'Textarea' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'select', label: 'Select' },
  { value: 'checkbox', label: 'Checkbox' },
  { value: 'url', label: 'URL' },
  { value: 'email', label: 'Email' },
  { value: 'image', label: 'Image' },
  { value: 'user_select', label: 'User Select' },
  { value: 'repeater', label: 'Repeater' },
  { value: 'group', label: 'Field Group' },
];

interface ManagedField {
  id: number;
  postTypeId: number;
  parentId: number | null;
  name: string;
  slug: string;
  fieldType: string;
  options: string[] | null;
  required: boolean;
  defaultValue: string | null;
  helpText: string | null;
  order: number;
}

function ManageCustomFieldsModal({
  postTypeSlug,
  onClose,
  onFieldsChanged,
}: {
  postTypeSlug: string;
  onClose: () => void;
  onFieldsChanged: () => void;
}) {
  const [postTypeId, setPostTypeId] = useState<number | null>(null);
  const [fields, setFields] = useState<ManagedField[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingField, setEditingField] = useState<ManagedField | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    fieldType: 'text',
    optionsText: '',
    required: false,
    defaultValue: '',
    helpText: '',
    order: 0,
    parentId: null as number | null,
  });
  const [expandedGroups, setExpandedGroups] = useState<Set<number>>(new Set());

  const generateSlug = (name: string) =>
    name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

  const topLevelFields = fields.filter((f) => !f.parentId);
  const childFieldsOf = (parentId: number) => fields.filter((f) => f.parentId === parentId);

  const toggleGroup = (id: number) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const startAddSubField = (parentId: number) => {
    resetForm();
    setFormData((prev) => ({
      ...prev,
      parentId,
      order: childFieldsOf(parentId).length,
    }));
    setShowForm(true);
  };

  const resetForm = () => {
    setShowForm(false);
    setEditingField(null);
    setError('');
    setFormData({
      name: '',
      slug: '',
      fieldType: 'text',
      optionsText: '',
      required: false,
      defaultValue: '',
      helpText: '',
      order: fields.length,
      parentId: null,
    });
  };

  // Resolve postType slug → id, then fetch fields
  useEffect(() => {
    (async () => {
      try {
        const ptRes = await fetch('/api/post-types');
        const ptData = await ptRes.json();
        if (!ptData.success) return;
        const match = ptData.data.find((pt: { slug: string }) => pt.slug === postTypeSlug);
        if (!match) {
          setLoading(false);
          return;
        }
        setPostTypeId(match.id);
        const cfRes = await fetch(`/api/custom-fields?postTypeId=${match.id}`);
        const cfData = await cfRes.json();
        if (cfData.success) setFields(cfData.data);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    })();
  }, [postTypeSlug]);

  const fetchFields = async () => {
    if (!postTypeId) return;
    const res = await fetch(`/api/custom-fields?postTypeId=${postTypeId}`);
    const data = await res.json();
    if (data.success) setFields(data.data);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!postTypeId) return;
    setError('');
    setSubmitting(true);

    const url = editingField ? `/api/custom-fields/${editingField.id}` : '/api/custom-fields';
    const method = editingField ? 'PUT' : 'POST';
    const options =
      formData.fieldType === 'select' && formData.optionsText
        ? formData.optionsText.split('\n').map((o) => o.trim()).filter(Boolean)
        : null;

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          postTypeId,
          parentId: formData.parentId || null,
          name: formData.name,
          slug: formData.slug,
          fieldType: formData.fieldType,
          options,
          required: formData.required,
          defaultValue: formData.defaultValue || null,
          helpText: formData.helpText || null,
          order: formData.order,
        }),
      });
      if (res.ok) {
        await fetchFields();
        onFieldsChanged();
        resetForm();
      } else {
        const data = await res.json().catch(() => ({ error: 'Failed to save' }));
        setError(data.error || 'Failed to save custom field');
      }
    } catch {
      setError('Network error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (field: ManagedField) => {
    setEditingField(field);
    setFormData({
      name: field.name,
      slug: field.slug,
      fieldType: field.fieldType,
      optionsText: field.options ? field.options.join('\n') : '',
      required: field.required,
      defaultValue: field.defaultValue || '',
      helpText: field.helpText || '',
      order: field.order,
      parentId: field.parentId,
    });
    setShowForm(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this custom field? All saved values for it will be lost.')) return;
    const res = await fetch(`/api/custom-fields/${id}`, { method: 'DELETE' });
    if (res.ok) {
      await fetchFields();
      onFieldsChanged();
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative z-10 w-full max-w-2xl max-h-[85vh] bg-card border border-border rounded-xl shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div>
            <h3 className="text-base font-semibold text-foreground">Manage Custom Fields</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Post type: <span className="font-medium capitalize">{postTypeSlug}</span>
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <span className="material-icons text-xl">close</span>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <span className="material-icons animate-spin text-muted-foreground">progress_activity</span>
            </div>
          ) : !postTypeId ? (
            <div className="text-center py-8">
              <span className="material-icons text-3xl text-muted-foreground mb-2 block">warning</span>
              <p className="text-sm text-muted-foreground">
                Post type &quot;{postTypeSlug}&quot; not found. Create it in admin settings first.
              </p>
            </div>
          ) : (
            <>
              {/* Add / Edit form */}
              {showForm ? (
                <form onSubmit={handleSubmit} className="bg-muted/50 border border-border rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between mb-1">
                    <h4 className="text-sm font-semibold text-foreground">
                      {editingField ? 'Edit Field' : formData.parentId ? 'New Sub-field' : 'New Field'}
                    </h4>
                    <button type="button" onClick={resetForm} className="text-xs text-muted-foreground hover:text-foreground">
                      Cancel
                    </button>
                  </div>

                  {error && (
                    <div className="text-xs text-destructive bg-destructive/10 border border-destructive/30 rounded px-3 py-2">
                      {error}
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1">Name *</label>
                      <input
                        required
                        value={formData.name}
                        onChange={(e) => {
                          const name = e.target.value;
                          setFormData((prev) => ({
                            ...prev,
                            name,
                            ...(!editingField ? { slug: generateSlug(name) } : {}),
                          }));
                        }}
                        placeholder="e.g. Author Name"
                        className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground outline-none focus:border-primary"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1">Slug *</label>
                      <input
                        required
                        value={formData.slug}
                        onChange={(e) => setFormData((prev) => ({ ...prev, slug: e.target.value }))}
                        placeholder="author_name"
                        className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground font-mono outline-none focus:border-primary"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1">Field Type *</label>
                      <select
                        value={formData.fieldType}
                        onChange={(e) => setFormData((prev) => ({ ...prev, fieldType: e.target.value }))}
                        className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground outline-none focus:border-primary"
                      >
                        {FIELD_TYPES
                          .filter((ft) => !formData.parentId || (ft.value !== 'repeater' && ft.value !== 'group'))
                          .map((ft) => (
                          <option key={ft.value} value={ft.value}>{ft.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1">Order</label>
                      <input
                        type="number"
                        value={formData.order}
                        onChange={(e) => setFormData((prev) => ({ ...prev, order: parseInt(e.target.value) || 0 }))}
                        className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground outline-none focus:border-primary"
                      />
                    </div>
                  </div>

                  {formData.fieldType === 'select' && (
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1">Options (one per line)</label>
                      <textarea
                        value={formData.optionsText}
                        onChange={(e) => setFormData((prev) => ({ ...prev, optionsText: e.target.value }))}
                        rows={3}
                        placeholder={'Option 1\nOption 2\nOption 3'}
                        className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground outline-none focus:border-primary resize-none"
                      />
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1">Default Value</label>
                      <input
                        value={formData.defaultValue}
                        onChange={(e) => setFormData((prev) => ({ ...prev, defaultValue: e.target.value }))}
                        className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground outline-none focus:border-primary"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1">Help Text</label>
                      <input
                        value={formData.helpText}
                        onChange={(e) => setFormData((prev) => ({ ...prev, helpText: e.target.value }))}
                        placeholder="Description for editors"
                        className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground outline-none focus:border-primary"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={formData.required}
                        onChange={(e) => setFormData((prev) => ({ ...prev, required: e.target.checked }))}
                        className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                      />
                      <span className="text-sm text-foreground">Required</span>
                    </label>
                    <button
                      type="submit"
                      disabled={submitting}
                      className="px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-lg hover:bg-primary/90 disabled:opacity-50"
                    >
                      {submitting ? 'Saving...' : editingField ? 'Update Field' : 'Add Field'}
                    </button>
                  </div>
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    resetForm();
                    setShowForm(true);
                  }}
                  className="flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary/80"
                >
                  <span className="material-icons text-base">add</span>
                  Add Field
                </button>
              )}

              {/* Fields list */}
              {topLevelFields.length === 0 && !showForm ? (
                <div className="text-center py-8">
                  <span className="material-icons text-3xl text-muted-foreground mb-2 block">input</span>
                  <p className="text-sm text-muted-foreground">No fields defined for this post type yet.</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {topLevelFields.map((field) => {
                    const isContainer = field.fieldType === 'repeater' || field.fieldType === 'group';
                    const children = isContainer ? childFieldsOf(field.id) : [];
                    const isExpanded = expandedGroups.has(field.id);
                    return (
                      <div key={field.id}>
                        <div
                          className="flex items-center justify-between px-3 py-2.5 rounded-lg border border-border bg-background hover:bg-muted/50 group"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            {isContainer ? (
                              <button
                                type="button"
                                onClick={() => toggleGroup(field.id)}
                                className="text-muted-foreground hover:text-foreground shrink-0"
                              >
                                <span className="material-icons text-base">
                                  {isExpanded ? 'expand_more' : 'chevron_right'}
                                </span>
                              </button>
                            ) : (
                              <span className="text-xs text-muted-foreground font-mono w-5 text-right shrink-0">
                                {field.order}
                              </span>
                            )}
                            <span className="material-icons text-sm text-muted-foreground shrink-0">
                              {field.fieldType === 'repeater' ? 'repeat' : field.fieldType === 'group' ? 'folder' : 'input'}
                            </span>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-foreground truncate">{field.name}</span>
                                {field.required && <span className="text-red-500 text-xs">*</span>}
                              </div>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-xs font-mono text-muted-foreground">{field.slug}</span>
                                <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-primary/10 text-primary">
                                  {field.fieldType}
                                </span>
                                {isContainer && (
                                  <span className="text-[10px] text-muted-foreground">{children.length} sub-field{children.length !== 1 ? 's' : ''}</span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                            {isContainer && (
                              <button
                                type="button"
                                onClick={() => { toggleGroup(field.id); startAddSubField(field.id); }}
                                className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-primary"
                                title="Add sub-field"
                              >
                                <span className="material-icons text-base">add</span>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleEdit(field)}
                              className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                              title="Edit"
                            >
                              <span className="material-icons text-base">edit</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(field.id)}
                              className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                              title="Delete"
                            >
                              <span className="material-icons text-base">delete</span>
                            </button>
                          </div>
                        </div>
                        {/* Sub-fields */}
                        {isContainer && isExpanded && children.length > 0 && (
                          <div className="ml-8 mt-1 space-y-1 border-l-2 border-border pl-3">
                            {children.map((child) => (
                              <div
                                key={child.id}
                                className="flex items-center justify-between px-3 py-2 rounded-lg border border-border bg-muted/30 hover:bg-muted/50 group/child"
                              >
                                <div className="flex items-center gap-3 min-w-0">
                                  <span className="text-xs text-muted-foreground font-mono w-5 text-right shrink-0">
                                    {child.order}
                                  </span>
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                      <span className="text-sm font-medium text-foreground truncate">{child.name}</span>
                                      {child.required && <span className="text-red-500 text-xs">*</span>}
                                    </div>
                                    <div className="flex items-center gap-2 mt-0.5">
                                      <span className="text-xs font-mono text-muted-foreground">{child.slug}</span>
                                      <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-primary/10 text-primary">
                                        {child.fieldType}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                                <div className="flex items-center gap-1 opacity-0 group-hover/child:opacity-100 transition-opacity shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => handleEdit(child)}
                                    className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                                    title="Edit"
                                  >
                                    <span className="material-icons text-base">edit</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDelete(child.id)}
                                    className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                                    title="Delete"
                                  >
                                    <span className="material-icons text-base">delete</span>
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end px-6 py-3 border-t border-border shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-foreground bg-card border border-border rounded-lg hover:bg-accent"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Custom Field types ─────────────────────────────────────────────────────

interface CustomFieldDef {
  id: number;
  parentId: number | null;
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

// ─── Custom Fields Tab Content (groups + repeaters) ─────────────────────────

function CustomFieldsTabContent({
  customFieldDefs,
  customFieldValues,
  updateCustomFieldValue,
  siteId,
  postType,
  showManageFieldsModal,
  setShowManageFieldsModal,
  setCustomFieldsLoaded,
}: {
  customFieldDefs: CustomFieldDef[];
  customFieldValues: Record<number, string>;
  updateCustomFieldValue: (fieldId: number, value: string) => void;
  siteId: number;
  postType: string;
  showManageFieldsModal: boolean;
  setShowManageFieldsModal: (v: boolean) => void;
  setCustomFieldsLoaded: (v: boolean) => void;
}) {
  const [collapsedGroups, setCollapsedGroups] = useState<Set<number>>(new Set());
  const [repeaterRows, setRepeaterRows] = useState<Record<number, Array<Record<string, string>>>>({});
  const debounceTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  const topLevelDefs = customFieldDefs.filter((f) => !f.parentId);
  const childDefsOf = useCallback(
    (parentId: number) => customFieldDefs.filter((f) => f.parentId === parentId),
    [customFieldDefs]
  );

  // Parse repeater JSON values on load
  useEffect(() => {
    const repeaters = customFieldDefs.filter((f) => f.fieldType === 'repeater' && !f.parentId);
    const parsed: Record<number, Array<Record<string, string>>> = {};
    for (const r of repeaters) {
      const raw = customFieldValues[r.id];
      if (raw) {
        try {
          const arr = JSON.parse(raw);
          if (Array.isArray(arr)) {
            parsed[r.id] = arr;
            continue;
          }
        } catch { /* ignore */ }
      }
      parsed[r.id] = [];
    }
    setRepeaterRows(parsed);
  }, [customFieldDefs, customFieldValues]);

  const toggleGroup = (id: number) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const updateRepeaterRow = (repeaterId: number, rowIndex: number, slug: string, value: string) => {
    setRepeaterRows((prev) => {
      const rows = [...(prev[repeaterId] || [])];
      rows[rowIndex] = { ...rows[rowIndex], [slug]: value };
      const next = { ...prev, [repeaterId]: rows };
      // Debounced save
      if (debounceTimers.current[repeaterId]) clearTimeout(debounceTimers.current[repeaterId]);
      debounceTimers.current[repeaterId] = setTimeout(() => {
        updateCustomFieldValue(repeaterId, JSON.stringify(next[repeaterId]));
      }, 300);
      return next;
    });
  };

  const addRepeaterRow = (repeaterId: number) => {
    setRepeaterRows((prev) => {
      const rows = [...(prev[repeaterId] || []), {}];
      const next = { ...prev, [repeaterId]: rows };
      updateCustomFieldValue(repeaterId, JSON.stringify(rows));
      return next;
    });
  };

  const removeRepeaterRow = (repeaterId: number, rowIndex: number) => {
    setRepeaterRows((prev) => {
      const rows = (prev[repeaterId] || []).filter((_, i) => i !== rowIndex);
      const next = { ...prev, [repeaterId]: rows };
      updateCustomFieldValue(repeaterId, JSON.stringify(rows));
      return next;
    });
  };

  const renderFieldInput = (field: CustomFieldDef, value: string, onChange: (val: string) => void) => {
    const inputClass = 'w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground outline-none focus:border-primary';
    switch (field.fieldType) {
      case 'textarea':
        return <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={3} placeholder={field.defaultValue || ''} className={`${inputClass} resize-none`} />;
      case 'select':
        return (
          <select value={value} onChange={(e) => onChange(e.target.value)} className={inputClass}>
            <option value="">Select...</option>
            {(field.options || []).map((opt) => <option key={opt} value={opt}>{opt}</option>)}
          </select>
        );
      case 'checkbox':
        return (
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={value === 'true'} onChange={(e) => onChange(String(e.target.checked))} className="h-4 w-4 rounded border-border text-primary focus:ring-primary" />
            <span className="text-sm text-foreground">{field.helpText || field.name}</span>
          </label>
        );
      case 'number':
        return <input type="number" value={value} onChange={(e) => onChange(e.target.value)} placeholder={field.defaultValue || ''} className={inputClass} />;
      case 'date':
        return <input type="date" value={value} onChange={(e) => onChange(e.target.value)} className={inputClass} />;
      case 'image':
        return <MediaPicker value={value} onChange={onChange} label="" apiEndpoint={`/api/portal/cms/websites/${siteId}/media`} />;
      default:
        return <input type={field.fieldType === 'url' ? 'url' : field.fieldType === 'email' ? 'email' : 'text'} value={value} onChange={(e) => onChange(e.target.value)} placeholder={field.defaultValue || ''} className={inputClass} />;
    }
  };

  const renderField = (field: CustomFieldDef) => {
    // Skip sub-fields at top level (they render inside their parent)
    if (field.parentId) return null;

    if (field.fieldType === 'group') {
      const children = childDefsOf(field.id);
      const isCollapsed = collapsedGroups.has(field.id);
      return (
        <div key={field.id} className="border border-border rounded-lg overflow-hidden">
          <button
            type="button"
            onClick={() => toggleGroup(field.id)}
            className="w-full flex items-center gap-2 px-3 py-2.5 bg-muted/50 hover:bg-muted text-left"
          >
            <span className="material-icons text-base text-muted-foreground">
              {isCollapsed ? 'chevron_right' : 'expand_more'}
            </span>
            <span className="material-icons text-sm text-muted-foreground">folder</span>
            <span className="text-sm font-medium text-foreground">{field.name}</span>
            <span className="text-xs text-muted-foreground ml-auto">{children.length} field{children.length !== 1 ? 's' : ''}</span>
          </button>
          {!isCollapsed && (
            <div className="p-3 space-y-4 border-t border-border">
              {children.length === 0 ? (
                <p className="text-xs text-muted-foreground">No sub-fields in this group yet.</p>
              ) : (
                children.map((child) => (
                  <div key={child.id}>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">
                      {child.name}
                      {child.required && <span className="text-red-500 ml-0.5">*</span>}
                    </label>
                    {renderFieldInput(child, customFieldValues[child.id] || '', (val) => updateCustomFieldValue(child.id, val))}
                    {child.helpText && child.fieldType !== 'checkbox' && (
                      <p className="text-xs text-muted-foreground mt-1">{child.helpText}</p>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      );
    }

    if (field.fieldType === 'repeater') {
      const subFields = childDefsOf(field.id);
      const rows = repeaterRows[field.id] || [];
      const isCollapsed = collapsedGroups.has(field.id);
      return (
        <div key={field.id} className="border border-border rounded-lg overflow-hidden">
          <button
            type="button"
            onClick={() => toggleGroup(field.id)}
            className="w-full flex items-center gap-2 px-3 py-2.5 bg-muted/50 hover:bg-muted text-left"
          >
            <span className="material-icons text-base text-muted-foreground">
              {isCollapsed ? 'chevron_right' : 'expand_more'}
            </span>
            <span className="material-icons text-sm text-muted-foreground">repeat</span>
            <span className="text-sm font-medium text-foreground">{field.name}</span>
            <span className="text-xs text-muted-foreground ml-auto">{rows.length} row{rows.length !== 1 ? 's' : ''}</span>
          </button>
          {!isCollapsed && (
            <div className="p-3 space-y-3 border-t border-border">
              {subFields.length === 0 ? (
                <p className="text-xs text-muted-foreground">No sub-fields defined for this repeater yet.</p>
              ) : (
                <>
                  {rows.map((row, rowIdx) => (
                    <div key={rowIdx} className="border border-border rounded-lg p-3 bg-background space-y-3 relative">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium text-muted-foreground">Row {rowIdx + 1}</span>
                        <button
                          type="button"
                          onClick={() => removeRepeaterRow(field.id, rowIdx)}
                          className="p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                          title="Remove row"
                        >
                          <span className="material-icons text-sm">delete_outline</span>
                        </button>
                      </div>
                      {subFields.map((sf) => (
                        <div key={sf.id}>
                          <label className="block text-xs font-medium text-muted-foreground mb-1">
                            {sf.name}
                            {sf.required && <span className="text-red-500 ml-0.5">*</span>}
                          </label>
                          {renderFieldInput(sf, row[sf.slug] || '', (val) => updateRepeaterRow(field.id, rowIdx, sf.slug, val))}
                          {sf.helpText && sf.fieldType !== 'checkbox' && (
                            <p className="text-xs text-muted-foreground mt-1">{sf.helpText}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => addRepeaterRow(field.id)}
                    className="flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary/80 w-full justify-center py-2 border border-dashed border-border rounded-lg hover:border-primary/50"
                  >
                    <span className="material-icons text-base">add_circle_outline</span>
                    Add Row
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      );
    }

    // Regular field
    return (
      <div key={field.id}>
        <label className="block text-xs font-medium text-muted-foreground mb-1">
          {field.name}
          {field.required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
        {renderFieldInput(field, customFieldValues[field.id] || '', (val) => updateCustomFieldValue(field.id, val))}
        {field.helpText && field.fieldType !== 'checkbox' && (
          <p className="text-xs text-muted-foreground mt-1">{field.helpText}</p>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => setShowManageFieldsModal(true)}
        className="flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary/80"
      >
        <span className="material-icons text-base">settings</span>
        Manage Fields
      </button>

      {showManageFieldsModal && (
        <ManageCustomFieldsModal
          postTypeSlug={postType}
          onClose={() => setShowManageFieldsModal(false)}
          onFieldsChanged={() => setCustomFieldsLoaded(false)}
        />
      )}

      {topLevelDefs.length === 0 ? (
        <div className="text-center py-8">
          <span className="material-icons text-3xl text-muted-foreground mb-2 block">input</span>
          <p className="text-sm text-muted-foreground">No custom fields defined yet.</p>
          <p className="text-xs text-muted-foreground mt-1">Click &quot;Manage Fields&quot; above to add fields for this post type.</p>
        </div>
      ) : (
        topLevelDefs.map((field) => renderField(field))
      )}
    </div>
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
  const [showManageFieldsModal, setShowManageFieldsModal] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const saveStatusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    if (!formData.id) return;

    setSaveStatus('saving');
    if (saveStatusTimer.current) clearTimeout(saveStatusTimer.current);

    fetch(`/api/posts/${formData.id}/custom-fields`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customFieldId: fieldId, value }),
    })
      .then((res) => {
        setSaveStatus(res.ok ? 'saved' : 'error');
        saveStatusTimer.current = setTimeout(() => setSaveStatus('idle'), 2000);
      })
      .catch(() => {
        setSaveStatus('error');
        saveStatusTimer.current = setTimeout(() => setSaveStatus('idle'), 3000);
      });
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />
      <div className="fixed top-0 right-0 z-50 h-full w-96 bg-card border-l border-border shadow-xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-foreground">Page Details</h3>
            {saveStatus === 'saving' && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground animate-pulse">
                <span className="material-icons text-sm animate-spin">progress_activity</span>
                Saving
              </span>
            )}
            {saveStatus === 'saved' && (
              <span className="flex items-center gap-1 text-xs text-green-600">
                <span className="material-icons text-sm">check_circle</span>
                Saved
              </span>
            )}
            {saveStatus === 'error' && (
              <span className="flex items-center gap-1 text-xs text-destructive">
                <span className="material-icons text-sm">error</span>
                Save failed
              </span>
            )}
          </div>
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
            <CustomFieldsTabContent
              customFieldDefs={customFieldDefs}
              customFieldValues={customFieldValues}
              updateCustomFieldValue={updateCustomFieldValue}
              siteId={siteId}
              postType={formData.postType}
              showManageFieldsModal={showManageFieldsModal}
              setShowManageFieldsModal={setShowManageFieldsModal}
              setCustomFieldsLoaded={setCustomFieldsLoaded}
            />
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
