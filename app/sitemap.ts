import { MetadataRoute } from 'next';
import { getAllSolutions, getAllBlogPosts } from '@/lib/builder/api';
import { siteConfig } from '@/config/site';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = siteConfig.url;

  // Static pages
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
      priority: 0.7,
    },
  ];

  // Dynamic solution pages
  let solutionPages: MetadataRoute.Sitemap = [];
  try {
    const solutions = await getAllSolutions();
    solutionPages = solutions
      .filter((solution) => solution.data?.slug)
      .map((solution) => ({
        url: `${baseUrl}/solutions/${solution.data!.slug}`,
        lastModified: new Date(solution.lastUpdatedDate || solution.createdDate || Date.now()),
        changeFrequency: 'weekly' as const,
        priority: 0.8,
      }));
  } catch (error) {
    console.error('Failed to fetch solutions for sitemap:', error);
  }

  // Dynamic blog pages
  let blogPages: MetadataRoute.Sitemap = [];
  try {
    const posts = await getAllBlogPosts();
    blogPages = posts
      .filter((post) => post.data?.slug)
      .map((post) => ({
        url: `${baseUrl}/blog/${post.data!.slug}`,
        lastModified: new Date(post.data!.publishedAt || post.lastUpdatedDate || post.createdDate || Date.now()),
        changeFrequency: 'monthly' as const,
        priority: 0.7,
      }));
  } catch (error) {
    console.error('Failed to fetch blog posts for sitemap:', error);
  }

  return [...staticPages, ...solutionPages, ...blogPages];
}
