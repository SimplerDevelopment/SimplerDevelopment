// Portal CRUD for embeddable email signup forms (list + create).
import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { emailSignupForms, emailLists } from '@/lib/db/schema';
import { and, eq, sql } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';

async function requireClient() {
  const session = await auth();
  if (!session?.user?.id) return null;
  return getPortalClient(parseInt(session.user.id, 10));
}

export async function GET() {
  const authResult = await authorizePortal({ action: 'read', requireService: 'email' });
  if (isAuthError(authResult)) return authResult.response;
  const client = await requireClient();
  if (!client) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const forms = await db
    .select()
    .from(emailSignupForms)
    .where(eq(emailSignupForms.clientId, client.id))
    .orderBy(sql`${emailSignupForms.createdAt} desc`);
  return NextResponse.json({ success: true, data: forms });
}

export async function POST(req: Request) {
  const authResult = await authorizePortal({ action: 'write', requireService: 'email' });
  if (isAuthError(authResult)) return authResult.response;
  const client = await requireClient();
  if (!client) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const listId = Number(body.listId);
  if (!name) return NextResponse.json({ success: false, message: 'name is required' }, { status: 400 });
  if (!Number.isInteger(listId)) return NextResponse.json({ success: false, message: 'listId is required' }, { status: 400 });

  // The list must belong to this client (or be a global list).
  const [list] = await db.select({ id: emailLists.id, clientId: emailLists.clientId }).from(emailLists).where(eq(emailLists.id, listId)).limit(1);
  if (!list || (list.clientId !== null && list.clientId !== client.id)) {
    return NextResponse.json({ success: false, message: 'List not found' }, { status: 404 });
  }

  const [form] = await db
    .insert(emailSignupForms)
    .values({
      clientId: client.id,
      listId,
      name,
      embedKey: randomBytes(24).toString('hex'),
      askName: body.askName === true,
      redirectUrl: typeof body.redirectUrl === 'string' ? body.redirectUrl : null,
    })
    .returning();

  return NextResponse.json({ success: true, data: form }, { status: 201 });
}
