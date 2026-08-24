/**
 * Every other URL — resolved against the CMS by slug.
 *
 * Pages are tried before posts because a page is the more likely match for a
 * top-level path. Both endpoints return the same `Post` shape, so the render
 * path is identical either way.
 *
 * Only the LAST path segment is used as the slug: SimplerDevelopment slugs are
 * flat, so /about and /company/about resolve to the same document. If you need
 * true nested routing, key it off the full joined path instead and give your
 * content matching slugs.
 */
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { sd } from '@/lib/sd';
import { BlockRenderer } from '@/components/BlockRenderer';
import { NotFoundError } from '@simplerdevelopment/sdk';
import type { Post } from '@simplerdevelopment/sdk';

export const revalidate = 60;

async function resolve(slugParts: string[]): Promise<Post | null> {
  const slug = slugParts[slugParts.length - 1];
  if (!slug) return null;

  for (const fetchOne of [sd.pages.get.bind(sd.pages), sd.posts.get.bind(sd.posts)]) {
    try {
      return await fetchOne(slug);
    } catch (err) {
      // A miss on pages is expected — fall through and try posts. Anything that
      // is not a 404 (auth, rate limit, network) must surface, not be swallowed
      // into a misleading "page not found".
      if (!(err instanceof NotFoundError)) throw err;
    }
  }
  return null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const doc = await resolve(slug);
  if (!doc) return {};
  return {
    title: doc.seoTitle ?? doc.title,
    description: doc.seoDescription ?? doc.excerpt ?? undefined,
    openGraph: doc.ogImage ? { images: [doc.ogImage] } : undefined,
  };
}

export default async function CmsPage({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const doc = await resolve(slug);
  if (!doc) notFound();

  return (
    <article>
      <h1>{doc.title}</h1>
      <BlockRenderer content={doc.content} />
    </article>
  );
}
