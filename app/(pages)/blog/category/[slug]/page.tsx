import { getBlogPostsByCategory, getCategoryBySlug, getAllCategories, type BlogPostWithRelations } from '@/lib/actions/blog';
import { generateSEO } from '@/lib/utils/seo';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { FadeIn } from '@/components/animations/FadeIn';
import { SlideIn } from '@/components/animations/SlideIn';
import Link from 'next/link';
import { PageHeader, CreamBand, CTABanner } from '@/components/retro/sections';
import { RetroBadge } from '@/components/retro/primitives';

interface PageProps {
  params: Promise<{ slug: string }>;
}

// Allow dynamic params for categories not generated at build time
export const dynamicParams = true;

export async function generateStaticParams() {
  try {
    const categories = await getAllCategories();

    // If no categories available (e.g., during build without DB), return empty array
    if (!categories || categories.length === 0) {
      return [];
    }

    return categories.map((category) => ({
      slug: category.slug,
    }));
  } catch (error) {
    console.error('Error generating static params for blog categories:', error);
    return [];
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const category = await getCategoryBySlug(slug);

  if (!category) {
    return {
      title: 'Category Not Found',
    };
  }

  return generateSEO({
    title: `${category.name} - Blog`,
    description: category.description || undefined,
    path: `/blog/category/${slug}`,
  });
}

// Retro-skinned post card — same shape as blog/page.tsx's BlogPostCard.
// Duplicated rather than shared: this reskin is scoped to only the three
// blog route files, so no new shared component file was introduced.
function BlogPostCard({ post }: { post: BlogPostWithRelations }) {
  return (
    <Link
      href={`/blog/${post.slug}`}
      className="group flex h-full flex-col overflow-hidden rounded-md border border-[color-mix(in_srgb,var(--retro-mid)_35%,transparent)] bg-[var(--retro-cream)] transition-colors hover:border-[var(--retro-mid)]"
    >
      {post.coverImage && (
        <div className="aspect-video overflow-hidden border-b border-[color-mix(in_srgb,var(--retro-mid)_35%,transparent)]">
          <img
            src={post.coverImage}
            alt={post.title}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        </div>
      )}

      <div className="flex flex-1 flex-col gap-3 p-6">
        {post.category && <RetroBadge tone="teal">{post.category.name}</RetroBadge>}

        <h2 className="font-display text-lg font-bold leading-snug text-[var(--retro-ink)]">{post.title}</h2>

        {post.excerpt && (
          <p className="line-clamp-3 text-sm leading-relaxed text-[color-mix(in_srgb,var(--retro-ink)_75%,transparent)]">
            {post.excerpt}
          </p>
        )}

        <div className="mt-auto flex items-center justify-between gap-3 pt-2">
          {post.publishedAt && (
            <time
              dateTime={new Date(post.publishedAt).toISOString()}
              className="text-xs text-[color-mix(in_srgb,var(--retro-ink)_60%,transparent)]"
            >
              {new Date(post.publishedAt).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </time>
          )}
          <span className="text-sm font-bold text-[var(--retro-orange)]">Read it →</span>
        </div>

        {post.tags && post.tags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {post.tags.slice(0, 3).map((tag) => (
              <RetroBadge key={tag.id} tone="gold">
                {tag.name}
              </RetroBadge>
            ))}
          </div>
        )}
      </div>
    </Link>
  );
}

export default async function CategoryPage({ params }: PageProps) {
  const { slug } = await params;
  const category = await getCategoryBySlug(slug);

  if (!category) {
    notFound();
  }

  const [posts, allCategories] = await Promise.all([
    getBlogPostsByCategory(slug),
    getAllCategories(),
  ]);

  return (
    <>
      <PageHeader
        eyebrow="Flight Log · Category"
        title={category.name}
        subtitle={category.description || undefined}
      />

      <CreamBand>
        <FadeIn>
          <div className="mb-10 flex flex-wrap justify-center gap-3">
            <Link href="/blog" className="inline-block transition-opacity hover:opacity-80">
              <RetroBadge tone="teal">All Posts</RetroBadge>
            </Link>
            {allCategories.map((cat) => (
              <Link
                key={cat.slug}
                href={`/blog/category/${cat.slug}`}
                className="inline-block transition-opacity hover:opacity-80"
              >
                <RetroBadge tone={cat.slug === slug ? 'orange' : 'teal'}>{cat.name}</RetroBadge>
              </Link>
            ))}
          </div>
        </FadeIn>

        {posts && posts.length > 0 ? (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            {posts.map((post, index) => (
              <SlideIn key={post.id} direction="up" delay={index * 0.08}>
                <BlogPostCard post={post} />
              </SlideIn>
            ))}
          </div>
        ) : (
          <div className="py-12 text-center">
            <FadeIn>
              <p className="text-base leading-relaxed text-[color-mix(in_srgb,var(--retro-ink)_75%,transparent)]">
                Nothing filed under {category.name} yet — check back soon.
              </p>
            </FadeIn>
          </div>
        )}
      </CreamBand>

      <CTABanner
        title="Explore The Rest Of The Log."
        subtitle="Free forever if you host it yourself. We'll be here either way."
        primary={{ href: '/blog', label: 'All Dispatches' }}
        secondary={{ href: '/contact', label: 'Talk To Us' }}
        art="radio-tower"
      />
    </>
  );
}
