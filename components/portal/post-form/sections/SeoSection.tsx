// SEO meta section: title, description, OG image, canonical, noindex toggle.
'use client';

import MediaPicker from '@/components/admin/MediaPicker';
import type { Post } from '../_lib/types';

interface SeoSectionProps {
  siteId: number;
  formData: Post;
  setFormData: React.Dispatch<React.SetStateAction<Post>>;
}

export function SeoSection({ siteId, formData, setFormData }: SeoSectionProps) {
  return (
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
  );
}
