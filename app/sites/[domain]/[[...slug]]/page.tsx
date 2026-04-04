import { notFound } from 'next/navigation';
import { getClientWebsiteByDomain, getClientPage, getClientHomePage, getClientBlogPosts } from '@/lib/actions/client-sites';
import { SiteBlockRenderer } from '@/components/blocks/render/SiteBlockRenderer';
import { ProductPage } from '@/components/storefront/ProductPage';
import { ShopPage } from '@/components/storefront/ShopPage';
import { getBrandingByWebsiteId } from '@/lib/branding';
import { auth } from '@/lib/auth';
import { verifyPreviewToken } from '@/lib/preview-token';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';

// Prevent Next.js from caching these pages — content changes frequently
export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ domain: string; slug?: string[] }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { domain, slug } = await params;
  const site = await getClientWebsiteByDomain(domain);
  if (!site) return { title: 'Not Found' };

  const pageSlug = slug?.join('/');

  if (!pageSlug || pageSlug === '') {
    return { title: site.name };
  }

  if (pageSlug === 'shop') {
    return { title: `Shop | ${site.name}`, description: `Browse products from ${site.name}` };
  }

  if (pageSlug.startsWith('shop/')) {
    return { title: `Shop | ${site.name}` };
  }

  const page = await getClientPage(site.id, pageSlug);
  if (!page) return { title: 'Not Found' };

  return {
    title: page.title,
    description: page.excerpt || undefined,
  };
}

export default async function ClientSitePage({ params, searchParams }: PageProps) {
  const { domain, slug } = await params;
  const { _edit, _preview, _token } = await searchParams;
  const site = await getClientWebsiteByDomain(domain);

  if (!site) {
    notFound();
  }

  // Allow draft preview via auth session or signed preview token
  const isEditMode = _edit === 'true';
  const isPreviewMode = _preview === 'true';
  let preview = false;
  if (isEditMode || isPreviewMode) {
    // Check for preview token first (works cross-origin)
    if (typeof _token === 'string' && verifyPreviewToken(site.id, _token)) {
      preview = true;
    } else {
      // Fall back to session auth (same-origin only)
      const session = await auth();
      preview = !!session?.user?.id;
    }
  }

  const pageSlug = slug?.join('/');

  // Load site branding once — shared by all BlockRenderer instances on this page
  const branding = await getBrandingByWebsiteId(site.id);

  // Home page
  if (!pageSlug || pageSlug === '') {
    const homePage = await getClientHomePage(site.id, preview);

    if (!homePage) {
      // No pages yet — show a placeholder
      return (
        <div className="max-w-4xl mx-auto px-4 py-16 text-center">
          <h1 className="text-3xl font-bold mb-4">{site.name}</h1>
          <p className="text-gray-500">This site is coming soon.</p>
        </div>
      );
    }

    return <SiteBlockRenderer content={homePage.content} siteId={site.id} branding={branding} />;
  }

  // Shop listing
  if (pageSlug === 'shop') {
    return (
      <Suspense fallback={
        <div className="max-w-7xl mx-auto px-4 py-12">
          <div className="h-10 bg-muted/20 rounded w-48 mb-8 animate-pulse" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="border border-border rounded-lg overflow-hidden animate-pulse">
                <div className="aspect-square bg-muted/20" />
                <div className="p-4 space-y-2">
                  <div className="h-4 bg-muted/30 rounded w-3/4" />
                  <div className="h-4 bg-muted/20 rounded w-1/3" />
                </div>
              </div>
            ))}
          </div>
        </div>
      }>
        <ShopPage siteId={site.id} />
      </Suspense>
    );
  }

  // Product detail page (shop/some-slug)
  if (pageSlug.startsWith('shop/')) {
    const productSlug = pageSlug.replace('shop/', '');
    return <ProductPage siteId={site.id} productSlug={productSlug} />;
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
    const post = await getClientPage(site.id, postSlug, preview);

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
        <SiteBlockRenderer content={post.content} siteId={site.id} branding={branding} />
      </article>
    );
  }

  // Regular page by slug
  const page = await getClientPage(site.id, pageSlug, preview);

  if (!page) {
    notFound();
  }

  return (
    <div>
      <SiteBlockRenderer content={page.content} siteId={site.id} branding={branding} />
    </div>
  );
}
