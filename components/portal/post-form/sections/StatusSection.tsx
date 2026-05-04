// Published/draft status select for the post settings panel.
'use client';

import type { Post } from '../_lib/types';

interface StatusSectionProps {
  formData: Post;
  setFormData: React.Dispatch<React.SetStateAction<Post>>;
}

export function StatusSection({ formData, setFormData }: StatusSectionProps) {
  return (
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
  );
}
