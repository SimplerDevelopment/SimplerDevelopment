import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { emailCampaigns, emailLists } from '@/lib/db/schema';
import { eq, sql, and } from 'drizzle-orm';

async function requireStaff() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const role = (session.user as { role?: string })?.role;
  if (role !== 'admin' && role !== 'employee') return null;
  return session;
}

export async function GET(req: Request) {
  const session = await requireStaff();
  if (!session) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const clientId = searchParams.get('clientId');

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
    .where(clientId ? eq(emailCampaigns.clientId, parseInt(clientId)) : undefined)
    .orderBy(sql`${emailCampaigns.createdAt} desc`);

  return NextResponse.json({ success: true, data: campaigns });
}

export async function POST(req: Request) {
  const session = await requireStaff();
  if (!session) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { name, subject, previewText, fromName, fromEmail, replyTo, listId, clientId, htmlContent } = body;

  if (!name?.trim() || !subject?.trim() || !fromName?.trim() || !fromEmail?.trim() || !listId || !htmlContent?.trim()) {
    return NextResponse.json({ success: false, message: 'name, subject, fromName, fromEmail, listId, and htmlContent are required' }, { status: 400 });
  }

  const userId = parseInt((session.user as { id: string }).id);

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
      clientId: clientId ? parseInt(clientId) : null,
      htmlContent: htmlContent.trim(),
      createdBy: userId,
    })
    .returning();

  return NextResponse.json({ success: true, data: campaign }, { status: 201 });
}
