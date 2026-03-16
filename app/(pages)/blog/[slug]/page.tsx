import { getBlogPostBySlug, getAllBlogPosts } from '@/lib/actions/blog';
import { generateSEO } from '@/lib/utils/seo';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { StructuredData } from '@/components/seo/StructuredData';
import { generateArticleSchema } from '@/lib/utils/structured-data';
import { BlockRenderer } from '@/components/blocks/render/BlockRenderer';
import Link from 'next/link';

interface PageProps {
  params: Promise<{ slug: string }>;
}

// Allow dynamic params for posts not generated at build time
export const dynamicParams = true;

export async function generateStaticParams() {
  try {
    const posts = await getAllBlogPosts();

    // If no posts available (e.g., during build without DB), return empty array
    if (!posts || posts.length === 0) {
      return [];
    }

    return posts.map((post) => ({
      slug: post.slug,
    }));
  } catch (error) {
    console.error('Error generating static params for blog posts:', error);
    return [];
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = await getBlogPostBySlug(slug);

  if (!post) {
    return {
      title: 'Post Not Found',
    };
  }

  return generateSEO({
    title: post.title,
    description: post.excerpt || undefined,
    path: `/blog/${slug}`,
    image: post.coverImage || undefined,
  });
}

export default async function BlogPostPage({ params }: PageProps) {
  const { slug } = await params;
  const post = await getBlogPostBySlug(slug);

  if (!post) {
    notFound();
  }

  return (
    <>
      <StructuredData
        data={generateArticleSchema(
          post.title,
          post.excerpt || '',
          post.publishedAt?.toISOString() || new Date().toISOString(),
          post.coverImage || undefined
        )}
      />

      <article className="container mx-auto px-4 py-12">
        <header className="max-w-4xl mx-auto mb-12">
          {post.category && (
            <Link href={`/blog/category/${post.category.slug}`}>
              <div
                className="inline-block font-medium mb-4 hover:underline"
                style={{ color: post.category.color || undefined }}
              >
                {post.category.name}
              </div>
            </Link>
          )}

          <h1 className="text-4xl md:text-6xl font-bold mb-6">{post.title}</h1>

          {post.excerpt && (
            <p className="text-xl md:text-2xl text-muted-foreground mb-8">
              {post.excerpt}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-4 text-muted-foreground">
            {post.publishedAt && (
              <time dateTime={post.publishedAt.toISOString()}>
                {new Date(post.publishedAt).toLocaleDateString('en-US', {
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </time>
            )}
          </div>

          {post.tags && post.tags.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-6">
              {post.tags.map((tag) => (
                <span
                  key={tag.id}
                  className="text-sm px-3 py-1 rounded-full bg-primary/10 text-primary"
                >
                  {tag.name}
                </span>
              ))}
            </div>
          )}
        </header>

        {post.coverImage && (
          <div className="max-w-5xl mx-auto mb-12">
            <img
              src={post.coverImage}
              alt={post.title}
              className="w-full h-auto rounded-lg"
            />
          </div>
        )}

        <div className="max-w-4xl mx-auto mb-12">
          <BlockRenderer content={post.content} />
        </div>

        <div className="max-w-4xl mx-auto mt-12 pt-8 border-t">
          <div className="flex flex-col sm:flex-row gap-4 justify-between items-center">
            <Link
              href="/blog"
              className="inline-flex items-center text-primary hover:underline"
            >
              <svg
                className="w-4 h-4 mr-2"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path d="M15 19l-7-7 7-7" />
              </svg>
              Back to Blog
            </Link>

            <Link
              href="/contact"
              className="inline-flex items-center justify-center rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Work With Us →
            </Link>
          </div>
        </div>
      </article>
    </>
  );
}
