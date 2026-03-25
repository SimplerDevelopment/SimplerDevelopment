'use client';

import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
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

export default function PortalPostForm({ siteId, post, mode, siteUrl }: PortalPostFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [contentMenuOpen, setContentMenuOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<'visual' | 'classic' | 'iframe'>(
    siteUrl && mode === 'edit' ? 'iframe' : 'visual',
  );
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
          published={formData.published}
          onPublish={handleSubmit}
          onStatusChange={(status) => setFormData(prev => ({ ...prev, published: status === 'published' }))}
        >
          {editorMode === 'iframe' && siteUrl && post?.slug ? (
            <VisualEditorShell
              blocks={blocks}
              selectedBlockId={null}
              iframeSrc={`${siteUrl}/blog/${post.slug}?_edit=true`}
              onBlocksChange={setBlocks}
              onSelectBlock={() => {}}
              onAddBlock={(type) => {
                const newBlock = { id: `block-${Date.now()}`, type, order: blocks.length, content: '' } as Block;
                setBlocks([...blocks, newBlock]);
              }}
              onDeleteBlock={(blockId) => setBlocks(blocks.filter(b => b.id !== blockId))}
              onUpdateBlock={(blockId, updates) => setBlocks(blocks.map(b => b.id === blockId ? ({ ...b, ...updates } as Block) : b))}
            />
          ) : (
            layoutContent
          )}
        </PostEditorLayout>
      </BlockEditorProvider>
    </DesignTokensProvider>
  );
}
