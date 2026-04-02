'use client';

import { BlogPostsBlock } from '@/types/blocks';
import { useEffect, useState } from 'react';
import { getAllBlogPosts, getBlogPostsByCategory } from '@/lib/actions/blog';
import { combineResponsiveClasses } from '@/lib/utils/responsive';
import { getElementCSS } from '@/lib/utils/elementStyles';
import Link from 'next/link';

interface BlogPostsBlockRenderProps {
  block: BlogPostsBlock;
}

export function BlogPostsBlockRender({ block }: BlogPostsBlockRenderProps) {
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchPosts() {
      try {
        setLoading(true);
        let fetchedPosts;

        if (block.postType === 'all') {
          fetchedPosts = await getAllBlogPosts();
        } else if (block.postType === 'category' && block.categorySlug) {
          fetchedPosts = await getBlogPostsByCategory(block.categorySlug);
        } else {
          fetchedPosts = await getAllBlogPosts();
        }

        // Apply limit
        const limitedPosts = fetchedPosts.slice(0, block.limit || 3);
        setPosts(limitedPosts);
      } catch (error) {
        console.error('Error fetching blog posts:', error);
        setPosts([]);
      } finally {
        setLoading(false);
      }
    }

    fetchPosts();
  }, [block.postType, block.categorySlug, block.limit]);

  const columnClasses = {
    2: 'md:grid-cols-2',
    3: 'md:grid-cols-2 lg:grid-cols-3',
  };

  // Generate responsive classes from block settings
  const responsiveClasses = block.responsive
    ? combineResponsiveClasses(
        block.responsive.paddingTop,
        block.responsive.paddingBottom,
        block.responsive.paddingLeft,
        block.responsive.paddingRight,
        block.responsive.marginTop,
        block.responsive.marginBottom,
        block.responsive.marginLeft,
        block.responsive.marginRight,
        block.responsive.visibility
      )
    : '';

  return (
    <section className={`py-16 my-8 ${responsiveClasses}`}>
      <div className="container mx-auto px-4">
        {(block.title || block.description) && (
          <div className="text-center mb-12">
            {block.title && (
              <h2 className="font-heading text-4xl md:text-5xl font-bold mb-4" style={getElementCSS(block.elementStyles, 'title')}>
                {block.title}
              </h2>
            )}
            {block.description && (
              <p className="text-xl text-muted-foreground max-w-2xl mx-auto" style={getElementCSS(block.elementStyles, 'description')}>
                {block.description}
              </p>
            )}
          </div>
        )}

        {loading ? (
          <div className={`grid grid-cols-1 ${columnClasses[block.columns || 3]} gap-8`}>
            {[...Array(block.limit || 3)].map((_, i) => (
              <div key={i} className="border border-border rounded-lg overflow-hidden bg-card animate-pulse">
                <div className="aspect-video bg-muted/30"></div>
                <div className="p-6">
                  <div className="h-4 bg-muted/50 rounded mb-2 w-3/4"></div>
                  <div className="h-3 bg-muted/30 rounded mb-1 w-full"></div>
                  <div className="h-3 bg-muted/30 rounded mb-1 w-5/6"></div>
                  <div className="h-3 bg-muted/30 rounded mt-3 w-1/3"></div>
                </div>
              </div>
            ))}
          </div>
        ) : posts.length > 0 ? (
          <div className={`grid grid-cols-1 ${columnClasses[block.columns || 3]} gap-8`}>
            {posts.map((post) => (
              <Link key={post.id} href={`/blog/${post.slug}`}>
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

                    <h3 className="text-2xl font-bold mb-3 group-hover:text-primary transition-colors" style={getElementCSS(block.elementStyles, 'postTitle')}>
                      {post.title}
                    </h3>

                    {block.showExcerpt && post.excerpt && (
                      <p className="text-muted-foreground mb-4 line-clamp-3" style={getElementCSS(block.elementStyles, 'postExcerpt')}>
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
                        {post.tags.slice(0, 3).map((tag: any) => (
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
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <p className="text-xl text-muted-foreground">
              No blog posts found.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
