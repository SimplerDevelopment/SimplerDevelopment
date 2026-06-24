import { auth } from '@/lib/auth';
import { redirect, notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { clientWebsites, postTypes } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { resolvePortalSite } from '@/lib/portal-client';
import { CustomFieldsManager } from '@/components/portal/CustomFieldsManager';
import { promoteBuiltInContentType } from '@/lib/portal/promote-content-type';
import { PortalPageHeader } from '@/components/portal/PortalPageHeader';

interface PageProps {
  params: Promise<{ siteId: string; typeId: string }>;
}

export default async function ContentTypeFieldsPage({ params }: PageProps) {
  const { siteId, typeId } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect('/portal/login');

  const resolved = await resolvePortalSite(parseInt(session.user.id, 10), parseInt(siteId));
  if (!resolved) notFound();
  const { site } = resolved;

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
      <PortalPageHeader
        eyebrow="Website"
        title={type.name}
        subtitle={<>Define structured fields for every <code className="font-mono">{type.slug}</code> post — text, select, image, repeaters, groups, etc. Authors fill them in alongside the block content on the post edit page; values surface in templates via the same custom-field engine the CRM uses.</>}
      />

      <CustomFieldsManager
        collectionEndpoint={base}
        itemEndpoint={base}
      />
    </div>
  );
}
