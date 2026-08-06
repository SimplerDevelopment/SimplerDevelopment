import { getAllBlogPosts, getAllCategories, type BlogPostWithRelations } from '@/lib/actions/blog';
import { generateSEO } from '@/lib/utils/seo';
import { FadeIn } from '@/components/animations/FadeIn';
import { SlideIn } from '@/components/animations/SlideIn';
import Link from 'next/link';
import { PageHeader, CreamBand, CTABanner } from '@/components/retro/sections';
import { RetroBadge, RetroButton } from '@/components/retro/primitives';

export const metadata = generateSEO({
  title: 'Blog',
  description: 'Insights, tutorials, and thoughts on web design, development, and automation from the SimplerDevelopment team.',
  path: '/blog',
});

const PAGE_SIZE = 9;

// Retro-skinned post card — shared shape with the "Dispatches" grid on the
// homepage (HomeClient.tsx), extended with the cover image / category / tags
// this index page already had before the reskin. Duplicated (not extracted to
// a shared component) in blog/category/[slug]/page.tsx per the reskin's
// file-scope constraint — this page only touches the three blog routes.
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

export default async function BlogPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const posts = await getAllBlogPosts();
  const categories = await getAllCategories();
  const totalPages = Math.max(1, Math.ceil(posts.length / PAGE_SIZE));
  const sp = await searchParams;
  const currentPage = Math.min(Math.max(1, parseInt(sp?.page ?? '1', 10) || 1), totalPages);
  const pagePosts = posts.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <>
      <PageHeader
        eyebrow="Flight Log · Blog"
        title="Dispatches From The Field."
        subtitle="Field notes on web design, development, and automation — logged by the crew building the platform."
      />

      <CreamBand>
        {categories.length > 0 && (
          <FadeIn>
            <div className="mb-10 flex flex-wrap justify-center gap-3">
              {categories.map((category) => (
                <Link
                  key={category.slug}
                  href={`/blog/category/${category.slug}`}
                  className="inline-block transition-opacity hover:opacity-80"
                >
                  <RetroBadge tone="teal">{category.name}</RetroBadge>
                </Link>
              ))}
            </div>
          </FadeIn>
        )}

        {posts && posts.length > 0 ? (
          <>
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
              {pagePosts.map((post, index) => (
                <SlideIn key={post.id} direction="up" delay={index * 0.08}>
                  <BlogPostCard post={post} />
                </SlideIn>
              ))}
            </div>

            {totalPages > 1 && (
              <nav className="mt-16 flex flex-wrap items-center justify-center gap-2" aria-label="Blog pagination">
                {currentPage > 1 && (
                  <RetroButton href={`/blog?page=${currentPage - 1}`} variant="secondary">
                    ← Previous
                  </RetroButton>
                )}
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                  <Link
                    key={p}
                    href={`/blog?page=${p}`}
                    aria-current={p === currentPage ? 'page' : undefined}
                    className={`inline-flex min-w-10 items-center justify-center rounded border px-3 py-2 text-sm font-bold transition-colors ${
                      p === currentPage
                        ? 'border-[var(--retro-orange)] bg-[var(--retro-orange)] text-[var(--retro-cream)]'
                        : 'border-[color-mix(in_srgb,var(--retro-mid)_35%,transparent)] text-[var(--retro-ink)] hover:border-[var(--retro-mid)]'
                    }`}
                  >
                    {p}
                  </Link>
                ))}
                {currentPage < totalPages && (
                  <RetroButton href={`/blog?page=${currentPage + 1}`} variant="secondary">
                    Next →
                  </RetroButton>
                )}
              </nav>
            )}
          </>
        ) : (
          <div className="py-12 text-center">
            <FadeIn>
              <p className="text-base leading-relaxed text-[color-mix(in_srgb,var(--retro-ink)_75%,transparent)]">
                Nothing in the log yet — check back soon for dispatches from the field.
              </p>
            </FadeIn>
          </div>
        )}
      </CreamBand>

      <CTABanner
        title="Got A Mission Of Your Own?"
        subtitle="Free forever if you host it yourself. We'll be here either way."
        primary={{ href: '/pricing', label: 'Start Free' }}
        secondary={{ href: '/contact', label: 'Talk To Us' }}
        art="radio-tower"
      />
    </>
  );
}
