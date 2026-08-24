/**
 * Home page.
 *
 * Looks for a CMS page with the slug `home`. If there isn't one, falls back to
 * listing recent posts — so a freshly-connected site shows something real
 * instead of a 404 while its content is still being written.
 */
import type { Metadata } from 'next';
import { sd } from '@/lib/sd';
import { BlockRenderer } from '@/components/BlockRenderer';
import { NotFoundError } from '@simplerdevelopment/sdk';

export const revalidate = 60;

export async function generateMetadata(): Promise<Metadata> {
  try {
    const page = await sd.pages.get('home');
    return { title: page.seoTitle ?? page.title, description: page.seoDescription ?? undefined };
  } catch {
    return {};
  }
}

export default async function HomePage() {
  try {
    const page = await sd.pages.get('home');
    return <BlockRenderer content={page.content} />;
  } catch (err) {
    if (!(err instanceof NotFoundError)) throw err;
  }

  const { data: posts } = await sd.posts.list({ limit: 10 });
  return (
    <section>
      <h1>Latest</h1>
      {posts.length === 0 && <p>No published content yet.</p>}
      <ul>
        {posts.map(post => (
          <li key={post.id}>
            <a href={`/${post.slug}`}>{post.title}</a>
            {post.excerpt && <p>{post.excerpt}</p>}
          </li>
        ))}
      </ul>
    </section>
  );
}
