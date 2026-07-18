import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { clientWebsites, clients, users, storeSettings } from '@/lib/db/schema';
import { eq, lt, and, or, desc } from 'drizzle-orm';

async function requireStaff() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const role = (session.user as { role?: string })?.role;
  if (role !== 'admin' && role !== 'employee') return null;
  return session;
}

// E2 perf — admin/websites previously loaded every client_websites row in one
// shot, ordered by createdAt. With the new `client_websites_created_idx` index
// the orderBy + limit fan-out is index-only. Pagination via keyset cursor
// keeps later pages flat as the table grows.
const PAGE_SIZE = 100;

export async function GET(req: Request) {
  const session = await requireStaff();
  if (!session) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const cursorCreatedAt = url.searchParams.get('cursorCreatedAt');
  const cursorId = url.searchParams.get('cursorId');
  const rawLimit = Number(url.searchParams.get('limit') ?? String(PAGE_SIZE));
  const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : PAGE_SIZE, 1), 200);

  const whereExpr = cursorCreatedAt && cursorId
    ? or(
        lt(clientWebsites.createdAt, new Date(cursorCreatedAt)),
        and(eq(clientWebsites.createdAt, new Date(cursorCreatedAt)), lt(clientWebsites.id, Number(cursorId))),
      )
    : undefined;

  const rows = await db
    .select({
      id: clientWebsites.id,
      clientId: clientWebsites.clientId,
      name: clientWebsites.name,
      domain: clientWebsites.domain,
      description: clientWebsites.description,
      active: clientWebsites.active,
      createdAt: clientWebsites.createdAt,
      updatedAt: clientWebsites.updatedAt,
      clientCompany: clients.company,
      clientUserName: users.name,
      clientUserEmail: users.email,
      // LEFT JOIN store_settings — may be null when tenant hasn't initialised store yet.
      stripeByokAllowed: storeSettings.stripeByokAllowed,
      stripeMode: storeSettings.stripeMode,
      stripeSecretKeyEncrypted: storeSettings.stripeSecretKeyEncrypted,
      storeSettingsId: storeSettings.id,
    })
    .from(clientWebsites)
    .innerJoin(clients, eq(clientWebsites.clientId, clients.id))
    .innerJoin(users, eq(clients.userId, users.id))
    .leftJoin(storeSettings, eq(storeSettings.websiteId, clientWebsites.id))
    .where(whereExpr)
    .orderBy(desc(clientWebsites.createdAt), desc(clientWebsites.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;

  const data = pageRows.map(({ stripeByokAllowed, stripeMode, stripeSecretKeyEncrypted, storeSettingsId, ...rest }) => ({
    ...rest,
    storeSettings: {
      stripeByokAllowed: stripeByokAllowed ?? false,
      stripeMode: stripeMode ?? 'connect',
      stripeSecretKeyConfigured: !!stripeSecretKeyEncrypted,
      hasStoreSettingsRow: !!storeSettingsId,
    },
  }));

  const last = pageRows[pageRows.length - 1];
  const nextCursor = hasMore && last
    ? { createdAt: last.createdAt.toISOString(), id: last.id }
    : null;

  return NextResponse.json({ success: true, data, nextCursor });
}

export async function POST(req: Request) {
  const session = await requireStaff();
  if (!session) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { clientId, name, domain, description } = body;

  if (!clientId || !name) {
    return NextResponse.json({ success: false, message: 'clientId and name are required' }, { status: 400 });
  }

  const [site] = await db.insert(clientWebsites).values({
    clientId: parseInt(clientId),
    name,
    domain: domain || null,
    description: description || null,
  }).returning();

  return NextResponse.json({ success: true, data: site });
}
