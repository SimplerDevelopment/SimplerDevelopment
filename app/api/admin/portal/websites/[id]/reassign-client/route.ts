import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { hash } from 'bcryptjs';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { clients, clientMembers, clientWebsites, brandingProfiles, media, users } from '@/lib/db/schema';
import { and, eq, ne } from 'drizzle-orm';

// Staff-only: move a website to a different client — or to a brand-new client
// created in the same transaction. Exists because sites are sometimes built
// under the agency's own client and later need to become a real tenant (the
// integratouch split was done by hand-SQL; founddelivery motivated making it
// an admin capability). Moves the tenant-scoped satellites that would
// otherwise dangle: the site's branding profile (only when no other site
// shares it) and its media-library rows. Posts, navigation, and surveys key
// on websiteId and follow the site automatically.

async function requireStaff() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const role = (session.user as { role?: string })?.role;
  if (role !== 'admin' && role !== 'employee') return null;
  return session;
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireStaff();
  if (!session) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const websiteId = parseInt(id);
  if (Number.isNaN(websiteId)) {
    return NextResponse.json({ success: false, message: 'Invalid website id' }, { status: 400 });
  }

  const body = (await req.json()) as {
    targetClientId?: number;
    createClient?: { company: string; ownerUserId: number };
  };
  const hasTarget = typeof body.targetClientId === 'number';
  const hasCreate = !!body.createClient?.company && typeof body.createClient?.ownerUserId === 'number';
  if (hasTarget === hasCreate) {
    return NextResponse.json(
      { success: false, message: 'Provide exactly one of targetClientId or createClient' },
      { status: 400 }
    );
  }

  const [site] = await db.select().from(clientWebsites).where(eq(clientWebsites.id, websiteId)).limit(1);
  if (!site) return NextResponse.json({ success: false, message: 'Website not found' }, { status: 404 });

  if (hasCreate) {
    const [owner] = await db.select({ id: users.id }).from(users).where(eq(users.id, body.createClient!.ownerUserId)).limit(1);
    if (!owner) return NextResponse.json({ success: false, message: 'ownerUserId does not exist' }, { status: 400 });
  } else {
    const [target] = await db.select({ id: clients.id }).from(clients).where(eq(clients.id, body.targetClientId!)).limit(1);
    if (!target) return NextResponse.json({ success: false, message: 'targetClientId does not exist' }, { status: 400 });
    if (target.id === site.clientId) {
      return NextResponse.json({ success: false, message: 'Website already belongs to that client' }, { status: 400 });
    }
  }

  let result;
  try {
    result = await runReassign();
  } catch (err) {
    const status = (err as { status?: number })?.status;
    if (status) {
      return NextResponse.json({ success: false, message: (err as Error).message }, { status });
    }
    console.error('reassign-client failed:', err);
    return NextResponse.json({ success: false, message: 'Reassignment failed' }, { status: 500 });
  }

  async function runReassign() {
    return db.transaction(async (tx) => {
    let clientId: number;
    if (hasCreate) {
      // clients.user_id is UNIQUE (one client per user), so the requesting
      // owner usually can't fill it — they may already anchor another client.
      // Per the site-migration convention, each client gets a dedicated user
      // at {sitename}@simplerdevelopment.com; the REAL ownership lives in
      // client_members. Reuse the derived user if it already exists (and
      // isn't anchoring a client), otherwise mint it with an unusable random
      // password (login requires a reset).
      const slug = (site.subdomain || body.createClient!.company)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '')
        .slice(0, 60);
      const derivedEmail = `${slug}@simplerdevelopment.com`;
      const [existingUser] = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, derivedEmail))
        .limit(1);
      let anchorUserId: number;
      if (existingUser) {
        const [anchored] = await tx
          .select({ id: clients.id })
          .from(clients)
          .where(eq(clients.userId, existingUser.id))
          .limit(1);
        if (anchored) {
          throw Object.assign(new Error(`Derived user ${derivedEmail} already anchors client ${anchored.id}`), { status: 409 });
        }
        anchorUserId = existingUser.id;
      } else {
        const [minted] = await tx
          .insert(users)
          .values({
            name: body.createClient!.company,
            email: derivedEmail,
            password: await hash(randomBytes(24).toString('base64url'), 10),
            role: 'client',
            active: true,
          })
          .returning({ id: users.id });
        anchorUserId = minted.id;
      }
      const [created] = await tx
        .insert(clients)
        .values({
          userId: anchorUserId,
          company: body.createClient!.company,
          defaultWebsiteId: websiteId,
        })
        .returning({ id: clients.id });
      clientId = created.id;
      await tx.insert(clientMembers).values({
        clientId,
        userId: body.createClient!.ownerUserId,
        role: 'owner',
      });
    } else {
      clientId = body.targetClientId!;
    }

    await tx
      .update(clientWebsites)
      .set({ clientId, updatedAt: new Date() })
      .where(eq(clientWebsites.id, websiteId));

    // Branding profile: repoint only when this site is its sole consumer —
    // a shared profile stays with the old client so siblings keep rendering.
    let brandingMoved = false;
    if (site.brandingProfileId != null) {
      const [sharer] = await tx
        .select({ id: clientWebsites.id })
        .from(clientWebsites)
        .where(and(eq(clientWebsites.brandingProfileId, site.brandingProfileId), ne(clientWebsites.id, websiteId)))
        .limit(1);
      if (!sharer) {
        await tx
          .update(brandingProfiles)
          .set({ clientId, updatedAt: new Date() })
          .where(eq(brandingProfiles.id, site.brandingProfileId));
        brandingMoved = true;
      }
    }

    const movedMedia = await tx
      .update(media)
      .set({ clientId, updatedAt: new Date() })
      .where(eq(media.websiteId, websiteId))
      .returning({ id: media.id });

    return { clientId, brandingMoved, mediaMoved: movedMedia.length };
    });
  }

  return NextResponse.json({
    success: true,
    data: {
      websiteId,
      previousClientId: site.clientId,
      newClientId: result.clientId,
      createdClient: hasCreate,
      brandingProfileMoved: result.brandingMoved,
      mediaRowsMoved: result.mediaMoved,
    },
  });
}
