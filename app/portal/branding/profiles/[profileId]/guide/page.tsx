import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';
import { db } from '@/lib/db';
import { brandingProfiles } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { getBrandingByProfileId, getBrandMessaging } from '@/lib/branding';
import { buildPreviewBlocks } from '@/lib/branding/preview-blocks';
import { BrandGuide } from '@/components/portal/BrandGuide';

interface PageProps {
  params: Promise<{ profileId: string }>;
}

export default async function BrandGuidePage({ params }: PageProps) {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const client = await getPortalClient(parseInt(session.user.id, 10));
  if (!client) redirect('/portal');

  const { profileId: rawId } = await params;
  const profileId = parseInt(rawId, 10);
  if (!Number.isFinite(profileId)) redirect('/portal/branding');

  const [profile] = await db
    .select({
      id: brandingProfiles.id,
      name: brandingProfiles.name,
      updatedAt: brandingProfiles.updatedAt,
    })
    .from(brandingProfiles)
    .where(and(eq(brandingProfiles.id, profileId), eq(brandingProfiles.clientId, client.id)))
    .limit(1);

  if (!profile) redirect('/portal/branding');

  const [branding, messaging] = await Promise.all([
    getBrandingByProfileId(profileId),
    getBrandMessaging(client.id, profileId),
  ]);

  const blocks = buildPreviewBlocks({ branding, messaging });

  return (
    <BrandGuide
      profileId={profileId}
      profileName={profile.name}
      updatedAt={profile.updatedAt?.toISOString()}
      clientName={client.company ?? undefined}
      branding={branding}
      messaging={messaging}
      exampleBlocks={blocks}
    />
  );
}
