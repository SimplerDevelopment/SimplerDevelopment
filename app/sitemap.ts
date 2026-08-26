import { MetadataRoute } from 'next';
import { db } from '@/lib/db';
import { posts } from '@/lib/db/schema';
import { and, eq, isNull } from 'drizzle-orm';
import { getAllSolutions } from '@/lib/data/solutions';
import { getAllMigrations } from '@/lib/data/migrations';
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
      url: `${baseUrl}/migrate`,
      lastModified: new Date(),
      changeFrequency: 'weekly' as const,
      priority: 0.9,
    },
    {
      url: `${baseUrl}/ai-consulting`,
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
    {
      url: `${baseUrl}/faq`,
      lastModified: new Date(),
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    },
    {
      url: `${baseUrl}/compare`,
      lastModified: new Date(),
      changeFrequency: 'monthly' as const,
      priority: 0.75,
    },
    {
      url: `${baseUrl}/changelog`,
      lastModified: new Date(),
      changeFrequency: 'weekly' as const,
      priority: 0.6,
    },
  ];

  // One URL per templated migration page. Driven from the same data module the
  // pages are, so adding a competitor never means remembering to edit this file.
  const migrationPages = getAllMigrations().map((m) => ({
    url: `${baseUrl}/migrate/${m.slug}`,
    lastModified: new Date(),
    changeFrequency: 'monthly' as const,
    priority: 0.8,
  }));

  const solutionPages = getAllSolutions().map((solution) => ({
    url: `${baseUrl}/solutions/${solution.slug}`,
    lastModified: new Date(),
    changeFrequency: 'weekly' as const,
    priority: 0.85,
  }));

  let blogPages: MetadataRoute.Sitemap = [];
  try {
    // Must mirror getBlogPostBySlug (lib/actions/blog.ts) exactly, because that
    // is what decides whether /blog/<slug> renders or 404s. It requires all
    // four conditions; this query used to apply only `published`, so the
    // sitemap advertised URLs the blog route would never serve:
    //
    //   postType='blog'   — other post types have no /blog/<slug> route
    //   websiteId IS NULL — a NULL websiteId means "this marketing site". Rows
    //                       with one belong to a CLIENT's website, so including
    //                       them published other tenants' slugs and edit times
    //                       in simplerdevelopment.com's public sitemap.
    //
    // SEO-018 measured the damage: ~154 dead URLs, 77% of the sitemap.
    const publishedPosts = await db
      .select({ slug: posts.slug, updatedAt: posts.updatedAt })
      .from(posts)
      .where(and(
        eq(posts.published, true),
        eq(posts.postType, 'blog'),
        isNull(posts.websiteId),
      ));

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

  return [...staticPages, ...migrationPages, ...solutionPages, ...blogPages, ...docPages];
}
