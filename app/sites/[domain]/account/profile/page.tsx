import { notFound } from 'next/navigation';
import { getClientWebsiteByDomain } from '@/lib/actions/client-sites';
import { ProfileClient } from './ProfileClient';

export default async function ProfilePage({ params }: { params: Promise<{ domain: string }> }) {
  const { domain } = await params;
  const site = await getClientWebsiteByDomain(domain);
  if (!site) notFound();

  return <ProfileClient siteId={site.id} domain={domain} />;
}
