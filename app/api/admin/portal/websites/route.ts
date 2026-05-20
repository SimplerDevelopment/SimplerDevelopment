import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { clientWebsites, clients, users, storeSettings } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

async function requireStaff() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const role = (session.user as { role?: string })?.role;
  if (role !== 'admin' && role !== 'employee') return null;
  return session;
}

export async function GET() {
  const session = await requireStaff();
  if (!session) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

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
    .orderBy(clientWebsites.createdAt);

  const data = rows.map(({ stripeByokAllowed, stripeMode, stripeSecretKeyEncrypted, storeSettingsId, ...rest }) => ({
    ...rest,
    storeSettings: {
      stripeByokAllowed: stripeByokAllowed ?? false,
      stripeMode: stripeMode ?? 'connect',
      stripeSecretKeyConfigured: !!stripeSecretKeyEncrypted,
      hasStoreSettingsRow: !!storeSettingsId,
    },
  }));

  return NextResponse.json({ success: true, data });
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
