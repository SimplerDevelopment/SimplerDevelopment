import { auth } from '@/lib/auth';
import { redirect, notFound } from 'next/navigation';
import { db } from '@/lib/db';
import { clientWebsites, postTypes } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { generatePreviewToken } from '@/lib/preview-token';
import { TemplateEditor } from '@/components/portal/TemplateEditor';

interface PageProps {
  params: Promise<{ siteId: string; typeId: string }>;
}

export default async function ContentTypeTemplatePage({ params }: PageProps) {
  const { siteId, typeId } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect('/portal/login');

  const client = await getPortalClient(parseInt(session.user.id, 10));
  if (!client) redirect('/portal/dashboard');

  const [site] = await db
    .select()
    .from(clientWebsites)
    .where(and(eq(clientWebsites.id, parseInt(siteId)), eq(clientWebsites.clientId, client.id)))
    .limit(1);
  if (!site) notFound();

  const [type] = await db
    .select()
    .from(postTypes)
    .where(and(eq(postTypes.id, parseInt(typeId)), eq(postTypes.websiteId, site.id)))
    .limit(1);
  if (!type) notFound();

  // Build the iframe source — same pattern as the post edit page. Managed
  // sites (no Vercel project of their own) load through the main app's
  // /sites/<domain> route; standalone sites load through their own domain.
  const isManaged = !site.vercelProjectId;
  const subdomain = site.subdomain;
  const fullDomain = site.vercelDomain || (subdomain ? `${subdomain}.simplerdevelopment.com` : null);
  const appUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://simplerdevelopment.com';
  const previewToken = generatePreviewToken(site.id);
  const siteUrl = isManaged && fullDomain
    ? `${appUrl}/sites/${fullDomain}`
    : site.domain
      ? `https://${site.domain}`
      : fullDomain
        ? `https://${fullDomain}`
        : null;

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
