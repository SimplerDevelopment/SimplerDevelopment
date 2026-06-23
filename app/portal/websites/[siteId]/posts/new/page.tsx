import { auth } from '@/lib/auth';
import { redirect, notFound } from 'next/navigation';
import { resolvePortalSite } from '@/lib/portal-client';
import PortalPostForm from '@/components/portal/PortalPostForm';
import { generatePreviewToken } from '@/lib/preview-token';
import { getBrandDefaults } from '@/lib/branding';

export default async function PortalNewPostPage({
  params,
}: {
  params: Promise<{ siteId: string }>;
}) {
  const { siteId } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect('/portal/login');

  const userId = parseInt(session.user.id, 10);
  const resolved = await resolvePortalSite(userId, parseInt(siteId));
  if (!resolved) notFound();
  const { site, client } = resolved;

  // Build iframe URL for visual editor
  // Always use internal /sites/ route — avoids X-Frame-Options SAMEORIGIN block
  // when the portal is accessed from a tenant subdomain (different origin to site domain)
  const subdomain = site.subdomain;
  const fullDomain = site.vercelDomain || (subdomain ? `${subdomain}.simplerdevelopment.com` : null);
  const appUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://simplerdevelopment.com';
  const siteIdentifier = fullDomain || site.domain || null;
  const siteUrl = siteIdentifier ? `${appUrl}/sites/${siteIdentifier}` : null;

  const previewToken = generatePreviewToken(site.id);
  const publicUrl = fullDomain
    ? `${appUrl}/sites/${fullDomain}`
    : null;

  // Load brand context so newly-created blocks pre-fill with the client's
  // messaging + reference brand sentinels for colors/fonts.
  const brandDefaults = await getBrandDefaults({
    clientId: client.id,
    brandingProfileId: site.brandingProfileId,
  });

  return (
    <PortalPostForm
      siteId={site.id}
      mode="create"
      publicUrl={publicUrl}
      previewToken={previewToken}
      siteUrl={siteUrl}
      siteDomain={site.domain || subdomain || undefined}
      brandDefaults={brandDefaults}
    />
  );
}
