import { notFound } from 'next/navigation';
import { getClientWebsiteByDomain } from '@/lib/actions/client-sites';
import { CartPageClient } from './CartPageClient';

export default async function CartPage({ params }: { params: Promise<{ domain: string }> }) {
  const { domain } = await params;
  const site = await getClientWebsiteByDomain(domain);
  if (!site) notFound();

  return <CartPageClient siteId={site.id} domain={domain} />;
}
