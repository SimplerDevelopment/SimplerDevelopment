import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';
import { db } from '@/lib/db';
import { crmProposalTemplates } from '@/lib/db/schema';
import { and, eq, desc } from 'drizzle-orm';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client)
    return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  const templates = await db
    .select()
    .from(crmProposalTemplates)
    .where(eq(crmProposalTemplates.clientId, client.id))
    .orderBy(desc(crmProposalTemplates.updatedAt));

  return NextResponse.json({ success: true, data: templates });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client)
    return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  const body = await req.json();

  if (!body.name?.trim()) {
    return NextResponse.json(
      { success: false, message: 'Template name is required' },
      { status: 400 }
    );
  }

  const [template] = await db
    .insert(crmProposalTemplates)
    .values({
      clientId: client.id,
      name: body.name.trim(),
      description: body.description?.trim() || null,
      sections: body.sections || [],
      lineItems: body.lineItems || [],
      fees: body.fees || [],
      accentColor: body.accentColor || '#2563eb',
      footerText: body.footerText?.trim() || null,
    })
    .returning();

  return NextResponse.json({ success: true, data: template }, { status: 201 });
}
