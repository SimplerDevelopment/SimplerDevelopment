import { notFound } from 'next/navigation';
import { getClientWebsiteByDomain } from '@/lib/actions/client-sites';
import { AccountDashboardClient } from './AccountDashboardClient';

export default async function AccountPage({ params }: { params: Promise<{ domain: string }> }) {
  const { domain } = await params;
  const site = await getClientWebsiteByDomain(domain);
  if (!site) notFound();

  return <AccountDashboardClient siteId={site.id} domain={domain} />;
}
