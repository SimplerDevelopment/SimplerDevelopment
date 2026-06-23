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

export default async function CatchAllPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  let post;
  try {
    post = await sd.posts.get(slug);
  } catch {
    notFound();
  }

  return (
    <div>
      <BlockRenderer content={post.content} />
    </div>
  );
}
