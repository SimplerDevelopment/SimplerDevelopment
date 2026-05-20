'use client';

import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import MediaPicker from './MediaPicker';
import { BlockEditor } from '@/components/blocks/BlockEditor';
import { EditorWithPreview } from '@/components/blocks/EditorWithPreview';
import { BlockType } from '@/types/blocks';
import { Block, BlockEditorData } from '@/types/blocks';
import { Breakpoint } from '@/types/responsive';
import { PostSettingsModal } from './PostSettingsModal';
import { PostEditorLayout } from './PostEditorLayout';
import { ViewportSelector } from '@/components/blocks/ViewportSelector';
import { BlockEditorProvider } from '@/contexts/BlockEditorContext';
import { DesignTokensProvider } from '@/contexts/DesignTokensContext';
import { PostFormInnerControls } from './PostFormInner';

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
}

interface PostFormProps {
  post?: Post;
  mode: 'create' | 'edit';
}

interface PostType {
  id: number;
  name: string;
  slug: string;
  icon: string;
  active: boolean;
}

interface CustomField {
  id: number;
  postTypeId: number;
  name: string;
  slug: string;
  fieldType: string;
  options: string[] | null;
  required: boolean;
  defaultValue?: string | null;
  helpText?: string | null;
  order: number;
}

interface User {
  id: number;
  name: string;
  email: string;
  role: string;
  active: boolean;
}

