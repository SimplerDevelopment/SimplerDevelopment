import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { emailTemplates } from '@/lib/db/schema';
import { eq, or, desc } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';

export async function GET() {
  const authResult = await authorizePortal({ action: 'read', requireService: 'email' });
  if (isAuthError(authResult)) return authResult.response;

  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false }, { status: 401 });
  const client = await getPortalClient(parseInt(session.user.id, 10));
  if (!client) return NextResponse.json({ success: false }, { status: 404 });

  const templates = await db.select()
    .from(emailTemplates)
    .where(or(eq(emailTemplates.clientId, client.id), eq(emailTemplates.isGlobal, true)))
    .orderBy(desc(emailTemplates.updatedAt));

  return NextResponse.json({ success: true, data: templates });
}

export async function POST(req: Request) {
  const authResult = await authorizePortal({ action: 'write', requireService: 'email' });
  if (isAuthError(authResult)) return authResult.response;

  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false }, { status: 401 });
  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return NextResponse.json({ success: false }, { status: 404 });

  const { name, description, category, subject, htmlContent } = await req.json();
  if (!name?.trim() || !htmlContent?.trim()) {
    return NextResponse.json({ success: false, message: 'name and htmlContent are required' }, { status: 400 });
  }

  const [template] = await db.insert(emailTemplates).values({
    clientId: client.id,
    name: name.trim(),
    description: description?.trim() || null,
    category: category || 'custom',
    subject: subject?.trim() || null,
    htmlContent: htmlContent.trim(),
    createdBy: userId,
  }).returning();

  return NextResponse.json({ success: true, data: template }, { status: 201 });
}
