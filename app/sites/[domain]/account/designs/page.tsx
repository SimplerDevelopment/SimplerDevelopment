import { notFound } from 'next/navigation';
import { getClientWebsiteByDomain } from '@/lib/actions/client-sites';
import { MyDesignsPanel } from '@/components/storefront/account/MyDesignsPanel';

export default async function DesignsPage({ params }: { params: Promise<{ domain: string }> }) {
  const { domain } = await params;
  const site = await getClientWebsiteByDomain(domain);
  if (!site) notFound();

  return <MyDesignsPanel siteId={site.id} domain={domain} />;
}
