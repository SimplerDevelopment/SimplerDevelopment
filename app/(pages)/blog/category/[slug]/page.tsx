import { getBlogPostsByCategory, getCategoryBySlug, getAllCategories } from '@/lib/actions/blog';
import { generateSEO } from '@/lib/utils/seo';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { FadeIn } from '@/components/animations/FadeIn';
import { SlideIn } from '@/components/animations/SlideIn';
import Link from 'next/link';

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
    <div className="container mx-auto px-4 py-20">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-16">
          <FadeIn>
            <div className="inline-block mb-4">
              <div
                className="px-4 py-2 rounded-full text-sm font-semibold flex items-center gap-2"
                style={{ backgroundColor: category.color ? `${category.color}20` : undefined, color: category.color || undefined }}
              >
                {category.color && <span className="w-2 h-2 rounded-full" style={{ backgroundColor: category.color }} />}
                {category.name}
              </div>
            </div>
            <h1 className="text-4xl md:text-6xl font-bold mb-4">{category.name}</h1>
            {category.description && (
              <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
                {category.description}
              </p>
            )}
          </FadeIn>
        </div>

        {/* Categories Filter */}
        <div className="mb-12">
          <FadeIn delay={0.1}>
            <div className="flex flex-wrap gap-3 justify-center">
              <Link href="/blog" className="group">
                <div className="px-4 py-2 rounded-full border border-primary/20 bg-background/40 backdrop-blur-sm hover:border-primary/40 transition-all duration-300">
                  <span className="text-sm font-medium">All Posts</span>
                </div>
              </Link>
              {allCategories.map((cat) => (
                <Link
                  key={cat.slug}
                  href={`/blog/category/${cat.slug}`}
                  className="group"
                >
                  <div
                    className={`px-4 py-2 rounded-full border backdrop-blur-sm transition-all duration-300 flex items-center gap-2 ${
                      cat.slug === slug
                        ? 'border-primary/40 bg-primary/10'
                        : 'border-primary/20 bg-background/40 hover:border-primary/40'
                    }`}
                  >
                    {cat.color && (
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: cat.color }}
                      />
                    )}
                    <span className="text-sm font-medium">{cat.name}</span>
                  </div>
                </Link>
              ))}
            </div>
          </FadeIn>
        </div>

        {/* Blog Posts Grid */}
        {posts && posts.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {posts.map((post, index) => (
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
                          <time dateTime={post.publishedAt.toISOString()}>
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
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <FadeIn>
              <p className="text-xl text-muted-foreground">
                No posts in this category yet. Check back soon!
              </p>
            </FadeIn>
          </div>
        )}
      </div>
    </div>
  );
}