export default function PostForm({ post, mode }: PostFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [contentMenuOpen, setContentMenuOpen] = useState(false);
  const [postTypes, setPostTypes] = useState<PostType[]>([]);
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, string>>({});
  const [users, setUsers] = useState<User[]>([]);
  const [contentMode, setContentMode] = useState<'blocks' | 'raw'>('blocks');
  const [editorMode, setEditorMode] = useState<'visual' | 'classic'>('visual');
  const [currentViewport, setCurrentViewport] = useState<Breakpoint>('desktop');

  // Block types for visual editor
  const blockTypes: Array<{ type: BlockType; label: string; icon: string; category: string; description: string }> = [
    { type: 'heading', label: 'Heading', icon: '📝', category: 'Basic', description: 'Add a title or heading' },
    { type: 'text', label: 'Text', icon: '📄', category: 'Basic', description: 'Plain paragraph text' },
    { type: 'button', label: 'Button', icon: '🔘', category: 'Basic', description: 'Add a call-to-action button' },
    { type: 'quote', label: 'Quote', icon: '💬', category: 'Basic', description: 'Add a quotation' },
    { type: 'image', label: 'Image', icon: '🖼️', category: 'Media', description: 'Insert an image' },
    { type: 'youtube', label: 'YouTube', icon: '📺', category: 'Media', description: 'Embed a YouTube video' },
    { type: 'video', label: 'Video', icon: '🎬', category: 'Media', description: 'Embed a video file' },
    { type: 'code', label: 'Code', icon: '💻', category: 'Media', description: 'Display code snippet' },
    { type: 'spacer', label: 'Spacer', icon: '↕️', category: 'Layout', description: 'Add vertical space' },
    { type: 'divider', label: 'Divider', icon: '➖', category: 'Layout', description: 'Add a horizontal line' },
    { type: 'columns', label: 'Columns', icon: '📊', category: 'Layout', description: 'Display content in columns' },
    { type: 'accordion', label: 'Accordion', icon: '📑', category: 'Layout', description: 'Collapsible content sections' },
    { type: 'tabs', label: 'Tabs', icon: '🗂️', category: 'Layout', description: 'Tabbed content sections' },
    { type: 'section', label: 'Section', icon: '📦', category: 'Layout', description: 'Container wrapper with styling' },
    { type: 'hero', label: 'Hero', icon: '🎯', category: 'Components', description: 'Hero section with CTA' },
    { type: 'services-grid', label: 'Services', icon: '📦', category: 'Components', description: 'Grid of services' },
    { type: 'cta', label: 'Call to Action', icon: '📢', category: 'Components', description: 'CTA section' },
    { type: 'card-grid', label: 'Card Grid', icon: '🎴', category: 'Components', description: 'Grid of cards' },
    { type: 'stats', label: 'Stats', icon: '📈', category: 'Components', description: 'Statistics display' },
    { type: 'testimonial', label: 'Testimonial', icon: '⭐', category: 'Components', description: 'Customer testimonial' },
    { type: 'featured-content', label: 'Featured Content', icon: '✨', category: 'Components', description: 'Featured content with image' },
    { type: 'blog-posts', label: 'Blog Posts', icon: '📰', category: 'Components', description: 'Display blog posts' },
    { type: 'gallery', label: 'Gallery', icon: '🖼️', category: 'Media', description: 'Image gallery with lightbox' },
  ];

  // Parse existing content to blocks or initialize empty
  const parseContentToBlocks = (content: string): Block[] => {
    if (!content) return [];

    try {
      const parsed = JSON.parse(content) as BlockEditorData;
      return parsed.blocks || [];
    } catch {
      // If not valid JSON, treat as legacy text content
      return [];
    }
  };

  const [blocks, setBlocks] = useState<Block[]>(parseContentToBlocks(post?.content || ''));
  const [formData, setFormData] = useState<Post>({
    title: post?.title || '',
    slug: post?.slug || '',
    postType: post?.postType || 'blog',
    excerpt: post?.excerpt || '',
    content: post?.content || '',
    coverImage: post?.coverImage || '',
    published: post?.published || false,
    publishedAt: post?.publishedAt || null,
  });

  useEffect(() => {
    fetchPostTypes();
    fetchUsers();
  }, []);

  useEffect(() => {
    if (formData.postType && postTypes.length > 0) {
      fetchCustomFieldsForPostType(formData.postType);
    }
  }, [formData.postType, postTypes]);

  useEffect(() => {
    if (post?.id && customFields.length > 0) {
      fetchCustomFieldValues(post.id);
    }
  }, [post?.id, customFields]);

  const fetchPostTypes = async () => {
    try {
      const response = await fetch('/api/post-types');
      const data = await response.json();
      if (data.success) {
        setPostTypes(data.data.filter((pt: PostType) => pt.active));
      }
    } catch (error) {
      console.error('Error fetching post types:', error);
    }
  };

  const fetchUsers = async () => {
    try {
      const response = await fetch('/api/users');
      const data = await response.json();
      if (data.success) {
        setUsers(data.data.filter((u: User) => u.active));
      }
    } catch (error) {
      console.error('Error fetching users:', error);
    }
  };

  const fetchCustomFieldsForPostType = async (postTypeSlug: string) => {
    try {
      // Find the post type ID from slug
      const postType = postTypes.find(pt => pt.slug === postTypeSlug);
      if (!postType) return;

      const response = await fetch(`/api/custom-fields?postTypeId=${postType.id}`);
      const data = await response.json();
      if (data.success) {
        setCustomFields(data.data);
        // Initialize field values with defaults
        const defaults: Record<string, string> = {};
        data.data.forEach((field: CustomField) => {
          if (field.defaultValue) {
            defaults[field.slug] = field.defaultValue;
          }
        });
        setCustomFieldValues(prev => ({ ...defaults, ...prev }));
      }
    } catch (error) {
      console.error('Error fetching custom fields:', error);
    }
  };

  const fetchCustomFieldValues = async (postId: number) => {
    try {
      const response = await fetch(`/api/posts/${postId}/custom-fields`);
      const data = await response.json();
      if (data.success) {
        const values: Record<string, string> = {};
        data.data.forEach((item: any) => {
          values[item.slug] = item.value;
        });
        setCustomFieldValues(values);
      }
    } catch (error) {
      console.error('Error fetching custom field values:', error);
    }
  };

  const generateSlug = (title: string) => {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  };

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const title = e.target.value;
    setFormData((prev) => ({
      ...prev,
      title,
      slug: mode === 'create' ? generateSlug(title) : prev.slug,
    }));
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setLoading(true);

    try {
      const url = mode === 'create' ? '/api/posts' : `/api/posts/${post?.id}`;
      const method = mode === 'create' ? 'POST' : 'PUT';

      // Serialize blocks to JSON for storage
      const contentData: BlockEditorData = {
        blocks,
        version: '1.0',
      };

      const contentToSave = contentMode === 'blocks'
        ? JSON.stringify(contentData)
        : formData.content;

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          content: contentToSave,
          customFields: customFieldValues,
        }),
      });

      if (response.ok) {
        router.push('/admin/posts');
        router.refresh();
      } else {
        const data = await response.json();
        alert(data.error || 'Failed to save post');
      }
    } catch (error) {
      alert('An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const renderCustomField = (field: CustomField) => {
    const value = customFieldValues[field.slug] || '';

    const commonClasses = "mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-foreground focus:border-primary focus:outline-none focus:ring-primary";

    switch (field.fieldType) {
      case 'text':
      case 'url':
      case 'email':
        return (
          <input
            type={field.fieldType}
            id={field.slug}
            required={field.required}
            value={value}
            onChange={(e) => setCustomFieldValues({ ...customFieldValues, [field.slug]: e.target.value })}
            className={commonClasses}
            placeholder={field.helpText || ''}
          />
        );

      case 'textarea':
        return (
          <textarea
            id={field.slug}
            required={field.required}
            value={value}
            onChange={(e) => setCustomFieldValues({ ...customFieldValues, [field.slug]: e.target.value })}
            rows={4}
            className={commonClasses}
            placeholder={field.helpText || ''}
          />
        );

      case 'number':
        return (
          <input
            type="number"
            id={field.slug}
            required={field.required}
            value={value}
            onChange={(e) => setCustomFieldValues({ ...customFieldValues, [field.slug]: e.target.value })}
            className={commonClasses}
            placeholder={field.helpText || ''}
          />
        );

      case 'date':
        return (
          <input
            type="date"
            id={field.slug}
            required={field.required}
            value={value}
            onChange={(e) => setCustomFieldValues({ ...customFieldValues, [field.slug]: e.target.value })}
            className={commonClasses}
          />
        );

      case 'select':
        return (
          <select
            id={field.slug}
            required={field.required}
            value={value}
            onChange={(e) => setCustomFieldValues({ ...customFieldValues, [field.slug]: e.target.value })}
            className={commonClasses}
          >
            <option value="">Select an option...</option>
            {field.options?.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        );

      case 'checkbox':
        return (
          <div className="flex items-center mt-2">
            <input
              type="checkbox"
              id={field.slug}
              checked={value === 'true'}
              onChange={(e) => setCustomFieldValues({ ...customFieldValues, [field.slug]: e.target.checked.toString() })}
              className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
            />
            <label htmlFor={field.slug} className="ml-2 text-sm text-muted-foreground">
              {field.helpText || field.name}
            </label>
          </div>
        );

      case 'image':
        return (
          <MediaPicker
            value={value}
            onChange={(url) => setCustomFieldValues({ ...customFieldValues, [field.slug]: url })}
            label={field.name}
            required={field.required}
          />
        );

      case 'user_select':
        return (
          <select
            id={field.slug}
            required={field.required}
            value={value}
            onChange={(e) => setCustomFieldValues({ ...customFieldValues, [field.slug]: e.target.value })}
            className={commonClasses}
          >
            <option value="">Select a user...</option>
            {users.map((user) => (
              <option key={user.id} value={user.id.toString()}>
                {user.name} ({user.email})
              </option>
            ))}
          </select>
        );

      default:
        return null;
    }
  };

  // Render function for editor controls
  const renderEditorControls = () => (
    <PostFormInnerControls
      contentMode={contentMode}
      editorMode={editorMode}
      onEditorModeChange={setEditorMode}
      contentMenuOpen={contentMenuOpen}
      onContentMenuToggle={() => setContentMenuOpen(!contentMenuOpen)}
      onContentModeChange={setContentMode}
    />
  );

  // Wrap everything in provider when using visual block editor
  const layoutContent = (
    <form onSubmit={handleSubmit} className="container mx-auto px-4 py-6 space-y-6">
      {/* Settings Modal */}
      <PostSettingsModal
        isOpen={settingsModalOpen}
        onClose={() => setSettingsModalOpen(false)}
        formData={formData}
        onFormDataChange={(updates) => setFormData({ ...formData, ...updates })}
        postTypes={postTypes}
        customFields={customFields}
        customFieldValues={customFieldValues}
        onCustomFieldChange={(slug, value) => setCustomFieldValues({ ...customFieldValues, [slug]: value })}
        mode={mode}
        users={users}
        onPostTypeChange={(postType) => {
          setFormData({ ...formData, postType });
          setCustomFieldValues({});
        }}
        renderCustomField={renderCustomField}
      />

      {/* Content Editor - Always Visible */}
      <div className="bg-card border border-border shadow rounded-lg">
        <div className="p-6">
          {contentMode === 'blocks' ? (
            editorMode === 'visual' ? (
              <EditorWithPreview
                onChange={(newBlocks) => {
                  console.log('[PostForm] onChange called with', newBlocks.length, 'blocks');
                  setBlocks(newBlocks);
                }}
                blockTypes={blockTypes}
              />
            ) : (
              <BlockEditor blocks={blocks} onChange={setBlocks} />
            )
          ) : (
            <div>
              <textarea
                id="content"
                required
                rows={20}
                value={formData.content}
                onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                className="mt-1 block w-full rounded-md border border-border bg-background px-3 py-2 text-foreground focus:border-primary focus:outline-none focus:ring-primary font-mono text-sm"
                placeholder="Post content (supports HTML/Markdown)"
              />
            </div>
          )}
        </div>
      </div>

      {/* Action Buttons - Always visible */}
      <div className="flex gap-4">
        <button
          type="submit"
          disabled={loading}
          className="px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Saving...' : mode === 'create' ? 'Create Post' : 'Update Post'}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
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
          postTitle={formData.title}
          onOpenSettings={() => setSettingsModalOpen(true)}
          editorControls={renderEditorControls()}
          published={formData.published}
          onPublish={handleSubmit}
          onStatusChange={(status) => setFormData({ ...formData, published: status === 'published' })}
        >
          {layoutContent}
        </PostEditorLayout>
      </BlockEditorProvider>
    </DesignTokensProvider>
  );
}
