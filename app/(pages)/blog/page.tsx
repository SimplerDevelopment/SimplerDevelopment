import { getAllBlogPosts, getAllCategories } from '@/lib/actions/blog';
import { generateSEO } from '@/lib/utils/seo';
import { FadeIn } from '@/components/animations/FadeIn';
import { SlideIn } from '@/components/animations/SlideIn';
import Link from 'next/link';

export const metadata = generateSEO({
  title: 'Blog',
  description: 'Insights, tutorials, and thoughts on web design, development, and automation from the SimplerDevelopment team.',
  path: '/blog',
});

const PAGE_SIZE = 9;

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
    <div className="container mx-auto px-4 py-20">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-16">
          <FadeIn>
            <h1 className="text-4xl md:text-6xl font-bold mb-4">Blog</h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Insights, tutorials, and thoughts on web design, development, and automation
            </p>
          </FadeIn>
        </div>

        {/* Categories */}
        <div className="mb-12">
          <FadeIn delay={0.1}>
            <div className="flex flex-wrap gap-3 justify-center">
              {categories.map((category) => (
                <Link
                  key={category.slug}
                  href={`/blog/category/${category.slug}`}
                  className="group"
                >
                  <div className="px-4 py-2 rounded-full border border-primary/20 bg-background/40 backdrop-blur-sm hover:border-primary/40 transition-all duration-300 flex items-center gap-2">
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: category.color || undefined }}
                    />
                    <span className="text-sm font-medium">{category.name}</span>
                  </div>
                </Link>
              ))}
            </div>
          </FadeIn>
        </div>

        {/* Blog Posts Grid */}
        {posts && posts.length > 0 ? (
          <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {pagePosts.map((post, index) => {
              return (
                <SlideIn key={post.id} direction="up" delay={index * 0.1}>
                  <Link href={`/blog/${post.slug}`}>
                    <article className="group h-full rounded-lg border bg-card overflow-hidden transition-all hover:shadow-lg">
                      {post.coverImage && (
                        <div className="aspect-video overflow-hidden">
                          <img
                            src={post.coverImage}
                            alt={post.title}
                            className="w-full h-full object-cover transition-transform group-hover:scale-105"
                          />
                        </div>
                      )}

                      <div className="p-6">
                        {post.category && (
                          <div
                            className="text-sm font-medium mb-2"
                            style={{ color: post.category.color || undefined }}
                          >
                            {post.category.name}
                          </div>
                        )}

                        <h2 className="text-2xl font-bold mb-3 group-hover:text-primary transition-colors">
                          {post.title}
                        </h2>

                        {post.excerpt && (
                          <p className="text-muted-foreground mb-4 line-clamp-3">
                            {post.excerpt}
                          </p>
                        )}

                        <div className="flex items-center justify-between text-sm text-muted-foreground">
                          {post.publishedAt && (
                            <time dateTime={new Date(post.publishedAt).toISOString()}>
                              {new Date(post.publishedAt).toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric',
                              })}
                            </time>
                          )}
                        </div>

                        {post.tags && post.tags.length > 0 && (
                          <div className="flex flex-wrap gap-2 mt-4">
                            {post.tags.slice(0, 3).map((tag) => (
                              <span
                                key={tag.id}
                                className="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary"
                              >
                                {tag.name}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </article>
                  </Link>
                </SlideIn>
              );
            })}
          </div>

          {totalPages > 1 && (
            <nav className="mt-16 flex items-center justify-center gap-2" aria-label="Blog pagination">
              {currentPage > 1 && (
                <Link
                  href={`/blog?page=${currentPage - 1}`}
                  className="px-4 py-2 rounded-lg border border-border text-sm font-medium hover:border-primary/50 transition-colors"
                >
                  ← Previous
                </Link>
              )}
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                <Link
                  key={p}
                  href={`/blog?page=${p}`}
                  aria-current={p === currentPage ? 'page' : undefined}
                  className={`min-w-10 px-3 py-2 rounded-lg border text-sm font-medium text-center transition-colors ${
                    p === currentPage
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  {p}
                </Link>
              ))}
              {currentPage < totalPages && (
                <Link
                  href={`/blog?page=${currentPage + 1}`}
                  className="px-4 py-2 rounded-lg border border-border text-sm font-medium hover:border-primary/50 transition-colors"
                >
                  Next →
                </Link>
              )}
            </nav>
          )}
          </>
        ) : (
          <div className="text-center py-12">
            <FadeIn>
              <p className="text-xl text-muted-foreground">
                No blog posts yet. Check back soon for insights and tutorials!
              </p>
            </FadeIn>
          </div>
        )}
      </div>
    </div>
  );
}
