import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { clientWebsites, storeSettings } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

async function requireStaff() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const role = (session.user as { role?: string })?.role;
  if (role !== 'admin' && role !== 'employee') return null;
  return session;
}

async function loadStoreSettings(websiteId: number) {
  const [row] = await db
    .select()
    .from(storeSettings)
    .where(eq(storeSettings.websiteId, websiteId))
    .limit(1);
  return row ?? null;
}

function projectStoreSettings(row: typeof storeSettings.$inferSelect | null) {
  return {
    stripeByokAllowed: row?.stripeByokAllowed ?? false,
    stripeMode: row?.stripeMode ?? 'connect',
    stripeSecretKeyConfigured: !!row?.stripeSecretKeyEncrypted,
    stripeOnboardingComplete: row?.stripeOnboardingComplete ?? false,
    hasStoreSettingsRow: !!row,
  };
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireStaff();
  if (!session) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const websiteId = parseInt(id);
  const [site] = await db.select().from(clientWebsites).where(eq(clientWebsites.id, websiteId)).limit(1);
  if (!site) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  const settings = await loadStoreSettings(websiteId);

  return NextResponse.json({
    success: true,
    data: {
      ...site,
      storeSettings: projectStoreSettings(settings),
    },
  });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireStaff();
  if (!session) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const websiteId = parseInt(id);
  const body = await req.json();
  const { name, domain, description, active, stripeByokAllowed } = body as {
    name?: string;
    domain?: string | null;
    description?: string | null;
    active?: boolean;
    stripeByokAllowed?: boolean;
  };

  // Update the client_websites row only if any of its own fields were sent.
  let site: typeof clientWebsites.$inferSelect | undefined;
  const websiteFieldsTouched =
    name !== undefined || domain !== undefined || description !== undefined || active !== undefined;

  if (websiteFieldsTouched) {
    [site] = await db
      .update(clientWebsites)
      .set({
        ...(name !== undefined && { name }),
        ...(domain !== undefined && { domain: domain || null }),
        ...(description !== undefined && { description: description || null }),
        ...(active !== undefined && { active }),
        updatedAt: new Date(),
      })
      .where(eq(clientWebsites.id, websiteId))
      .returning();
  } else {
    [site] = await db.select().from(clientWebsites).where(eq(clientWebsites.id, websiteId)).limit(1);
  }

  if (!site) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });

  // Handle stripeByokAllowed admin gate — writes to store_settings, not client_websites.
  if (stripeByokAllowed !== undefined) {
    const existing = await loadStoreSettings(websiteId);
    const oldValue = existing?.stripeByokAllowed ?? false;
    const newValue = !!stripeByokAllowed;

    // Cascade: when revoking BYOK privilege, defensively force store back to Connect
    // so a tenant cannot be left in a half-revoked BYOK-mode state.
    const cascadeToConnect = oldValue === true && newValue === false;

    if (existing) {
      await db
        .update(storeSettings)
        .set({
          stripeByokAllowed: newValue,
          ...(cascadeToConnect && { stripeMode: 'connect' }),
          updatedAt: new Date(),
        })
        .where(eq(storeSettings.websiteId, websiteId));
    } else {
      // No store_settings row yet — insert a minimal row. Other columns rely on schema defaults.
      await db.insert(storeSettings).values({
        websiteId,
        stripeByokAllowed: newValue,
        // stripeMode defaults to 'connect' in schema, no override needed on insert.
      });
    }

    if (cascadeToConnect) {
      console.warn(
        `[admin] stripeByokAllowed revoked, cascaded stripeMode->connect: websiteId=${websiteId} by user=${session.user.email}`,
      );
    }
    console.info(
      `[admin] stripeByokAllowed flipped: websiteId=${websiteId} by user=${session.user.email} from=${oldValue} to=${newValue}`,
    );
  }

  const settings = await loadStoreSettings(websiteId);

  return NextResponse.json({
    success: true,
    data: {
      ...site,
      storeSettings: projectStoreSettings(settings),
    },
  });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireStaff();
  if (!session) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  await db.delete(clientWebsites).where(eq(clientWebsites.id, parseInt(id)));
  return NextResponse.json({ success: true });
}
