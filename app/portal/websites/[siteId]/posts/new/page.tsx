import { db } from '@/lib/db';
import { clientWebsites } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { redirect, notFound } from 'next/navigation';
import { getPortalClient } from '@/lib/portal-client';
import PortalPostForm from '@/components/portal/PortalPostForm';

export default async function PortalNewPostPage({
  params,
}: {
  params: Promise<{ siteId: string }>;
}) {
  const { siteId } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect('/portal/login');

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) redirect('/portal/dashboard');

  const [site] = await db
    .select()
    .from(clientWebsites)
    .where(and(eq(clientWebsites.id, parseInt(siteId)), eq(clientWebsites.clientId, client.id)))
    .limit(1);

  if (!site) notFound();

  // Build iframe URL for visual editor
  // Managed sites (no Vercel project) use the main app's /sites/ route for the iframe
  const isManaged = !site.vercelProjectId;
  const subdomain = site.subdomain;
  const fullDomain = site.vercelDomain || (subdomain ? `${subdomain}.simplerdevelopment.com` : null);
  const appUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://simplerdevelopment.com';
  const siteUrl = isManaged && fullDomain
    ? `${appUrl}/sites/${fullDomain}`
    : site.domain
      ? `https://${site.domain}`
      : fullDomain
        ? `https://${fullDomain}`
        : null;

  return (
    <PortalPostForm
      siteId={site.id}
      mode="create"
      siteUrl={siteUrl}
      siteDomain={site.domain || subdomain || undefined}
    />
  );
}
