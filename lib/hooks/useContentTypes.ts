'use client';

import { useEffect, useState } from 'react';

export interface ContentTypeOption {
  id: number;
  name: string;
  slug: string;
  icon: string | null;
  description: string | null;
  websiteId: number | null;
  active: boolean;
}

/**
 * Load every content type available to a site — site-specific rows + global
 * built-ins. Used by post-form Type pickers and other places that need to let
 * the author choose between pages, blog posts, and any custom post types
 * defined for the site.
 *
 * Returns an empty array while loading so callers can render gracefully
 * before the first response.
 */
export function useContentTypes(siteId: number | string | undefined): ContentTypeOption[] {
  const [types, setTypes] = useState<ContentTypeOption[]>([]);

  useEffect(() => {
    if (!siteId) return;
    let cancelled = false;
    fetch(`/api/portal/cms/websites/${siteId}/content-types`)
      .then((r) => r.json())
      .then((res) => {
        if (cancelled || !res?.success || !Array.isArray(res.data)) return;
        // De-dupe by slug, prefer site-specific (websiteId !== null) over the
        // global built-in: when an author has forked "page" (id=2, websiteId
        // null) into a site-scoped copy, we want to surface a single "Page"
        // option pointing at the site-scoped slug — both rows have the same
        // slug, so postType-by-slug routing picks the site-scoped one
        // automatically (see getPostTypeForPost).
        const bySlug = new Map<string, ContentTypeOption>();
        for (const t of res.data as ContentTypeOption[]) {
          const existing = bySlug.get(t.slug);
          if (!existing || (existing.websiteId === null && t.websiteId !== null)) {
            bySlug.set(t.slug, t);
          }
        }
        setTypes([...bySlug.values()].filter((t) => t.active).sort((a, b) => a.name.localeCompare(b.name)));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [siteId]);

  return types;
}
