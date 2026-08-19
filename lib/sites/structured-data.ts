/**
 * JSON-LD builders for tenant public sites. Everything is assembled from
 * real site/post fields — no invented content. Emitted as
 * <script type="application/ld+json"> by the sites layout (Organization +
 * WebSite, once per page) and the blog-post render path (BlogPosting).
 */

export interface SiteSchemaInput {
  name: string;
  baseUrl: string;
  description?: string | null;
  logoUrl?: string | null;
}

export function organizationSchema(site: SiteSchemaInput): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: site.name,
    url: site.baseUrl,
    ...(site.description ? { description: site.description } : {}),
    ...(site.logoUrl
      ? { logo: site.logoUrl.startsWith('http') ? site.logoUrl : `${site.baseUrl}${site.logoUrl}` }
      : {}),
  };
}

export function webSiteSchema(site: SiteSchemaInput): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: site.name,
    url: site.baseUrl,
    ...(site.description ? { description: site.description } : {}),
  };
}

export interface BlogPostSchemaInput {
  title: string;
  url: string;
  siteName: string;
  baseUrl: string;
  description?: string | null;
  imageUrl?: string | null;
  publishedAt?: Date | string | null;
  updatedAt?: Date | string | null;
}

export function blogPostingSchema(post: BlogPostSchemaInput): Record<string, unknown> {
  const iso = (d: Date | string | null | undefined) =>
    d ? (d instanceof Date ? d.toISOString() : new Date(d).toISOString()) : undefined;
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    url: post.url,
    mainEntityOfPage: post.url,
    ...(post.description ? { description: post.description } : {}),
    ...(post.imageUrl
      ? { image: post.imageUrl.startsWith('http') ? post.imageUrl : `${post.baseUrl}${post.imageUrl}` }
      : {}),
    ...(iso(post.publishedAt) ? { datePublished: iso(post.publishedAt) } : {}),
    ...(iso(post.updatedAt) ? { dateModified: iso(post.updatedAt) } : {}),
    publisher: {
      '@type': 'Organization',
      name: post.siteName,
      url: post.baseUrl,
    },
    author: {
      '@type': 'Organization',
      name: post.siteName,
      url: post.baseUrl,
    },
  };
}

/** Serialize for a <script type="application/ld+json"> tag, XSS-safe. */
export function jsonLd(schema: Record<string, unknown>): string {
  return JSON.stringify(schema).replace(/</g, '\\u003c');
}
