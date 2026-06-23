import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { websiteEmailTemplates } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { resolveClientSite } from '@/lib/portal-client';
import { renderBlocksToEmailHtml } from '@/lib/email';

export async function GET(_req: Request, { params }: { params: Promise<{ siteId: string; templateId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { siteId, templateId } = await params;
  const site = await resolveClientSite(parseInt(session.user.id, 10), parseInt(siteId));
  if (!site) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const [template] = await db
    .select()
    .from(websiteEmailTemplates)
    .where(and(
      eq(websiteEmailTemplates.id, parseInt(templateId)),
      eq(websiteEmailTemplates.websiteId, site.id),
    ))
    .limit(1);

  if (!template) return NextResponse.json({ success: false, message: 'Template not found' }, { status: 404 });
  return NextResponse.json({ success: true, data: template });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ siteId: string; templateId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { siteId, templateId } = await params;
  const site = await resolveClientSite(parseInt(session.user.id, 10), parseInt(siteId));
  if (!site) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const body = await req.json();
  const updates: Record<string, unknown> = { updatedAt: new Date() };

  if (body.name !== undefined) updates.name = body.name;
  if (body.subject !== undefined) updates.subject = body.subject;
  if (body.description !== undefined) updates.description = body.description;
  if (body.enabled !== undefined) updates.enabled = body.enabled;
  if (body.brandingProfileId !== undefined) updates.brandingProfileId = body.brandingProfileId;

  if (body.blockContent !== undefined) {
    updates.blockContent = body.blockContent;
    if (body.blockContent?.blocks) {
      updates.htmlContent = renderBlocksToEmailHtml(body.blockContent.blocks);
    }
  } else if (body.htmlContent !== undefined) {
    updates.htmlContent = body.htmlContent;
  }

  const [updated] = await db.update(websiteEmailTemplates)
    .set(updates)
    .where(and(
      eq(websiteEmailTemplates.id, parseInt(templateId)),
      eq(websiteEmailTemplates.websiteId, site.id),
    ))
    .returning();

  if (!updated) return NextResponse.json({ success: false, message: 'Template not found' }, { status: 404 });
  return NextResponse.json({ success: true, data: updated });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ siteId: string; templateId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { siteId, templateId } = await params;
  const site = await resolveClientSite(parseInt(session.user.id, 10), parseInt(siteId));
  if (!site) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  // Check if required — can't delete required templates
  const [template] = await db.select({ isRequired: websiteEmailTemplates.isRequired })
    .from(websiteEmailTemplates)
    .where(and(
      eq(websiteEmailTemplates.id, parseInt(templateId)),
      eq(websiteEmailTemplates.websiteId, site.id),
    ))
    .limit(1);

  if (!template) return NextResponse.json({ success: false, message: 'Template not found' }, { status: 404 });
  if (template.isRequired) return NextResponse.json({ success: false, message: 'Cannot delete a required template. You can disable it instead.' }, { status: 400 });

  await db.delete(websiteEmailTemplates).where(and(
    eq(websiteEmailTemplates.id, parseInt(templateId)),
    eq(websiteEmailTemplates.websiteId, site.id),
  ));

  return NextResponse.json({ success: true });
}
