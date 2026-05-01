import { notFound } from 'next/navigation';
import { getClientWebsiteByDomain, getClientPage, getClientHomePage, getClientBlogPosts, getPostTypeForPost } from '@/lib/actions/client-sites';
import { wrapWithTypeTemplate } from '@/lib/blocks/template-wrap';
import { SiteBlockRenderer } from '@/components/blocks/render/SiteBlockRenderer';
import { prefetchHtmlEmbeds } from '@/lib/blocks/prefetch-embeds';
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

  // Gate non-public sites: block public visitors, allow preview/edit access
  if (!site.publicAccess && !preview) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center max-w-md px-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-3">{site.name}</h1>
          <p className="text-gray-500">This site is not yet available to the public.</p>
        </div>
      </div>
    );
  }

  const pageSlug = slug?.join('/');

  // Load site branding once — shared by all BlockRenderer instances on this page
  const branding = await getBrandingByWebsiteId(site.id);

  // Site-wide custom code (cascades before per-type and per-post layers).
  const siteLayer = { customCss: site.customCss, customJs: site.customJs };

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

    const homeType = await getPostTypeForPost(site.id, homePage.postType);
    const content = await prefetchHtmlEmbeds(wrapWithTypeTemplate(homePage.content, homeType?.template));
    return (
      <SiteBlockRenderer
        content={content}
        siteId={site.id}
        branding={branding}
        site={siteLayer}
        type={{ customCss: homeType?.customCss, customJs: homeType?.customJs }}
        customCss={homePage.customCss}
        customJs={homePage.customJs}
      />
    );
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

  // Blog post (blog/some-slug) — render the same way as any other page so the
  // post's own blocks/customCss decide layout. The previous max-w-4xl + title +
  // date wrapper is gone: it injected a slender column and metadata that the
  // post content was already responsible for, and broke when /blog/<x> was
  // used to view a CPT (e.g. /blog/service/implementations).
  if (pageSlug.startsWith('blog/')) {
    const postSlug = pageSlug.replace('blog/', '');
    const post = await getClientPage(site.id, postSlug, preview);

    if (!post) {
      notFound();
    }

    const blogType = await getPostTypeForPost(site.id, post.postType);
    return (
      <div>
        <SiteBlockRenderer
          content={await prefetchHtmlEmbeds(wrapWithTypeTemplate(post.content, blogType?.template))}
          siteId={site.id}
          branding={branding}
          site={siteLayer}
          type={{ customCss: blogType?.customCss, customJs: blogType?.customJs }}
          customCss={post.customCss}
          customJs={post.customJs}
        />
      </div>
    );
  }

  // Regular page by slug
  const page = await getClientPage(site.id, pageSlug, preview);

  if (!page) {
    notFound();
  }

  const pageType = await getPostTypeForPost(site.id, page.postType);

  return (
    <div>
      <SiteBlockRenderer
        content={await prefetchHtmlEmbeds(wrapWithTypeTemplate(page.content, pageType?.template))}
        siteId={site.id}
        branding={branding}
        site={siteLayer}
        type={{ customCss: pageType?.customCss, customJs: pageType?.customJs }}
        customCss={page.customCss}
        customJs={page.customJs}
      />
    </div>
  );
}
