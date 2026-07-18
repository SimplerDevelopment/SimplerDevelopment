import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';
import { db } from '@/lib/db';
import { crmContacts } from '@/lib/db/schema';
import { and, eq, isNotNull, sql } from 'drizzle-orm';

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json(
      { success: false, message: 'Unauthorized' },
      { status: 401 }
    );

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client)
    return NextResponse.json(
      { success: false, message: 'Client not found' },
      { status: 404 }
    );

  const companyIdRaw = req.nextUrl.searchParams.get('companyId');
  const companyId = companyIdRaw ? parseInt(companyIdRaw, 10) : null;

  const conditions = [
    eq(crmContacts.clientId, client.id),
    isNotNull(crmContacts.title),
    sql`length(trim(${crmContacts.title})) > 0`,
  ];
  if (companyId && !Number.isNaN(companyId)) {
    conditions.push(eq(crmContacts.companyId, companyId));
  }

  const rows = await db
    .selectDistinct({ title: crmContacts.title })
    .from(crmContacts)
    .where(and(...conditions))
    .orderBy(crmContacts.title);

  const titles = rows
    .map((r) => r.title)
    .filter((t): t is string => !!t);

  return NextResponse.json({ success: true, data: titles });
}
