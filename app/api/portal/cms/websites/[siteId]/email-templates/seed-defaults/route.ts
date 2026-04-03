import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { websiteEmailTemplates, clientWebsites, brandingProfiles, clients } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { resolveClientSite } from '@/lib/portal-client';
import { getDefaultTemplates } from '@/lib/email/default-email-templates';
import { renderBlocksToEmailHtml } from '@/lib/email';
import { applyBrandingToBlocks, brandingProfileToEmailBranding } from '@/lib/email/apply-branding-to-blocks';

export async function POST(_req: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { siteId } = await params;
  const site = await resolveClientSite(parseInt(session.user.id, 10), parseInt(siteId));
  if (!site) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  // Get existing templates to avoid duplicates
  const existing = await db.select({ event: websiteEmailTemplates.event })
    .from(websiteEmailTemplates)
    .where(eq(websiteEmailTemplates.websiteId, site.id));
  const existingEvents = new Set(existing.map(e => e.event));

  const defaults = getDefaultTemplates();
  const toCreate = defaults.filter(d => !existingEvents.has(d.event));

  if (toCreate.length === 0) {
    return NextResponse.json({ success: true, data: { created: 0, message: 'All templates already exist.' } });
  }

  // Resolve branding profile from the website (or client default)
  let brandingProfileId: number | null = null;
  let emailBranding = null;

  // Check website-level branding profile
  const [siteRow] = await db.select({
    brandingProfileId: clientWebsites.brandingProfileId,
    clientId: clientWebsites.clientId,
  }).from(clientWebsites).where(eq(clientWebsites.id, site.id)).limit(1);

  if (siteRow?.brandingProfileId) {
    brandingProfileId = siteRow.brandingProfileId;
  } else if (siteRow?.clientId) {
    // Fall back to client's default branding profile
    const [defaultProfile] = await db.select({ id: brandingProfiles.id })
      .from(brandingProfiles)
      .where(eq(brandingProfiles.clientId, siteRow.clientId))
      .limit(1);
    if (defaultProfile) brandingProfileId = defaultProfile.id;
  }

  // Load branding profile data if found
  if (brandingProfileId) {
    const [profile] = await db.select().from(brandingProfiles)
      .where(eq(brandingProfiles.id, brandingProfileId)).limit(1);
    if (profile) {
      // Get company name from client
      let companyName: string | undefined;
      if (siteRow?.clientId) {
        const [client] = await db.select({ company: clients.company })
          .from(clients).where(eq(clients.id, siteRow.clientId)).limit(1);
        companyName = client?.company ?? undefined;
      }
      emailBranding = brandingProfileToEmailBranding(profile, companyName);
    }
  }

  const created = await db.insert(websiteEmailTemplates).values(
    toCreate.map(t => {
      // Apply branding to blocks if available
      const brandedBlocks = emailBranding
        ? applyBrandingToBlocks(t.blocks, emailBranding)
        : t.blocks;
      const brandedHtml = brandedBlocks.length > 0
        ? renderBlocksToEmailHtml(brandedBlocks)
        : t.htmlContent;

      return {
        websiteId: site.id,
        event: t.event,
        name: t.name,
        subject: t.subject,
        description: t.description,
        htmlContent: brandedHtml,
        blockContent: { blocks: brandedBlocks, version: '1' },
        variables: t.variables,
        brandingProfileId,
        isRequired: t.isRequired,
        enabled: true,
        createdBy: parseInt(session.user.id, 10),
      };
    })
  ).returning();

  return NextResponse.json({ success: true, data: { created: created.length, templates: created } });
}
