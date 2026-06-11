import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { clients, clientApiKeys } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getClientEntitlements } from '@/lib/billing/entitlements';
import { requiredByokProviders, allByokProviders } from '@/lib/billing/domain-catalog';

/**
 * Admin billing-mode endpoint.
 *
 * GET  — return the current billingMode + BYOK provider status.
 * POST — set billingMode and return the same payload.
 *
 * billingMode values: 'agency' | 'saas' | 'byok'
 */

const VALID_MODES = ['agency', 'saas', 'byok'] as const;
type BillingModeValue = typeof VALID_MODES[number];

async function requireStaff() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const role = (session.user as { role?: string })?.role;
  if (role !== 'admin' && role !== 'employee') return null;
  return session;
}

async function buildPayload(clientId: number) {
  const [clientRow] = await db
    .select({ billingMode: clients.billingMode, brainTrialUntil: clients.brainTrialUntil })
    .from(clients)
    .where(eq(clients.id, clientId))
    .limit(1);

  if (!clientRow) return null;

  const { billingMode } = clientRow;

  const entitlements = await getClientEntitlements(clientId, clientRow);
  const { domains, gatingBypassed } = entitlements;

  const requiredProviders = gatingBypassed
    ? allByokProviders()
    : requiredByokProviders([...domains]);

  const connectedRows = await db
    .selectDistinct({ provider: clientApiKeys.provider })
    .from(clientApiKeys)
    .where(eq(clientApiKeys.clientId, clientId));

  const connectedProviders = connectedRows.map((r) => r.provider);
  const missingProviders = requiredProviders.filter((p) => !connectedProviders.includes(p));

  return {
    billingMode,
    byok: { requiredProviders, connectedProviders, missingProviders },
  };
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!await requireStaff()) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const clientId = parseInt(id, 10);
  if (!Number.isFinite(clientId)) {
    return NextResponse.json({ success: false, message: 'Invalid client id' }, { status: 400 });
  }

  const data = await buildPayload(clientId);
  if (!data) {
    return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });
  }

  return NextResponse.json({ success: true, data });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!await requireStaff()) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const clientId = parseInt(id, 10);
  if (!Number.isFinite(clientId)) {
    return NextResponse.json({ success: false, message: 'Invalid client id' }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const billingMode = (body as { billingMode?: unknown }).billingMode;

  if (!billingMode || !VALID_MODES.includes(billingMode as BillingModeValue)) {
    return NextResponse.json({
      success: false,
      message: `billingMode must be one of: ${VALID_MODES.join(', ')}`,
    }, { status: 400 });
  }

  // BYOK inversion: a client can only enter byok mode (which waives the
  // metered-AI markup) when on a BYOK-eligible tier — Scale, the all-modules
  // bundle, or agency bypass. This is the single gate: the waiver logic keys
  // off billingMode === 'byok', so restricting entry restricts the waiver.
  if (billingMode === 'byok') {
    const ent = await getClientEntitlements(clientId);
    if (!ent.byokEligible) {
      return NextResponse.json({
        success: false,
        message: 'BYOK is a Scale-tier feature. Move this client to the Scale tier (or the all-modules bundle) before enabling BYOK.',
      }, { status: 409 });
    }
  }

  await db
    .update(clients)
    .set({ billingMode: billingMode as string, updatedAt: new Date() })
    .where(eq(clients.id, clientId));

  const data = await buildPayload(clientId);
  if (!data) {
    return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });
  }

  return NextResponse.json({ success: true, data });
}
