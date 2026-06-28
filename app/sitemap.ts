import { MetadataRoute } from 'next';
import { db } from '@/lib/db';
import { posts } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getAllSolutions } from '@/lib/data/solutions';
import { siteConfig } from '@/config/site';
import { ALL_SLUGS } from '@/app/docs/_lib/nav';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = siteConfig.url;

  const staticPages = [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: 'daily' as const,
      priority: 1,
    },
    {
      url: `${baseUrl}/solutions`,
      lastModified: new Date(),
      changeFrequency: 'weekly' as const,
      priority: 0.9,
    },
    {
      url: `${baseUrl}/about`,
      lastModified: new Date(),
      changeFrequency: 'monthly' as const,
      priority: 0.70,
    },
    {
      url: `${baseUrl}/pricing`,
      lastModified: new Date(),
      changeFrequency: 'monthly' as const,
      priority: 0.8,
    },
    {
      url: `${baseUrl}/blog`,
      lastModified: new Date(),
      changeFrequency: 'daily' as const,
      priority: 0.9,
    },
    {
      url: `${baseUrl}/contact`,
      lastModified: new Date(),
      changeFrequency: 'monthly' as const,
      priority: 0.65,
    },
  ];

  const solutionPages = getAllSolutions().map((solution) => ({
    url: `${baseUrl}/solutions/${solution.slug}`,
    lastModified: new Date(),
    changeFrequency: 'weekly' as const,
    priority: 0.85,
  }));

  let blogPages: MetadataRoute.Sitemap = [];
  try {
    const publishedPosts = await db
      .select({ slug: posts.slug, updatedAt: posts.updatedAt })
      .from(posts)
      .where(eq(posts.published, true));

    blogPages = publishedPosts
      .filter((post) => post.slug)
      .map((post) => ({
        url: `${baseUrl}/blog/${post.slug}`,
        lastModified: post.updatedAt,
        changeFrequency: 'weekly' as const,
        priority: 0.7,
      }));
  } catch (error) {
    console.error('Failed to fetch blog posts for sitemap:', error);
  }

  const docPages: MetadataRoute.Sitemap = ALL_SLUGS.map((slug) => ({
    url: slug === '' ? `${baseUrl}/docs` : `${baseUrl}/docs/${slug}`,
    lastModified: new Date(),
    changeFrequency: 'weekly' as const,
    priority: 0.75,
  }));

  return [...staticPages, ...solutionPages, ...blogPages, ...docPages];
}
