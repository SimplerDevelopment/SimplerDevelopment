import { notFound } from 'next/navigation';
import { getClientWebsiteByDomain } from '@/lib/actions/client-sites';
import { OrderDetailClient } from './OrderDetailClient';

export default async function OrderDetailPage({ params }: { params: Promise<{ domain: string; orderNumber: string }> }) {
  const { domain, orderNumber } = await params;
  const site = await getClientWebsiteByDomain(domain);
  if (!site) notFound();

  return <OrderDetailClient siteId={site.id} domain={domain} orderNumber={orderNumber} />;
}
