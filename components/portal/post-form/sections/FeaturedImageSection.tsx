// Cover image picker (featured image) backed by the per-site media API.
'use client';

import MediaPicker from '@/components/admin/MediaPicker';
import type { Post } from '../_lib/types';

interface FeaturedImageSectionProps {
  siteId: number;
  formData: Post;
  setFormData: React.Dispatch<React.SetStateAction<Post>>;
}

export function FeaturedImageSection({ siteId, formData, setFormData }: FeaturedImageSectionProps) {
  return (
    <MediaPicker
      value={formData.coverImage}
      onChange={(url) => setFormData(prev => ({ ...prev, coverImage: url }))}
      label="Cover Image"
      apiEndpoint={`/api/portal/cms/websites/${siteId}/media`}
    />
  );
}
