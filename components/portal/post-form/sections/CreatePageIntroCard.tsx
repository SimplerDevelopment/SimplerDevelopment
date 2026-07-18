// Create-mode intro card shown when iframe editor is requested but no post exists yet.
'use client';

import { ContentTypeSelect } from './ContentTypeSelect';
import { sanitizeSlugInput } from '../_lib/validation';
import type { Post } from '../_lib/types';
import type { ContentTypeOption } from '@/lib/hooks/useContentTypes';

interface CreatePageIntroCardProps {
  formData: Post;
  setFormData: React.Dispatch<React.SetStateAction<Post>>;
  handleTitleChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  contentTypes: ContentTypeOption[];
  loading: boolean;
  onSubmit: () => void;
}

export function CreatePageIntroCard({
  formData,
  setFormData,
  handleTitleChange,
  contentTypes,
  loading,
  onSubmit,
}: CreatePageIntroCardProps) {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <span className="material-icons text-5xl text-muted-foreground/30 mb-3 block">edit_note</span>
          <h3 className="text-lg font-semibold text-foreground">Create New Page</h3>
          <p className="text-sm text-muted-foreground mt-1">Fill in the details below to create the page and open the visual editor.</p>
        </div>

        <div className="space-y-4 bg-card border border-border rounded-xl p-6">
          {/* Title */}
          <label className="block">
            <span className="text-sm font-medium text-foreground">Title <span className="text-destructive">*</span></span>
            <input
              type="text"
              value={formData.title}
              onChange={handleTitleChange}
              placeholder="e.g. About Us, Contact, Services"
              className="mt-1.5 block w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary outline-none"
              autoFocus
            />
          </label>

          {/* Slug */}
          <label className="block">
            <span className="text-sm font-medium text-foreground">URL Slug</span>
            <div className="mt-1.5 flex items-center gap-0 rounded-lg border border-border overflow-hidden focus-within:border-primary focus-within:ring-1 focus-within:ring-primary">
              <span className="px-3 py-2.5 bg-muted text-xs text-muted-foreground border-r border-border shrink-0">/</span>
              <input
                type="text"
                value={formData.slug}
                onChange={(e) => setFormData(prev => ({ ...prev, slug: sanitizeSlugInput(e.target.value) }))}
                placeholder="auto-generated-from-title"
                className="block w-full bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none"
              />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Auto-generated from title. Edit to customize.</p>
          </label>

          {/* Post Type */}
          <label className="block">
            <span className="text-sm font-medium text-foreground">Type</span>
            <ContentTypeSelect
              value={formData.postType}
              contentTypes={contentTypes}
              onChange={(slug) => setFormData(prev => ({ ...prev, postType: slug }))}
              className="mt-1.5 block w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:border-primary focus:ring-1 focus:ring-primary outline-none"
            />
          </label>

          {/* Create button */}
          <button
            onClick={onSubmit}
            disabled={loading || !formData.title.trim()}
            className="w-full mt-2 inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            <span className="material-icons text-lg">save</span>
            {loading ? 'Creating...' : 'Create & Open Editor'}
          </button>
        </div>
      </div>
    </div>
  );
}
