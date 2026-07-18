import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { emailLists } from '@/lib/db/schema';
import { eq, sql } from 'drizzle-orm';
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

  // Was: leftJoin email_subscribers (full table) + groupBy email_lists.id —
  // that scanned every row in email_subscribers (39k+) per request even when
  // the client owns 3 lists. Scalar subselect uses the new
  // email_subscribers (list_id, status) index and returns active-only counts
  // (was: counted unsubscribed/bounced too — minor behaviour change, but
  // every consumer of `subscriberCount` displays it as "active subscribers").
  //
  // NOTE per MEMORY feedback_drizzle_correlated_subqueries: outer table refs
  // in a `sql` literal must be hard-coded by string ("email_lists"."id") —
  // `${emailLists.id}` emits an UNQUALIFIED "id" which silently joins to the
  // inner email_subscribers.id, always returning 0.
  const lists = await db
    .select({
      id: emailLists.id,
      name: emailLists.name,
      description: emailLists.description,
      createdAt: emailLists.createdAt,
      subscriberCount: sql<number>`(
        SELECT count(*)::int
        FROM "email_subscribers"
        WHERE "email_subscribers"."list_id" = "email_lists"."id"
          AND "email_subscribers"."status" = 'active'
      )`.as('subscriber_count'),
    })
    .from(emailLists)
    .where(eq(emailLists.clientId, client.id))
    .orderBy(sql`${emailLists.createdAt} desc`);

  return NextResponse.json({ success: true, data: lists });
}

export async function POST(req: Request) {
  // Service access check
  const authResult = await authorizePortal({ action: 'write', requireService: 'email' });
  if (isAuthError(authResult)) return authResult.response;

  const client = await requireClient();
  if (!client) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { name, description } = body;
  if (!name?.trim()) return NextResponse.json({ success: false, message: 'Name is required' }, { status: 400 });

  const [list] = await db
    .insert(emailLists)
    .values({ name: name.trim(), description: description?.trim() || null, clientId: client.id })
    .returning();

  return NextResponse.json({ success: true, data: list }, { status: 201 });
}
