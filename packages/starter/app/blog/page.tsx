import { sd } from '@/lib/sd';
import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Blog' };

export default async function BlogPage() {
  const { data: posts } = await sd.posts.list({ postType: 'blog', limit: 20 });

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <h1 className="text-3xl font-bold mb-8">Blog</h1>

      {posts.length === 0 ? (
        <p className="text-gray-600">No posts yet.</p>
      ) : (
        <div className="grid gap-8">
          {posts.map(post => (
            <article key={post.id} className="border-b border-gray-200 pb-8 last:border-0">
              {post.coverImage && (
                <img
                  src={post.coverImage}
                  alt={post.title}
                  className="w-full h-48 object-cover rounded-lg mb-4"
                />
              )}
              <Link href={`/blog/${post.slug}`}>
                <h2 className="text-xl font-semibold hover:text-[var(--brand-primary)] transition-colors">
                  {post.title}
                </h2>
              </Link>
              {post.excerpt && <p className="text-gray-600 mt-2">{post.excerpt}</p>}
              {post.publishedAt && (
                <time className="text-sm text-gray-400 mt-2 block">
                  {new Date(post.publishedAt).toLocaleDateString()}
                </time>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
