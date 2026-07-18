// Site snapshot payload schema — a portable, FK-free representation of a
// client website that can be exported and imported across clients.
//
// IDs and FKs are stripped on export; cross-references use slugs/keys so the
// payload is portable. See export.ts / import.ts for the round-trip logic.

export type SnapshotPayload = {
  schemaVersion: 1;
  site: {
    name: string;
    settings: SnapshotSiteSettings;
    customCode?: SnapshotCustomCode | null;
  };
  posts: SnapshotPost[];
  navigation: SnapshotNavItem[];
  blockTemplates?: SnapshotBlockTemplate[];
  postTypes?: SnapshotPostType[];
};

/** Subset of `client_websites` fields that are actually portable. We
 *  deliberately omit hosting/deploy/repo metadata (vercel/github/log keys)
 *  because those are environment-specific and would be wrong if cloned. */
export type SnapshotSiteSettings = {
  description?: string | null;
  active?: boolean;
  customLayout?: boolean;
  publicAccess?: boolean;
};

export type SnapshotCustomCode = {
  customCss?: string | null;
  customJs?: string | null;
};

/** Posts. References to post types are by slug — the importer rehydrates
 *  the FK to whichever post-type row exists in the target site (creating
 *  one if none exists). Categories/tags/custom fields are out of scope for
 *  v1 of the snapshot — extend later if needed. */
export type SnapshotPost = {
  slug: string;
  type: string; // postType slug, e.g. "page" / "blog"
  title: string;
  status: 'published' | 'draft';
  content: unknown; // typically `{ blocks: Block[], version: '1.0' }` JSON-as-text or object
  meta?: SnapshotPostMeta;
};

export type SnapshotPostMeta = {
  excerpt?: string | null;
  coverImage?: string | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
  ogImage?: string | null;
  noIndex?: boolean;
  canonicalUrl?: string | null;
  customCss?: string | null;
  customJs?: string | null;
};

/** Navigation. The "key" identifies a logical menu — for now we only have
 *  one menu per site so we just emit `{ key: 'main', items: [...] }` with a
 *  hierarchical, slug-keyed item list. */
export type SnapshotNavItem = {
  key: string;
  items: SnapshotNavEntry[];
};

export type SnapshotNavEntry = {
  label: string;
  href: string;
  sortOrder?: number;
  openInNewTab?: boolean;
  isButton?: boolean;
  description?: string | null;
  icon?: string | null;
  featuredImage?: string | null;
  columnGroup?: number | null;
  children?: SnapshotNavEntry[];
};

/** Reusable block templates that lived inside the source site. */
export type SnapshotBlockTemplate = {
  slug: string;
  name: string;
  description?: string | null;
  category?: string;
  scope?: string;
  content: unknown; // the `blocks` JSON
  tags?: string[];
};

/** Custom post types defined on the source site. */
export type SnapshotPostType = {
  slug: string;
  name: string;
  description?: string | null;
  icon?: string | null;
  active?: boolean;
  fields: SnapshotPostTypeField[];
  template?: string | null;
  customCss?: string | null;
  customJs?: string | null;
};

export type SnapshotPostTypeField = {
  slug: string;
  name: string;
  fieldType: string;
  options?: unknown;
  required?: boolean;
  defaultValue?: string | null;
  helpText?: string | null;
  order?: number;
};
