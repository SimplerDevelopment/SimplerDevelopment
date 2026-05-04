// Inline settings panel for non-iframe editor modes (visual / classic).
'use client';

import { ContentTypeSelect } from './ContentTypeSelect';
import type { Post, TaxonomyItem } from '../_lib/types';
import type { ContentTypeOption } from '@/lib/hooks/useContentTypes';

interface InlineSettingsPanelProps {
  formData: Post;
  setFormData: React.Dispatch<React.SetStateAction<Post>>;
  handleTitleChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  contentTypes: ContentTypeOption[];
  availableCategories: TaxonomyItem[];
  availableTags: TaxonomyItem[];
  onClose: () => void;
}

export function InlineSettingsPanel({
  formData,
  setFormData,
  handleTitleChange,
  contentTypes,
  availableCategories,
  availableTags,
  onClose,
}: InlineSettingsPanelProps) {
  return (
    <div className="bg-card border border-border rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-foreground">Post Settings</h3>
        <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
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
          <ContentTypeSelect
            value={formData.postType}
            contentTypes={contentTypes}
            onChange={(slug) => setFormData(prev => ({ ...prev, postType: slug }))}
            className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground outline-none focus:border-primary"
          />
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
  );
}
