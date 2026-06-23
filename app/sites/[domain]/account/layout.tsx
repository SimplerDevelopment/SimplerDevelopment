import { notFound } from 'next/navigation';
import { getClientWebsiteByDomain } from '@/lib/actions/client-sites';
import { CustomerAuthProvider } from '@/components/storefront/account/CustomerAuthContext';

interface LayoutProps {
  children: React.ReactNode;
  params: Promise<{ domain: string }>;
}

export default async function AccountLayout({ children, params }: LayoutProps) {
  const { domain } = await params;
  const site = await getClientWebsiteByDomain(domain);
  if (!site) notFound();

  return (
    <CustomerAuthProvider siteId={site.id}>
      {children}
    </CustomerAuthProvider>
  );
}
