import { notFound } from 'next/navigation';
import { getClientBlogPosts } from '@/lib/actions/client-sites';
import {
  getClientWebsiteByDomainCached as getClientWebsiteByDomain,
  getClientPageCached as getClientPage,
  getClientHomePageCached as getClientHomePage,
  getPostTypeForPostCached as getPostTypeForPost,
  getBrandingByWebsiteIdCached as getBrandingByWebsiteId,
} from '@/lib/site-data-cache';
import { wrapWithTypeTemplate } from '@/lib/blocks/template-wrap';
import { expandLoopsInContent, type LoopPaginationContext } from '@/lib/blocks/html-render-loops';
import { SiteBlockRenderer } from '@/components/blocks/render/SiteBlockRenderer';
import { prefetchHtmlEmbeds } from '@/lib/blocks/prefetch-embeds';
import { ProductPage } from '@/components/storefront/ProductPage';
import { ShopPage } from '@/components/storefront/ShopPage';
import { auth } from '@/lib/auth';
import { verifyPreviewToken } from '@/lib/preview-token';
import { unlockCookieName, verifyUnlockCookieValue } from '@/lib/preview-unlock';
import { cookies } from 'next/headers';
import { applyAbToPostContent } from '@/lib/ab/render';
import { AbGoalTracker } from '@/components/blocks/AbGoalTracker';
import { AccessCodeForm } from '@/components/marketing/AccessCodeForm';
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
  if (!site) return { title: { absolute: 'Not Found' } };

  const pageSlug = slug?.join('/');

  // Build per-page metadata from a CMS post row. Uses the dedicated SEO
  // fields when set, falls back to title/excerpt. Returns `title` as
  // `{ absolute }` so the root layout's `%s | SimplerDevelopment` template
  // never appends an agency suffix to client-site pages.
  type SeoPage = {
    title: string;
    excerpt?: string | null;
    seoTitle?: string | null;
    seoDescription?: string | null;
    ogImage?: string | null;
    noIndex?: boolean | null;
    canonicalUrl?: string | null;
  };
  const buildFromPage = (page: SeoPage): Metadata => {
    const title = page.seoTitle || page.title;
    const description = page.seoDescription || page.excerpt || undefined;
    const md: Metadata = {
      title: { absolute: title },
      description,
      openGraph: {
        title,
        description,
        ...(page.ogImage ? { images: [page.ogImage] } : {}),
      },
      twitter: {
        title,
        description,
        ...(page.ogImage ? { images: [page.ogImage] } : {}),
      },
    };
    if (page.noIndex) md.robots = { index: false, follow: false };
    if (page.canonicalUrl) md.alternates = { canonical: page.canonicalUrl };
    return md;
  };

  // Home page (no slug) — surface the SEO from the post flagged as the
  // home page so cystrategies.co/ uses the same metadata as cystrategies.co/home.
  if (!pageSlug || pageSlug === '') {
    const homePage = await getClientHomePage(site.id);
    if (homePage) return buildFromPage(homePage as SeoPage);
    // No designated home page — let the layout's `title: { absolute: site.name }`
    // be used so we don't re-trigger any template suffix.
    return {};
  }

  if (pageSlug === 'shop') {
    return {
      title: { absolute: `Shop — ${site.name}` },
      description: `Browse products from ${site.name}`,
    };
  }

  if (pageSlug.startsWith('shop/')) {
    return { title: { absolute: `Shop — ${site.name}` } };
  }

  // Blog posts live under /blog/<slug> but the post row's slug is just
  // <slug> — strip the prefix the same way the page renderer does, otherwise
  // every blog post shows "Not Found" in the <title>.
  const lookupSlug = pageSlug.startsWith('blog/') ? pageSlug.replace('blog/', '') : pageSlug;
  const page = await getClientPage(site.id, lookupSlug);
  if (!page) return { title: { absolute: 'Not Found' } };

  return buildFromPage(page as SeoPage);
}

