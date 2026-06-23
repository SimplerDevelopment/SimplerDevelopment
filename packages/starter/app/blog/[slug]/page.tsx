import { sd } from '@/lib/sd';
import BlockRenderer from '@/components/BlockRenderer';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  try {
    const post = await sd.posts.get(slug);
    return { title: post.seoTitle || post.title, description: post.seoDescription || post.excerpt || undefined };
  } catch {
    return { title: 'Not Found' };
  }
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  let post;
  try {
    post = await sd.posts.get(slug);
  } catch {
    notFound();
  }

  return (
    <article className="max-w-4xl mx-auto px-4 py-12">
      <header className="mb-8">
        <h1 className="text-4xl font-bold mb-2">{post.title}</h1>
        {post.publishedAt && (
          <time className="text-sm text-gray-500">{new Date(post.publishedAt).toLocaleDateString()}</time>
        )}
        {post.categories.length > 0 && (
          <div className="flex gap-2 mt-3">
            {post.categories.map(cat => (
              <span key={cat.id} className="text-xs px-2 py-1 bg-gray-100 rounded-full">{cat.name}</span>
            ))}
          </div>
        )}
      </header>
      {post.coverImage && (
        <img src={post.coverImage} alt={post.title} className="w-full rounded-lg mb-8" />
      )}
      <BlockRenderer content={post.content} />
    </article>
  );
}
