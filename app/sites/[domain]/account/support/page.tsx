import { notFound } from 'next/navigation';
import { getClientWebsiteByDomain } from '@/lib/actions/client-sites';
import { SupportPageClient } from './SupportPageClient';

export default async function SupportPage({ params }: { params: Promise<{ domain: string }> }) {
  const { domain } = await params;
  const site = await getClientWebsiteByDomain(domain);
  if (!site) notFound();

  return <SupportPageClient siteId={site.id} domain={domain} />;
}
