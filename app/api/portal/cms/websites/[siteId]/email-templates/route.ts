import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { websiteEmailTemplates, clientWebsites, brandingProfiles, clients } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { resolveClientSite } from '@/lib/portal-client';
import { renderBlocksToEmailHtml } from '@/lib/email';
import { getEventDefinition } from '@/lib/email/website-email-events';
import { getDefaultTemplates } from '@/lib/email/default-email-templates';
import { applyBrandingToBlocks, brandingProfileToEmailBranding } from '@/lib/email/apply-branding-to-blocks';

export async function GET(_req: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { siteId } = await params;
  const site = await resolveClientSite(parseInt(session.user.id, 10), parseInt(siteId));
  if (!site) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const templates = await db
    .select()
    .from(websiteEmailTemplates)
    .where(eq(websiteEmailTemplates.websiteId, site.id))
    .orderBy(websiteEmailTemplates.event);

  return NextResponse.json({ success: true, data: templates });
}

export async function POST(req: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { siteId } = await params;
  const site = await resolveClientSite(parseInt(session.user.id, 10), parseInt(siteId));
  if (!site) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const body = await req.json();
  const { event, name, subject, description, htmlContent, blockContent, brandingProfileId: explicitProfileId, enabled } = body;

  if (!event || !name || !subject) {
    return NextResponse.json({ success: false, message: 'event, name, and subject are required' }, { status: 400 });
  }

  const eventDef = getEventDefinition(event);
  const variables = eventDef?.variables ?? [];

  // If no blockContent provided but event has a default template, use it
  let finalBlocks = blockContent?.blocks ?? null;
  if (!finalBlocks && !htmlContent) {
    const defaults = getDefaultTemplates();
    const defaultTpl = defaults.find(d => d.event === event);
    if (defaultTpl?.blocks.length) {
      finalBlocks = defaultTpl.blocks;
    }
  }

  // Resolve branding profile: explicit > website > client default
  let brandingProfileId = explicitProfileId ?? null;
  let emailBranding = null;

  if (!brandingProfileId) {
    const [siteRow] = await db.select({
      brandingProfileId: clientWebsites.brandingProfileId,
      clientId: clientWebsites.clientId,
    }).from(clientWebsites).where(eq(clientWebsites.id, site.id)).limit(1);

    if (siteRow?.brandingProfileId) {
      brandingProfileId = siteRow.brandingProfileId;
    } else if (siteRow?.clientId) {
      const [defaultProfile] = await db.select({ id: brandingProfiles.id })
        .from(brandingProfiles)
        .where(eq(brandingProfiles.clientId, siteRow.clientId))
        .limit(1);
      if (defaultProfile) brandingProfileId = defaultProfile.id;
    }
  }

  if (brandingProfileId) {
    const [profile] = await db.select().from(brandingProfiles)
      .where(eq(brandingProfiles.id, brandingProfileId)).limit(1);
    if (profile) {
      let companyName: string | undefined;
      const [siteRow] = await db.select({ clientId: clientWebsites.clientId })
        .from(clientWebsites).where(eq(clientWebsites.id, site.id)).limit(1);
      if (siteRow?.clientId) {
        const [client] = await db.select({ company: clients.company })
          .from(clients).where(eq(clients.id, siteRow.clientId)).limit(1);
        companyName = client?.company ?? undefined;
      }
      emailBranding = brandingProfileToEmailBranding(profile, companyName);
    }
  }

  // Apply branding to blocks
  let brandedBlocks = finalBlocks;
  if (finalBlocks && emailBranding) {
    brandedBlocks = applyBrandingToBlocks(finalBlocks, emailBranding);
  }

  // Render HTML
  let finalHtml = htmlContent ?? '';
  if (brandedBlocks?.length) {
    finalHtml = renderBlocksToEmailHtml(brandedBlocks);
  }

  const [template] = await db.insert(websiteEmailTemplates).values({
    websiteId: site.id,
    event,
    name,
    subject,
    description: description ?? null,
    htmlContent: finalHtml,
    blockContent: brandedBlocks ? { blocks: brandedBlocks, version: '1' } : null,
    variables,
    brandingProfileId,
    enabled: enabled ?? true,
    isRequired: eventDef?.isRequired ?? false,
    createdBy: parseInt(session.user.id, 10),
  }).returning();

  return NextResponse.json({ success: true, data: template }, { status: 201 });
}
