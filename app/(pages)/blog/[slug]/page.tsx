import { getBlogPostBySlug, getAllBlogPosts } from '@/lib/actions/blog';
import { generateSEO } from '@/lib/utils/seo';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { StructuredData } from '@/components/seo/StructuredData';
import { generateArticleSchema } from '@/lib/utils/structured-data';
import { BlockRenderer } from '@/components/blocks/render/BlockRenderer';
import Link from 'next/link';
import { InkPanel, CreamBand, CTABanner } from '@/components/retro/sections';
import { Star, RetroBadge } from '@/components/retro/primitives';

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

      <article>
        {/* PageHeader-style article header, built from the same primitives
            PageHeader itself composes (InkPanel + eyebrow + Star), rather than
            the PageHeader component directly — PageHeader has no slots for the
            date/tags an article carries. Same max-w-3xl as the body below it
            so the title sits at the article's own reading measure. */}
        <InkPanel className="relative isolate overflow-hidden">
          <div className="mx-auto max-w-3xl px-6 py-14 text-center sm:py-20">
            {post.category && (
              <Link
                href={`/blog/category/${post.category.slug}`}
                className="eyebrow eyebrow--on-ink inline-flex items-center gap-3 hover:text-[var(--retro-cream)]"
              >
                <Star className="h-3 w-3" />
                {post.category.name}
                <Star className="h-3 w-3" />
              </Link>
            )}

            <h1 className="font-display mt-4 text-3xl font-extrabold leading-tight sm:text-5xl">{post.title}</h1>

            {post.excerpt && (
              <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-[color-mix(in_srgb,var(--retro-cream)_80%,transparent)]">
                {post.excerpt}
              </p>
            )}

            {post.publishedAt && (
              <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-[color-mix(in_srgb,var(--retro-cream)_65%,transparent)]">
                <time dateTime={post.publishedAt.toISOString()}>
                  {new Date(post.publishedAt).toLocaleDateString('en-US', {
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </time>
              </div>
            )}

            {post.tags && post.tags.length > 0 && (
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                {post.tags.map((tag) => (
                  <RetroBadge key={tag.id} tone="gold">
                    {tag.name}
                  </RetroBadge>
                ))}
              </div>
            )}
          </div>
        </InkPanel>

        <CreamBand>
          {post.coverImage && (
            <div className="mx-auto mb-12 max-w-5xl overflow-hidden rounded-md border border-[color-mix(in_srgb,var(--retro-mid)_35%,transparent)]">
              <img src={post.coverImage} alt={post.title} className="h-auto w-full" />
            </div>
          )}

          {/* Untouched: author-written post content, own prose styling via
              BlockRenderer. Same max-w-3xl measure as before the reskin. */}
          <div className="mx-auto mb-12 max-w-3xl">
            <BlockRenderer content={post.content} />
          </div>

          {/* Chrome-only footer nav. No "related posts" grid here: that would
              need a new query (e.g. other posts in this category) beyond what
              this page already fetches, which the reskin brief says not to
              add. Category/back links reuse data already on `post`. */}
          <div
            className="mx-auto mt-12 max-w-3xl pt-8"
            style={{ borderTop: 'var(--retro-rule)' }}
          >
            <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
              <Link
                href="/blog"
                className="inline-flex items-center gap-2 text-sm font-bold text-[var(--retro-orange)] hover:text-[var(--retro-rust)]"
              >
                <svg
                  className="h-4 w-4"
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

              {post.category && (
                <Link
                  href={`/blog/category/${post.category.slug}`}
                  className="inline-flex items-center gap-2 text-sm font-bold text-[var(--retro-ink)] hover:text-[var(--retro-orange)]"
                >
                  More in {post.category.name} →
                </Link>
              )}
            </div>
          </div>
        </CreamBand>
      </article>

      <CTABanner
        title="Enjoyed The Read?"
        subtitle="Free forever if you host it yourself. We'll be here either way."
        primary={{ href: '/contact', label: 'Talk To Us' }}
        secondary={{ href: '/blog', label: 'More Dispatches' }}
        art="radio-tower"
      />
    </>
  );
}
