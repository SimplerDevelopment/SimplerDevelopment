// Portal: get / delete a single email signup form (tenant-scoped).
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { emailSignupForms } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';

async function requireClient() {
  const session = await auth();
  if (!session?.user?.id) return null;
  return getPortalClient(parseInt(session.user.id, 10));
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await authorizePortal({ action: 'read', requireService: 'email' });
  if (isAuthError(authResult)) return authResult.response;
  const client = await requireClient();
  if (!client) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const id = parseInt((await params).id, 10);
  const [form] = await db
    .select()
    .from(emailSignupForms)
    .where(and(eq(emailSignupForms.id, id), eq(emailSignupForms.clientId, client.id)))
    .limit(1);
  if (!form) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  return NextResponse.json({ success: true, data: form });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await authorizePortal({ action: 'write', requireService: 'email' });
  if (isAuthError(authResult)) return authResult.response;
  const client = await requireClient();
  if (!client) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const id = parseInt((await params).id, 10);
  const deleted = await db
    .delete(emailSignupForms)
    .where(and(eq(emailSignupForms.id, id), eq(emailSignupForms.clientId, client.id)))
    .returning({ id: emailSignupForms.id });
  if (deleted.length === 0) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
  return NextResponse.json({ success: true });
}
