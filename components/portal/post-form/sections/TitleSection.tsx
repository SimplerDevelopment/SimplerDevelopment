// Title + slug inputs for the post form's settings panels (stacked layout).
'use client';

import type { Post } from '../_lib/types';

interface TitleSectionProps {
  formData: Post;
  setFormData: React.Dispatch<React.SetStateAction<Post>>;
  handleTitleChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export function TitleSection({ formData, setFormData, handleTitleChange }: TitleSectionProps) {
  return (
    <>
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
    </>
  );
}
