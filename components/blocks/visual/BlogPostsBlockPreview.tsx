'use client';

import { BlogPostsBlock } from '@/types/blocks';
import { useEffect, useState } from 'react';
import { getAllBlogPosts, getBlogPostsByCategory, type BlogPostWithRelations } from '@/lib/actions/blog';
import { getElementCSS } from '@/lib/utils/elementStyles';

interface BlogPostsBlockPreviewProps {
  block: BlogPostsBlock;
  isSelected: boolean;
  onChange: (updates: Partial<BlogPostsBlock>) => void;
}

export function BlogPostsBlockPreview({ block, isSelected, onChange }: BlogPostsBlockPreviewProps) {
  const [posts, setPosts] = useState<BlogPostWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const columnClasses = {
    2: 'grid-cols-1 md:grid-cols-2',
    3: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
  };

  useEffect(() => {
    async function fetchPosts() {
      try {
        setLoading(true);
        setError(null);

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
      } catch (err) {
        console.error('Error fetching blog posts for preview:', err);
        setError('Failed to load posts');
      } finally {
        setLoading(false);
      }
    }

    fetchPosts();
  }, [block.postType, block.categorySlug, block.limit]);

  return (
    <div className="py-16 my-8 px-6">
      <div className="text-center mb-12">
        {(block.title || isSelected) && (
          <input
            type="text"
            value={block.title || ''}
            onChange={(e) => onChange({ title: e.target.value })}
            onClick={(e) => e.stopPropagation()}
            className="font-heading text-4xl md:text-5xl font-bold mb-4 w-full bg-transparent border-none focus:outline-none focus:border-b-2 border-primary text-center text-foreground"
            placeholder="Blog Posts Title"
            style={getElementCSS(block.elementStyles, 'title')}
          />
        )}
        {(block.description || isSelected) && (
          <input
            type="text"
            value={block.description || ''}
            onChange={(e) => onChange({ description: e.target.value })}
            onClick={(e) => e.stopPropagation()}
            className="text-xl max-w-2xl mx-auto w-full bg-transparent border-none focus:outline-none focus:border-b border-primary/50 text-center text-muted-foreground"
            placeholder="Description (optional)"
            style={getElementCSS(block.elementStyles, 'description')}
          />
        )}
      </div>

      {/* Loading State */}
      {loading && (
        <div className={`grid ${columnClasses[block.columns || 3]} gap-8`}>
          {[...Array(Math.min(block.limit || 3, 3))].map((_, i) => (
            <div key={i} className="border border-border rounded-lg overflow-hidden bg-card animate-pulse">
              <div className="aspect-video bg-muted/30"></div>
              <div className="p-6">
                <div className="h-4 bg-muted/50 rounded mb-2 w-3/4"></div>
                {block.showExcerpt && (
                  <>
                    <div className="h-3 bg-muted/30 rounded mb-1 w-full"></div>
                    <div className="h-3 bg-muted/30 rounded mb-1 w-5/6"></div>
                  </>
                )}
                <div className="h-3 bg-muted/30 rounded mt-3 w-1/3"></div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Error State */}
      {error && !loading && (
        <div className="text-center py-12">
          <div className="text-4xl mb-4">⚠️</div>
          <p className="text-muted-foreground">{error}</p>
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && posts.length === 0 && (
        <div className="text-center py-12">
          <div className="text-6xl mb-4">📝</div>
          <p className="text-xl text-muted-foreground mb-2">No blog posts found</p>
          <p className="text-sm text-muted-foreground">
            {block.postType === 'category' && block.categorySlug
              ? `No posts in category "${block.categorySlug}"`
              : 'Create your first blog post to see it here'}
          </p>
        </div>
      )}

      {/* Posts Grid with Real Data */}
      {!loading && !error && posts.length > 0 && (
        <div className={`grid ${columnClasses[block.columns || 3]} gap-8`}>
          {posts.map((post) => (
            <div
              key={post.id}
              className="group h-full rounded-lg border bg-card overflow-hidden transition-all hover:shadow-lg"
            >
              {post.coverImage ? (
                <div className="aspect-video overflow-hidden">
                  <img
                    src={post.coverImage}
                    alt={post.title}
                    className="w-full h-full object-cover transition-transform group-hover:scale-105"
                  />
                </div>
              ) : (
                <div className="aspect-video bg-muted/30 flex items-center justify-center">
                  <span className="text-4xl">📰</span>
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

                <h3 className="text-2xl font-bold mb-3 group-hover:text-primary transition-colors line-clamp-2">
                  {post.title}
                </h3>

                {block.showExcerpt && post.excerpt && (
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
            </div>
          ))}
        </div>
      )}

      <p className="text-center text-xs text-muted-foreground mt-6 italic">
        Preview: Showing {posts.length} of {block.limit || 3} configured posts
      </p>
    </div>
  );
}
