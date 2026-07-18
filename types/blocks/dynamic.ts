import type { BaseBlock } from './base';

// ============================================================================
// Dynamic / blog feed
// ============================================================================

export interface BlogPostsBlock extends BaseBlock {
  type: 'blog-posts';
  title?: string;
  description?: string;
  postType?: string;
  categorySlug?: string;
  limit?: number;
  showExcerpt?: boolean;
  columns?: 2 | 3;
}

