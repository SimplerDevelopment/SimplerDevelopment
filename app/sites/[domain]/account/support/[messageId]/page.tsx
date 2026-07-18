import { notFound } from 'next/navigation';
import { getClientWebsiteByDomain } from '@/lib/actions/client-sites';
import { SupportThreadClient } from './SupportThreadClient';

export default async function SupportThreadPage({ params }: { params: Promise<{ domain: string; messageId: string }> }) {
  const { domain, messageId } = await params;
  const site = await getClientWebsiteByDomain(domain);
  if (!site) notFound();

  return <SupportThreadClient siteId={site.id} domain={domain} messageId={messageId} />;
}
