import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { emailCampaigns, emailLists } from '@/lib/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';

async function requireClient() {
  const session = await auth();
  if (!session?.user?.id) return null;
  return getPortalClient(parseInt(session.user.id, 10));
}

export async function GET() {
  // Service access check
  const authResult = await authorizePortal({ action: 'read', requireService: 'email' });
  if (isAuthError(authResult)) return authResult.response;

  const client = await requireClient();
  if (!client) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const campaigns = await db
    .select({
      id: emailCampaigns.id,
      name: emailCampaigns.name,
      subject: emailCampaigns.subject,
      fromName: emailCampaigns.fromName,
      fromEmail: emailCampaigns.fromEmail,
      status: emailCampaigns.status,
      scheduledAt: emailCampaigns.scheduledAt,
      sentAt: emailCampaigns.sentAt,
      totalRecipients: emailCampaigns.totalRecipients,
      totalSent: emailCampaigns.totalSent,
      totalOpened: emailCampaigns.totalOpened,
      totalClicked: emailCampaigns.totalClicked,
      totalBounced: emailCampaigns.totalBounced,
      createdAt: emailCampaigns.createdAt,
      listName: emailLists.name,
    })
    .from(emailCampaigns)
    .leftJoin(emailLists, eq(emailCampaigns.listId, emailLists.id))
    .where(eq(emailCampaigns.clientId, client.id))
    .orderBy(sql`${emailCampaigns.createdAt} desc`);

  return NextResponse.json({ success: true, data: campaigns });
}

export async function POST(req: Request) {
  // Service access check
  const authResult = await authorizePortal({ action: 'write', requireService: 'email' });
  if (isAuthError(authResult)) return authResult.response;

  const client = await requireClient();
  if (!client) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { name, subject, previewText, fromName, fromEmail, replyTo, listId, htmlContent } = body;

  if (!name?.trim() || !subject?.trim() || !fromName?.trim() || !fromEmail?.trim() || !listId || !htmlContent?.trim()) {
    return NextResponse.json({ success: false, message: 'name, subject, fromName, fromEmail, listId, and htmlContent are required' }, { status: 400 });
  }

  // Verify the list belongs to this client
  const [list] = await db
    .select({ id: emailLists.id })
    .from(emailLists)
    .where(and(eq(emailLists.id, parseInt(listId)), eq(emailLists.clientId, client.id)))
    .limit(1);

  if (!list) return NextResponse.json({ success: false, message: 'List not found' }, { status: 404 });

  const [campaign] = await db
    .insert(emailCampaigns)
    .values({
      name: name.trim(),
      subject: subject.trim(),
      previewText: previewText?.trim() || null,
      fromName: fromName.trim(),
      fromEmail: fromEmail.trim(),
      replyTo: replyTo?.trim() || null,
      listId: parseInt(listId),
      clientId: client.id,
      htmlContent: htmlContent.trim(),
    })
    .returning();

  return NextResponse.json({ success: true, data: campaign }, { status: 201 });
}
