import type { Metadata } from 'next';
import { siteConfig } from '@/config/site';

interface SEOProps {
  title?: string;
  description?: string;
  image?: string;
  path?: string;
  publishedTime?: string;
  modifiedTime?: string;
  authors?: string[];
  tags?: string[];
  type?: 'website' | 'article';
}

/**
 * Generate SEO metadata for pages
 */
export function generateSEO({
  title,
  description,
  image,
  path = '',
  publishedTime,
  modifiedTime,
  authors,
  tags,
  type = 'website',
}: SEOProps): Metadata {
  const url = `${siteConfig.url}${path}`;
  const ogImage = image || siteConfig.ogImage;
  const metaTitle = title ? `${title} | ${siteConfig.name}` : siteConfig.name;
  const metaDescription = description || siteConfig.description;

  const metadata: Metadata = {
    // `absolute` opts out of the root layout's `%s | SimplerDevelopment`
    // template; metaTitle already carries the brand suffix, so without this
    // the template would apply a second time (e.g. "About Us | SimplerDevelopment | SimplerDevelopment").
    title: { absolute: metaTitle },
    description: metaDescription,
    keywords: siteConfig.keywords,
    openGraph: {
      type,
      url,
      title: metaTitle,
      description: metaDescription,
      siteName: siteConfig.name,
      images: [
        {
          url: ogImage,
          width: 1200,
          height: 630,
          alt: title || siteConfig.name,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: metaTitle,
      description: metaDescription,
      images: [ogImage],
      creator: '@simplerdevelopment',
    },
    alternates: {
      canonical: url,
    },
  };

  // Add article-specific metadata
  if (type === 'article') {
    metadata.openGraph = {
      ...metadata.openGraph,
      type: 'article',
      publishedTime,
      modifiedTime,
      authors: authors?.map(author => author) || [],
      tags: tags || [],
    };
  }

  return metadata;
}

/**
 * Generate JSON-LD structured data for articles
 */
export function generateArticleSchema({
  title,
  description,
  image,
  publishedTime,
  modifiedTime,
  author,
  url,
}: {
  title: string;
  description: string;
  image: string;
  publishedTime: string;
  modifiedTime?: string;
  author: string;
  url: string;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: title,
    description,
    image,
    datePublished: publishedTime,
    dateModified: modifiedTime || publishedTime,
    author: {
      '@type': 'Person',
      name: author,
    },
    publisher: {
      '@type': 'Organization',
      name: siteConfig.name,
      logo: {
        '@type': 'ImageObject',
        url: `${siteConfig.url}/logo.png`,
      },
    },
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': url,
    },
  };
}

/**
 * Generate JSON-LD structured data for organization
 */
export function generateOrganizationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: siteConfig.name,
    description: siteConfig.description,
    url: siteConfig.url,
    logo: `${siteConfig.url}/logo.png`,
    sameAs: [
      siteConfig.links.twitter,
      siteConfig.links.github,
      siteConfig.links.linkedin,
    ],
  };
}
