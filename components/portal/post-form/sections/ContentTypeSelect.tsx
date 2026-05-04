// Type picker — sources options from useContentTypes(siteId) for the post form.
'use client';

import type { ContentTypeOption } from '@/lib/hooks/useContentTypes';

/**
 * Type picker — sources options from useContentTypes(siteId) so the dropdown
 * always reflects the site's actual content types (built-in + custom),
 * including any built-ins the author has forked into a site-scoped copy.
 *
 * Renders the current value as a fallback option even if it isn't in the
 * fetched list yet (network in flight, or post stored a slug for a type
 * that's since been deleted) so the select never shows an empty value.
 */
export function ContentTypeSelect({
  value,
  contentTypes,
  onChange,
  className,
}: {
  value: string;
  contentTypes: ContentTypeOption[];
  onChange: (slug: string) => void;
  className?: string;
}) {
  const known = contentTypes.some((t) => t.slug === value);
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={className}
    >
      {!known && value ? (
        <option value={value}>{value}</option>
      ) : null}
      {contentTypes.map((t) => (
        <option key={t.id} value={t.slug}>
          {t.name}
        </option>
      ))}
      {contentTypes.length === 0 && known === false ? (
        <option value="page">Page</option>
      ) : null}
    </select>
  );
}
