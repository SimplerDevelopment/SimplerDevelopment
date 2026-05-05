import { auth } from '@/lib/auth';
import { redirect, notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { clientWebsites, postTypes } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { CustomFieldsManager } from '@/components/portal/CustomFieldsManager';
import { promoteBuiltInContentType } from '@/lib/portal/promote-content-type';

interface PageProps {
  params: Promise<{ siteId: string; typeId: string }>;
}

export default async function ContentTypeFieldsPage({ params }: PageProps) {
  const { siteId, typeId } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect('/portal/login');

  const client = await getPortalClient(parseInt(session.user.id, 10));
  if (!client) redirect('/portal/dashboard');

  const [site] = await db
    .select({ id: clientWebsites.id })
    .from(clientWebsites)
    .where(and(eq(clientWebsites.id, parseInt(siteId)), eq(clientWebsites.clientId, client.id)))
    .limit(1);
  if (!site) notFound();

  // Built-in types (page, blog, event, …) are global; fork to a site-scoped
  // copy on first edit so customizations don't bleed across clients.
  const promoted = await promoteBuiltInContentType(site.id, parseInt(typeId));
  if (!promoted) notFound();
  if (promoted.redirected) {
    redirect(`/portal/websites/${siteId}/content-types/${promoted.id}/fields`);
  }

  const [type] = await db
    .select()
    .from(postTypes)
    .where(and(eq(postTypes.id, promoted.id), eq(postTypes.websiteId, site.id)))
    .limit(1);
  if (!type) notFound();

  const base = `/api/portal/cms/websites/${site.id}/content-types/${type.id}/fields`;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="material-icons text-sm">input</span>
          <span>Custom fields</span>
          <span>·</span>
          <code className="font-mono">{type.slug}</code>
        </div>
        <h1 className="text-2xl font-bold text-foreground">{type.name}</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Define structured fields for every <code className="font-mono">{type.slug}</code> post — text,
          select, image, repeaters, groups, etc. Authors fill them in alongside the block content on the post
          edit page; values surface in templates via the same custom-field engine the CRM uses.
        </p>
      </div>

      <CustomFieldsManager
        collectionEndpoint={base}
        itemEndpoint={base}
      />
    </div>
  );
}
