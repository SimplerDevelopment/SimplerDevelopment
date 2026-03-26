import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';
import { db } from '@/lib/db';
import { crmProposalTemplates } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';

async function getAuthedClient() {
  const session = await auth();
  if (!session?.user?.id)
    return { error: NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 }) };
  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client)
    return { error: NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 }) };
  return { client, userId };
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const result = await getAuthedClient();
  if ('error' in result) return result.error;
  const { client } = result;

  const templateId = parseInt(id, 10);
  if (isNaN(templateId))
    return NextResponse.json({ success: false, message: 'Invalid ID' }, { status: 400 });

  const [existing] = await db
    .select({ id: crmProposalTemplates.id })
    .from(crmProposalTemplates)
    .where(and(eq(crmProposalTemplates.id, templateId), eq(crmProposalTemplates.clientId, client.id)));

  if (!existing)
    return NextResponse.json({ success: false, message: 'Template not found' }, { status: 404 });

  const body = await req.json();

  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (body.name !== undefined) updateData.name = body.name.trim();
  if (body.description !== undefined) updateData.description = body.description?.trim() || null;
  if (body.sections !== undefined) updateData.sections = body.sections;
  if (body.lineItems !== undefined) updateData.lineItems = body.lineItems;
  if (body.fees !== undefined) updateData.fees = body.fees;
  if (body.accentColor !== undefined) updateData.accentColor = body.accentColor;
  if (body.footerText !== undefined) updateData.footerText = body.footerText?.trim() || null;

  const [updated] = await db
    .update(crmProposalTemplates)
    .set(updateData)
    .where(eq(crmProposalTemplates.id, templateId))
    .returning();

  return NextResponse.json({ success: true, data: updated });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const result = await getAuthedClient();
  if ('error' in result) return result.error;
  const { client } = result;

  const templateId = parseInt(id, 10);
  if (isNaN(templateId))
    return NextResponse.json({ success: false, message: 'Invalid ID' }, { status: 400 });

  const [deleted] = await db
    .delete(crmProposalTemplates)
    .where(and(eq(crmProposalTemplates.id, templateId), eq(crmProposalTemplates.clientId, client.id)))
    .returning();

  if (!deleted)
    return NextResponse.json({ success: false, message: 'Template not found' }, { status: 404 });

  return NextResponse.json({ success: true, data: deleted });
}
