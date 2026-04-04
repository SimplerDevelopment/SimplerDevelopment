import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import { getClientWebsiteByDomain, getClientSiteNav } from '@/lib/actions/client-sites';
import { getBrandingByWebsiteId } from '@/lib/branding';
import Link from 'next/link';
import type { Metadata } from 'next';

interface LayoutProps {
  children: React.ReactNode;
  params: Promise<{ domain: string }>;
}

export async function generateMetadata({ params }: { params: Promise<{ domain: string }> }): Promise<Metadata> {
  const { domain } = await params;
  const site = await getClientWebsiteByDomain(domain);
  if (!site) return { title: 'Site Not Found' };

  // Block search engine indexing for non-public sites
  if (!site.publicAccess) {
    return {
      title: site.name,
      robots: { index: false, follow: false },
    };
  }

  const branding = await getBrandingByWebsiteId(site.id);

  const metadata: Metadata = {
    title: {
      default: site.name,
      template: `%s | ${site.name}`,
    },
    description: site.description || undefined,
  };

  if (branding.faviconUrl) {
    metadata.icons = { icon: branding.faviconUrl };
  }

  if (branding.ogImageUrl) {
    metadata.openGraph = {
      images: [{ url: branding.ogImageUrl }],
      siteName: site.name,
    };
    metadata.twitter = {
      card: 'summary_large_image',
      images: [branding.ogImageUrl],
    };
  }

  return metadata;
}

export default async function ClientSiteLayout({ children, params }: LayoutProps) {
  const { domain } = await params;
  const site = await getClientWebsiteByDomain(domain);

  if (!site) {
    notFound();
  }

  // Bare layout for preview pages (nav-preview, etc.) — no site header/footer
  const headersList = await headers();
  const sitePathname = headersList.get('x-site-pathname') || '';
  if (sitePathname.includes('/nav-preview')) {
    return <>{children}</>;
  }

  // Gate non-public sites — the actual block is in [[...slug]]/page.tsx
  // where searchParams are available to check for preview tokens.

  const branding = await getBrandingByWebsiteId(site.id);

  // Build link + button brand styles that require pseudo-selectors
  const brandStyles = [
    branding.linkColor && `a { color: ${branding.linkColor}; }`,
    branding.linkHoverColor && `a:hover { color: ${branding.linkHoverColor}; }`,
    branding.buttonStyle?.primaryHoverBg && `.brand-btn-primary:hover { background-color: ${branding.buttonStyle.primaryHoverBg} !important; }`,
    branding.buttonStyle?.secondaryHoverBg && `.brand-btn-secondary:hover { background-color: ${branding.buttonStyle.secondaryHoverBg} !important; }`,
  ].filter(Boolean).join('\n');

  // Custom layout mode: blocks handle their own nav/footer/styling
  if (site.customLayout) {
    return (
      <>
        {brandStyles && <style dangerouslySetInnerHTML={{ __html: brandStyles }} />}
        {/* Load Google Fonts for custom-layout sites */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&family=Playfair+Display:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500;1,600;1,700&display=swap"
          rel="stylesheet"
        />
        <div className="min-h-screen" style={{ scrollBehavior: 'smooth', fontFamily: '"Inter", system-ui, sans-serif' }}>
          {children}
        </div>
      </>
    );
  }

  const pages = await getClientSiteNav(site.id);

  return (
    <>
    {brandStyles && <style dangerouslySetInnerHTML={{ __html: brandStyles }} />}
    <div className="min-h-screen flex flex-col bg-white text-gray-900">
      <header className="border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="text-xl font-bold">
            {site.name}
          </Link>
          <nav className="flex gap-6">
            {pages
              .filter((p) => p.slug !== 'home' && p.slug !== 'index')
              .map((page) => (
                <Link
                  key={page.id}
                  href={`/${page.slug}`}
                  className="text-gray-600 hover:text-gray-900 transition-colors"
                >
                  {page.title}
                </Link>
              ))}
          </nav>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-gray-200 py-8">
        <div className="max-w-6xl mx-auto px-4 text-center text-sm text-gray-500">
          &copy; {new Date().getFullYear()} {site.name}
        </div>
      </footer>
    </div>
    </>
  );
}
