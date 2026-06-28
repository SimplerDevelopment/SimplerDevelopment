import { auth } from '@/lib/auth';
import { redirect, notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { postTypes } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { resolvePortalSite } from '@/lib/portal-client';
import { generatePreviewToken } from '@/lib/preview-token';
import { TemplateEditor } from '@/components/portal/TemplateEditor';
import { promoteBuiltInContentType } from '@/lib/portal/promote-content-type';

interface PageProps {
  params: Promise<{ siteId: string; typeId: string }>;
}

export default async function ContentTypeTemplatePage({ params }: PageProps) {
  const { siteId, typeId } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect('/portal/login');

  const resolved = await resolvePortalSite(parseInt(session.user.id, 10), parseInt(siteId));
  if (!resolved) notFound();
  const { site } = resolved;

  // Built-in types (page, blog, event, …) are global / read-only. The
  // editor only operates on site-scoped rows, so on first edit fork the
  // built-in into a site-scoped copy and redirect the URL to the new id.
  const promoted = await promoteBuiltInContentType(site.id, parseInt(typeId));
  if (!promoted) notFound();
  if (promoted.redirected) {
    redirect(`/portal/websites/${siteId}/content-types/${promoted.id}/template`);
  }

  const [type] = await db
    .select()
    .from(postTypes)
    .where(and(eq(postTypes.id, promoted.id), eq(postTypes.websiteId, site.id)))
    .limit(1);
  if (!type) notFound();

  // Build the iframe source — always use internal /sites/ route to avoid
  // X-Frame-Options SAMEORIGIN block when the portal is accessed from a
  // tenant subdomain (different origin to site domain).
  const subdomain = site.subdomain;
  const fullDomain = site.vercelDomain || (subdomain ? `${subdomain}.simplerdevelopment.com` : null);
  const appUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://simplerdevelopment.com';
  const previewToken = generatePreviewToken(site.id);
  const siteIdentifier = fullDomain || site.domain || null;
  const siteUrl = siteIdentifier ? `${appUrl}/sites/${siteIdentifier}` : null;

  return (
    <TemplateEditor
      siteId={String(site.id)}
      typeId={String(type.id)}
      typeName={type.name}
      typeSlug={type.slug}
      siteUrl={siteUrl}
      previewToken={previewToken}
    />
  );
}
