import type { BrandDefaultsContext } from '@/lib/branding/block-defaults';

/**
 * Shape of a CMS post as the form sees it. Server-side schema lives in
 * `lib/db/schema.ts` (table `posts`); this type intentionally enumerates
 * only the columns the form mutates plus the join arrays (`categoryIds`,
 * `tagIds`) the API expects on save.
 */
export interface Post {
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
  seoTitle?: string;
  seoDescription?: string;
  ogImage?: string;
  noIndex?: boolean;
  canonicalUrl?: string;
  customCss?: string;
  customJs?: string;
}

export interface TaxonomyItem {
  id: number;
  name: string;
  slug: string;
}

export interface PortalPostFormProps {
  siteId: number;
  post?: Post;
  mode: 'create' | 'edit';
  siteUrl?: string | null;
  publicUrl?: string | null;
  previewToken?: string;
  siteDomain?: string;
  /**
   * Optional brand context — pre-fills newly-created blocks with the client's
   * messaging (tagline, value prop, etc.) and tags them with brand sentinels.
   * Loaded server-side via getBrandDefaults().
   */
  brandDefaults?: BrandDefaultsContext;
  /**
   * Post-type template JSON for the post's content type (resolved server-side
   * via getPostTypeForPost). When present, the visual editor iframe renders
   * the type's wrapper chrome around the editable post-blocks slot — matching
   * production layout. Null when the type has no template.
   */
  typeTemplate?: string | null;
}

export interface CustomFieldDef {
  id: number;
  parentId: number | null;
  name: string;
  slug: string;
  fieldType: string;
  options: string[] | null;
  required: boolean;
  defaultValue: string | null;
  helpText: string | null;
}

export interface CustomFieldValue {
  customFieldId: number;
  value: string | null;
}

export interface ManagedField {
  id: number;
  postTypeId: number;
  parentId: number | null;
  name: string;
  slug: string;
  fieldType: string;
  options: string[] | null;
  required: boolean;
  defaultValue: string | null;
  helpText: string | null;
  order: number;
}

export type SettingsTab = 'general' | 'seo' | 'taxonomy' | 'custom-fields';

export interface SaveStatus {
  status: 'idle' | 'saving' | 'saved' | 'error';
}