export default async function ClientSitePage({ params, searchParams }: PageProps) {
  const { domain, slug } = await params;
  const sp = await searchParams;
  const { _edit, _preview, _token } = sp;
  const site = await getClientWebsiteByDomain(domain);

  if (!site) {
    notFound();
  }

  // Build the loop pagination context once — every page-render path below
  // routes html-render `data-loop="posts"` regions through expandLoopsInContent,
  // and a pagination UI on any of those blocks needs the current page +
  // pathname to render numbered links / prev / next. Pages without a
  // `?page=` param default to page 1. We strip framework / preview /
  // edit-mode params from the link generator so they don't bleed into
  // public pagination URLs.
  const pageSlug = (slug?.join('/') ?? '');
  const pathname = `/${pageSlug}`.replace(/\/+$/, '') || '/';
  const rawPage = Array.isArray(sp.page) ? sp.page[0] : sp.page;
  const parsedPage = typeof rawPage === 'string' ? parseInt(rawPage, 10) : 1;
  const currentPage = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const EXTRA_PARAM_DENYLIST = new Set(['page', '_edit', '_preview', '_token']);
  const extraParams: Record<string, string> = {};
  for (const [k, v] of Object.entries(sp)) {
    if (EXTRA_PARAM_DENYLIST.has(k)) continue;
    if (typeof v === 'string') extraParams[k] = v;
    else if (Array.isArray(v) && typeof v[0] === 'string') extraParams[k] = v[0];
  }
  const pagination: LoopPaginationContext = { page: currentPage, pathname, extraParams };

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
  // or visitors who unlocked the site with its preview code.
  if (!site.publicAccess && !preview) {
    const cookieStore = await cookies();
    const unlockedCookie = cookieStore.get(unlockCookieName(site.id))?.value;
    if (!verifyUnlockCookieValue(site.id, unlockedCookie)) {
      // Full-screen overlay (z above the fixed site nav) so the locked site's
      // navigation/footer chrome is never visible behind the gate. The site
      // layout has no transformed ancestor, so `fixed` pins to the viewport.
      return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-auto bg-gray-50 px-6 py-12">
          <div className="flex w-full max-w-md flex-col items-center text-center">
            <h1 className="mb-2 text-2xl font-bold text-gray-900">{site.name}</h1>
            <p className="mb-8 text-gray-500">This site is private.</p>
            <AccessCodeForm variant="gate" />
          </div>
        </div>
      );
    }
  }

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
    const ab = await applyAbToPostContent({ postId: homePage.id, content: homePage.content, skip: preview });
    const content = await prefetchHtmlEmbeds(
      await expandLoopsInContent(site.id, wrapWithTypeTemplate(ab.content, homeType?.template), homePage.id, pagination),
    );
    return (
      <>
        <SiteBlockRenderer
          content={content}
          siteId={site.id}
          branding={branding}
          site={siteLayer}
          type={{ customCss: homeType?.customCss, customJs: homeType?.customJs }}
          customCss={homePage.customCss}
          customJs={homePage.customJs}
        />
        {ab.ab && ab.visitorId ? (
          <AbGoalTracker
            experimentId={ab.ab.experimentId}
            variantKey={ab.ab.variantKey}
            goalMetric={ab.ab.goalMetric}
            goalSelector={ab.ab.goalSelector}
            visitorId={ab.visitorId}
          />
        ) : null}
      </>
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
    const ab = await applyAbToPostContent({ postId: post.id, content: post.content, skip: preview });
    return (
      <div>
        <SiteBlockRenderer
          content={await prefetchHtmlEmbeds(
            await expandLoopsInContent(site.id, wrapWithTypeTemplate(ab.content, blogType?.template), post.id, pagination),
          )}
          siteId={site.id}
          branding={branding}
          site={siteLayer}
          type={{ customCss: blogType?.customCss, customJs: blogType?.customJs }}
          customCss={post.customCss}
          customJs={post.customJs}
        />
        {ab.ab && ab.visitorId ? (
          <AbGoalTracker
            experimentId={ab.ab.experimentId}
            variantKey={ab.ab.variantKey}
            goalMetric={ab.ab.goalMetric}
            goalSelector={ab.ab.goalSelector}
            visitorId={ab.visitorId}
          />
        ) : null}
      </div>
    );
  }

  // Regular page by slug
  const page = await getClientPage(site.id, pageSlug, preview);

  if (!page) {
    notFound();
  }

  const pageType = await getPostTypeForPost(site.id, page.postType);
  const ab = await applyAbToPostContent({ postId: page.id, content: page.content, skip: preview });

  return (
    <div>
      <SiteBlockRenderer
        content={await prefetchHtmlEmbeds(
          await expandLoopsInContent(site.id, wrapWithTypeTemplate(ab.content, pageType?.template), page.id, pagination),
        )}
        siteId={site.id}
        branding={branding}
        site={siteLayer}
        type={{ customCss: pageType?.customCss, customJs: pageType?.customJs }}
        customCss={page.customCss}
        customJs={page.customJs}
      />
      {ab.ab && ab.visitorId ? (
        <AbGoalTracker
          experimentId={ab.ab.experimentId}
          variantKey={ab.ab.variantKey}
          goalMetric={ab.ab.goalMetric}
          goalSelector={ab.ab.goalSelector}
          visitorId={ab.visitorId}
        />
      ) : null}
    </div>
  );
}
