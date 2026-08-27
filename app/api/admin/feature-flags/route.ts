// Admin per-client feature-flags matrix (PUX-135).
//
// WHICH flags EXIST is code (lib/feature-flags.ts — FLAGS). This route only
// reads/writes MEMBERSHIP: which clients have a given flag, stored in
// clients.featureFlags (jsonb string[]). GET renders the matrix the admin
// page draws from FLAGS, so an unknown flag key can never be requested from
// the UI. POST still validates isFlagKey() server-side as a second gate.
//
// Dogfood client: 104 (SimplerDevelopment) — flag it first, impersonate, and
// confirm before flagging beta clients.
//
// Staff-only (requireStaffSession), no tenant scoping — this is a global
// admin panel, same shape as .../portal/clients/[id]/billing/route.ts.

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { clients } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { requireStaffSession } from '@/lib/admin/auth';
import { loadFeatureFlagMatrix } from '@/lib/admin/feature-flags';
import { isFlagKey } from '@/lib/feature-flags';

export const runtime = 'nodejs';

export async function GET() {
  if (!await requireStaffSession()) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  const data = await loadFeatureFlagMatrix();
  return NextResponse.json({ success: true, data });
}

export async function POST(req: Request) {
  const session = await requireStaffSession();
  if (!session) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  let body: { clientId?: unknown; flag?: unknown; enabled?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: 'invalid_json' }, { status: 400 });
  }

  const clientId = Number(body.clientId);
  if (!Number.isInteger(clientId)) {
    return NextResponse.json({ success: false, error: 'invalid_client_id' }, { status: 400 });
  }
  const flag = body.flag;
  if (!isFlagKey(flag)) {
    return NextResponse.json({ success: false, error: 'unknown_flag' }, { status: 400 });
  }
  if (typeof body.enabled !== 'boolean') {
    return NextResponse.json({ success: false, error: 'invalid_enabled' }, { status: 400 });
  }
  const enabled = body.enabled;

  const [client] = await db
    .select({ id: clients.id, featureFlags: clients.featureFlags })
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);
  if (!client) {
    return NextResponse.json({ success: false, error: 'client_not_found' }, { status: 404 });
  }

  const current = client.featureFlags ?? [];
  // ponytail: read-modify-write is fine here — this is a staff toggle in the
  // admin UI, not a concurrent-writer path. Upgrade to a jsonb `||`/`-` SQL
  // expression (append/remove) if that ever changes.
  const next = enabled
    ? (current.includes(flag) ? current : [...current, flag])
    : current.filter((k) => k !== flag);

  await db.update(clients).set({ featureFlags: next, updatedAt: new Date() }).where(eq(clients.id, clientId));

  return NextResponse.json({ success: true, data: { clientId, flag, enabled, featureFlags: next } });
}
