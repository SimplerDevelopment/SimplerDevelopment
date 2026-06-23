import { notFound } from 'next/navigation';
import { getClientWebsiteByDomain } from '@/lib/actions/client-sites';
import { OrdersPageClient } from './OrdersPageClient';

export default async function OrdersPage({ params }: { params: Promise<{ domain: string }> }) {
  const { domain } = await params;
  const site = await getClientWebsiteByDomain(domain);
  if (!site) notFound();

  return <OrdersPageClient siteId={site.id} domain={domain} />;
}
