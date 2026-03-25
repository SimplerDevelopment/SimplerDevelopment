import { notFound } from 'next/navigation';
import { getClientWebsiteByDomain, getClientSiteNav } from '@/lib/actions/client-sites';
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

  return {
    title: {
      default: site.name,
      template: `%s | ${site.name}`,
    },
    description: site.description || undefined,
  };
}

export default async function ClientSiteLayout({ children, params }: LayoutProps) {
  const { domain } = await params;
  const site = await getClientWebsiteByDomain(domain);

  if (!site) {
    notFound();
  }

  const pages = await getClientSiteNav(site.id);

  return (
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
  );
}
