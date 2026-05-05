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

// ============================================================================
// Palizzi Social Club — Custom Block Types
// (Client-specific composite blocks. Universal-block conventions don't apply
// here historically; preserved as-is for backward compat.)
// ============================================================================

export interface PalizziNavBlock extends BaseBlock {
  type: 'palizzi-nav';
  logoUrl: string;
  brandName: string;
  links: Array<{ label: string; href: string }>;
}

export interface PalizziHeroBlock extends BaseBlock {
  type: 'palizzi-hero';
  address: string;
  crestUrl: string;
  neonUrl: string;
  tagline: string;
  established: string;
  scrollTarget: string;
}

export interface PalizziWelcomeBlock extends BaseBlock {
  type: 'palizzi-welcome';
  overline: string;
  title: string;
  titleAccent: string;
  paragraphs: string[];
  bookImage: string;
  bookTitle: string;
  bookSubtitle: string;
  bookAuthors: string;
  bookLabel: string;
}

export interface PalizziHistoryBlock extends BaseBlock {
  type: 'palizzi-history';
  overline: string;
  title: string;
  titleAccent: string;
  backgroundImage: string;
  marqueeImage: string;
  paragraphs: string[];
}

export interface PalizziMenuBlock extends BaseBlock {
  type: 'palizzi-menu';
  overline: string;
  title: string;
  subtitle: string;
  foodSections: Array<{
    title: string;
    items: Array<{ name: string; desc: string }>;
  }>;
  cocktails: Array<{ name: string; desc: string }>;
}

export interface PalizziRulesBlock extends BaseBlock {
  type: 'palizzi-rules';
  overline: string;
  title: string;
  titleAccent: string;
  hoursTitle: string;
  hoursSubtitle: string;
  badges: string[];
  rules: string[];
  disclaimer: string;
}

export interface PalizziMembershipBlock extends BaseBlock {
  type: 'palizzi-membership';
  overline: string;
  title: string;
  titleAccent: string;
  paragraphs: string[];
  highlight: string;
  closingNote: string;
  signature: string;
  footnote: string;
}

export interface PalizziFooterBlock extends BaseBlock {
  type: 'palizzi-footer';
  marqueeImage: string;
  columns: Array<{
    label: string;
    content?: string;
    links?: Array<{ label: string; href: string }>;
  }>;
  bottomText: string;
}
