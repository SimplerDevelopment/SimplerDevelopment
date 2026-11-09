import { db } from '@/lib/db';
import { clientWebsites } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { getPortalClient } from '@/lib/portal-client';
import { PortalPageHeader } from '@/components/portal/PortalPageHeader';
import AiContentStudio from '@/components/portal/AiContentStudio';

export const dynamic = 'force-dynamic';

// AI Content Studio — operator UI for the Content Engine (draft-only).
// Server resolves the tenant + site list; all generation runs through the
// /api/portal/ai/* endpoints from the client component below.
export default async function AiContentStudioPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/portal/login');

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) redirect('/portal/dashboard');

  const websites = await db
    .select({ id: clientWebsites.id, name: clientWebsites.name, domain: clientWebsites.domain })
    .from(clientWebsites)
    .where(eq(clientWebsites.clientId, client.id))
    .orderBy(clientWebsites.name);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <PortalPageHeader
        eyebrow="AI Content"
        title="Content Studio"
        subtitle="Generate blog drafts, social posts, ad copy, images and video plans. Everything lands as a draft for human review — nothing publishes by itself."
      />
      <AiContentStudio sites={websites} />
    </div>
  );
}
