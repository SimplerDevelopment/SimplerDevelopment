import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { emailCampaigns, emailLists, emailSubscribers } from '@/lib/db/schema';
import { eq, and, or, ilike, desc, sql, type SQL } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';

async function requireClient() {
  const session = await auth();
  if (!session?.user?.id) return null;
  return getPortalClient(parseInt(session.user.id, 10));
}

async function ownsList(client: { id: number }, listId: number) {
  const [list] = await db
    .select({ id: emailLists.id })
    .from(emailLists)
    .where(and(eq(emailLists.id, listId), eq(emailLists.clientId, client.id)))
    .limit(1);
  return list ?? null;
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  // Service access check
  const authResult = await authorizePortal({ action: 'read', requireService: 'email' });
  if (isAuthError(authResult)) return authResult.response;

  const client = await requireClient();
  if (!client) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const listId = parseInt(id);
  if (!await ownsList(client, listId)) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  // ── Pagination + filtering ────────────────────────────────────────────────
  // 39k+ rows can live on a single list; never return the whole table.
  // Response shape is additive: legacy callers that read `data` get the
  // page array (was: full array). New callers also get `total`, `page`,
  // and `limit`. The page-1/limit-50 default keeps most existing UI happy.
  const url = new URL(req.url);
  const rawPage = parseInt(url.searchParams.get('page') ?? '1', 10);
  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
  const rawLimit = parseInt(url.searchParams.get('limit') ?? '50', 10);
  const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : 50, 1), 200);
  const search = url.searchParams.get('search')?.trim() ?? '';
  const status = url.searchParams.get('status')?.trim() ?? '';

  const filters: SQL[] = [eq(emailSubscribers.listId, listId)];
  if (search) {
    const pattern = `%${search}%`;
    const orFilter = or(ilike(emailSubscribers.email, pattern), ilike(emailSubscribers.name, pattern));
    if (orFilter) filters.push(orFilter);
  }
  if (status) filters.push(eq(emailSubscribers.status, status));
  const whereClause = filters.length === 1 ? filters[0] : and(...filters);

  const [subscribers, totalRow] = await Promise.all([
    db
      .select({
        id: emailSubscribers.id,
        email: emailSubscribers.email,
        name: emailSubscribers.name,
        status: emailSubscribers.status,
        subscribedAt: emailSubscribers.subscribedAt,
      })
      .from(emailSubscribers)
      .where(whereClause)
      .orderBy(desc(emailSubscribers.subscribedAt))
      .limit(limit)
      .offset((page - 1) * limit),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(emailSubscribers)
      .where(whereClause),
  ]);

  const total = totalRow[0]?.count ?? 0;
  return NextResponse.json({ success: true, data: subscribers, total, page, limit });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  // Service access check
  const authResult = await authorizePortal({ action: 'write', requireService: 'email' });
  if (isAuthError(authResult)) return authResult.response;

  const client = await requireClient();
  if (!client) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const listId = parseInt(id);
  if (!await ownsList(client, listId)) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const { name, description } = await req.json();
  if (!name?.trim()) return NextResponse.json({ success: false, message: 'Name is required' }, { status: 400 });

  const [updated] = await db
    .update(emailLists)
    .set({ name: name.trim(), description: description?.trim() || null, updatedAt: new Date() })
    .where(eq(emailLists.id, listId))
    .returning();

  return NextResponse.json({ success: true, data: updated });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  // Service access check
  const authResult = await authorizePortal({ action: 'write', requireService: 'email' });
  if (isAuthError(authResult)) return authResult.response;

  const client = await requireClient();
  if (!client) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const listId = parseInt(id);
  if (!await ownsList(client, listId)) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  // emailCampaigns.listId is onDelete:'restrict' (lib/db/schema/email.ts), so a
  // list any campaign still points at raises Postgres 23503 instead of
  // cascading. Attempt-then-handle rather than pre-check: the happy path
  // shouldn't pay for a lookup that almost always finds nothing, and a
  // pre-check would still race a campaign created between the SELECT and the
  // DELETE. The blocking names are only worth fetching once we know there ARE
  // blockers — that message is the whole point of the 409, since "delete
  // failed" without naming what holds the list is unactionable.
  try {
    await db.delete(emailLists).where(eq(emailLists.id, listId));
  } catch (err) {
    if ((err as { code?: string }).code !== '23503') throw err;
    const blocking = await db
      .select({ name: emailCampaigns.name })
      .from(emailCampaigns)
      .where(eq(emailCampaigns.listId, listId))
      .limit(10);
    const names = blocking.map((c) => c.name).join(', ');
    return NextResponse.json({
      success: false,
      message: names
        ? `Cannot delete: still used by ${blocking.length} campaign(s): ${names}`
        : 'Cannot delete: this list is still referenced by another record.',
    }, { status: 409 });
  }
  return NextResponse.json({ success: true });
}
