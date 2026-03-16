import { fetchOneEntry, fetchEntries } from '@builder.io/sdk-react-nextjs';
import type { Solution, BlogPost } from '@/lib/types/content';
import { builderConfig } from './config';

const BUILDER_API_KEY = builderConfig.apiKey;

// Solutions
export async function getSolution(slug: string): Promise<Solution | null> {
  try {
    const solution = await fetchOneEntry({
      model: builderConfig.models.solution,
      apiKey: BUILDER_API_KEY,
      userAttributes: {
        urlPath: `/solutions/${slug}`,
      },
    });
    return solution as Solution | null;
  } catch (error) {
    console.error('Failed to fetch solution:', error);
    return null;
  }
}

export async function getAllSolutions(): Promise<Solution[]> {
  try {
    const result = await fetchEntries({
      model: builderConfig.models.solution,
      apiKey: BUILDER_API_KEY,
      options: {
        sort: {
          'data.order': 1,
        },
      },
    });
    return result as Solution[];
  } catch (error) {
    console.error('Failed to fetch solutions:', error);
    return [];
  }
}

export async function getFeaturedSolutions(): Promise<Solution[]> {
  try {
    const result = await fetchEntries({
      model: builderConfig.models.solution,
      apiKey: BUILDER_API_KEY,
      options: {
        query: {
          'data.featured': true,
        },
        sort: {
          'data.order': 1,
        },
      },
    });
    return result as Solution[];
  } catch (error) {
    console.error('Failed to fetch featured solutions:', error);
    return [];
  }
}

// Blog posts
export async function getBlogPost(slug: string): Promise<BlogPost | null> {
  try {
    const post = await fetchOneEntry({
      model: builderConfig.models.blogPost,
      apiKey: BUILDER_API_KEY,
      userAttributes: {
        urlPath: `/blog/${slug}`,
      },
    });
    return post as BlogPost | null;
  } catch (error) {
    console.error('Failed to fetch blog post:', error);
    return null;
  }
}

export async function getAllBlogPosts(): Promise<BlogPost[]> {
  try {
    const result = await fetchEntries({
      model: builderConfig.models.blogPost,
      apiKey: BUILDER_API_KEY,
      options: {
        sort: {
          'data.publishedAt': -1,
        },
      },
    });
    return result as BlogPost[];
  } catch (error) {
    console.error('Failed to fetch blog posts:', error);
    return [];
  }
}

export async function getFeaturedBlogPosts(limit: number = 3): Promise<BlogPost[]> {
  try {
    const result = await fetchEntries({
      model: builderConfig.models.blogPost,
      apiKey: BUILDER_API_KEY,
      options: {
        query: {
          'data.featured': true,
        },
        sort: {
          'data.publishedAt': -1,
        },
        limit,
      },
    });
    return result as BlogPost[];
  } catch (error) {
    console.error('Failed to fetch featured blog posts:', error);
    return [];
  }
}
