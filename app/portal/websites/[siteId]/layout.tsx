import { db } from '@/lib/db';
import { clientWebsites } from '@/lib/db/schema';
import { and, eq, inArray } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { redirect, notFound } from 'next/navigation';
import { getPortalClients } from '@/lib/portal-client';
import { WebsiteSubNav } from '@/components/portal/WebsiteSubNav';

interface LayoutProps {
  children: React.ReactNode;
  params: Promise<{ siteId: string }>;
}

// Per-website layout — every page under /portal/websites/[siteId]/* gets the
// shared site header (back arrow, name, subdomain, view-live link, +Entry
// button) and a tab nav so authors can jump between sub-areas without
// returning to the dashboard. Full-screen editors (post edit, template edit,
// email template edit) hide the chrome via WebsiteSubNav's pathname check.
export default async function WebsiteLayout({ children, params }: LayoutProps) {
  const { siteId } = await params;
  const id = parseInt(siteId);
  if (Number.isNaN(id)) notFound();

  const session = await auth();
  if (!session?.user?.id) redirect('/portal/login');

  const accessibleClients = await getPortalClients(parseInt(session.user.id, 10));
  if (accessibleClients.length === 0) redirect('/portal/dashboard');

  const [site] = await db
    .select({
      id: clientWebsites.id,
      name: clientWebsites.name,
      domain: clientWebsites.domain,
      subdomain: clientWebsites.subdomain,
      vercelDomain: clientWebsites.vercelDomain,
    })
    .from(clientWebsites)
    .where(
      and(
        eq(clientWebsites.id, id),
        inArray(
          clientWebsites.clientId,
          accessibleClients.map((client) => client.id),
        ),
      ),
    )
    .limit(1);
  if (!site) notFound();

  return (
    <>
      <WebsiteSubNav site={site} />
      {children}
    </>
  );
}
