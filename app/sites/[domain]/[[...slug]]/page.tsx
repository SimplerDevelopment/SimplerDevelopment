import { notFound } from 'next/navigation';
import { getClientWebsiteByDomain, getClientPage, getClientHomePage, getClientBlogPosts } from '@/lib/actions/client-sites';
import { BlockRenderer } from '@/components/blocks/render/BlockRenderer';
import type { Metadata } from 'next';
import Link from 'next/link';

interface PageProps {
  params: Promise<{ domain: string; slug?: string[] }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { domain, slug } = await params;
  const site = await getClientWebsiteByDomain(domain);
  if (!site) return { title: 'Not Found' };

  const pageSlug = slug?.join('/');

  if (!pageSlug || pageSlug === '') {
    return { title: site.name };
  }

  const page = await getClientPage(site.id, pageSlug);
  if (!page) return { title: 'Not Found' };

  return {
    title: page.title,
    description: page.excerpt || undefined,
  };
}

export default async function ClientSitePage({ params }: PageProps) {
  const { domain, slug } = await params;
  const site = await getClientWebsiteByDomain(domain);

  if (!site) {
    notFound();
  }

  const pageSlug = slug?.join('/');

  // Home page
  if (!pageSlug || pageSlug === '') {
    const homePage = await getClientHomePage(site.id);

    if (!homePage) {
      // No pages yet — show a placeholder
      return (
        <div className="max-w-4xl mx-auto px-4 py-16 text-center">
          <h1 className="text-3xl font-bold mb-4">{site.name}</h1>
          <p className="text-gray-500">This site is coming soon.</p>
        </div>
      );
    }

    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <BlockRenderer content={homePage.content} />
      </div>
    );
  }

  // Blog listing
  if (pageSlug === 'blog') {
    const blogPosts = await getClientBlogPosts(site.id);

    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold mb-8">Blog</h1>
        {blogPosts.length === 0 ? (
          <p className="text-gray-500">No posts yet.</p>
        ) : (
          <div className="space-y-8">
            {blogPosts.map((post) => (
              <article key={post.id} className="border-b border-gray-200 pb-6">
                <Link href={`/blog/${post.slug}`} className="group">
                  <h2 className="text-xl font-semibold group-hover:text-blue-600 transition-colors">
                    {post.title}
                  </h2>
                  {post.excerpt && (
                    <p className="text-gray-600 mt-2">{post.excerpt}</p>
                  )}
                  {post.publishedAt && (
                    <time className="text-sm text-gray-400 mt-2 block">
                      {new Date(post.publishedAt).toLocaleDateString()}
                    </time>
                  )}
                </Link>
              </article>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Blog post (blog/some-slug)
  if (pageSlug.startsWith('blog/')) {
    const postSlug = pageSlug.replace('blog/', '');
    const post = await getClientPage(site.id, postSlug);

    if (!post) {
      notFound();
    }

    return (
      <article className="max-w-4xl mx-auto px-4 py-8">
        <header className="mb-8">
          <h1 className="text-3xl font-bold">{post.title}</h1>
          {post.publishedAt && (
            <time className="text-sm text-gray-400 mt-2 block">
              {new Date(post.publishedAt).toLocaleDateString()}
            </time>
          )}
        </header>
        <BlockRenderer content={post.content} />
      </article>
    );
  }

  // Regular page by slug
  const page = await getClientPage(site.id, pageSlug);

  if (!page) {
    notFound();
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {page.postType === 'page' && (
        <h1 className="text-3xl font-bold mb-8">{page.title}</h1>
      )}
      <BlockRenderer content={page.content} />
    </div>
  );
}
