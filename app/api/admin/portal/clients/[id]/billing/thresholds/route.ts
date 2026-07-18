import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { usageThresholds } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { FEATURE_DOMAINS } from '@/lib/billing/domain-catalog';

// ── Auth ──────────────────────────────────────────────────────────────────────

async function requireStaff() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const role = (session.user as { role?: string })?.role;
  if (role !== 'admin' && role !== 'employee') return null;
  return session;
}

// ── Catalog helpers ───────────────────────────────────────────────────────────

/** All metered resource keys from the catalog, plus the synthetic ai_tokens. */
function allCatalogResources(): Array<{ resource: string; label: string; unit: string }> {
  const seen = new Set<string>();
  const out: Array<{ resource: string; label: string; unit: string }> = [];

  for (const domain of FEATURE_DOMAINS) {
    for (const meter of domain.meters) {
      if (!seen.has(meter.resource)) {
        seen.add(meter.resource);
        out.push({ resource: meter.resource, label: meter.label, unit: meter.unit });
      }
    }
  }

  // Synthetic ai_tokens entry (aggregated across all domains).
  if (!seen.has('ai_tokens')) {
    out.push({ resource: 'ai_tokens', label: 'AI usage', unit: 'tokens' });
  }

  return out;
}

// ── GET ───────────────────────────────────────────────────────────────────────

/**
 * GET /api/admin/portal/clients/:id/billing/thresholds
 *
 * Returns every catalog resource with its current threshold config (or defaults
 * when no row exists).
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!await requireStaff()) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const clientId = parseInt(id, 10);
  if (Number.isNaN(clientId)) {
    return NextResponse.json({ success: false, message: 'Invalid client id' }, { status: 400 });
  }

  const existing = await db
    .select()
    .from(usageThresholds)
    .where(eq(usageThresholds.clientId, clientId));

  const existingMap = new Map(existing.map((r) => [r.resource, r]));

  const catalogResources = allCatalogResources();
  const data = catalogResources.map(({ resource, label, unit }) => {
    const row = existingMap.get(resource);
    return {
      resource,
      label,
      unit,
      warnAtPct: row?.warnAtPct ?? 80,
      hardLimitQuantity: row != null && row.hardLimitQuantity != null ? Number(row.hardLimitQuantity) : null,
      notifyEmail: row?.notifyEmail ?? true,
      notifyPortal: row?.notifyPortal ?? true,
      hasCustomConfig: !!row,
    };
  });

  return NextResponse.json({ success: true, data });
}

// ── PUT ───────────────────────────────────────────────────────────────────────

/**
 * PUT /api/admin/portal/clients/:id/billing/thresholds
 *
 * Body: { resource, warnAtPct?, hardLimitQuantity?, notifyEmail?, notifyPortal? }
 *
 * Upserts on (clientId, resource). All fields are optional — omitted fields
 * keep their existing (or default) values.
 */
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!await requireStaff()) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const clientId = parseInt(id, 10);
  if (Number.isNaN(clientId)) {
    return NextResponse.json({ success: false, message: 'Invalid client id' }, { status: 400 });
  }

  let body: {
    resource?: string;
    warnAtPct?: number;
    hardLimitQuantity?: number | null;
    notifyEmail?: boolean;
    notifyPortal?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.resource || typeof body.resource !== 'string') {
    return NextResponse.json({ success: false, message: 'resource is required' }, { status: 400 });
  }

  // Validate warnAtPct if supplied.
  if (body.warnAtPct !== undefined) {
    if (
      typeof body.warnAtPct !== 'number' ||
      !Number.isInteger(body.warnAtPct) ||
      body.warnAtPct < 1 ||
      body.warnAtPct > 100
    ) {
      return NextResponse.json(
        { success: false, message: 'warnAtPct must be an integer between 1 and 100' },
        { status: 400 },
      );
    }
  }

  // Build the values object — only set fields that were supplied.
  const values: {
    clientId: number;
    resource: string;
    warnAtPct?: number;
    hardLimitQuantity?: string | null;
    notifyEmail?: boolean;
    notifyPortal?: boolean;
    updatedAt: Date;
  } = {
    clientId,
    resource: body.resource,
    updatedAt: new Date(),
  };

  if (body.warnAtPct !== undefined) values.warnAtPct = body.warnAtPct;
  if (body.hardLimitQuantity !== undefined) {
    values.hardLimitQuantity =
      body.hardLimitQuantity !== null ? String(body.hardLimitQuantity) : null;
  }
  if (body.notifyEmail !== undefined) values.notifyEmail = body.notifyEmail;
  if (body.notifyPortal !== undefined) values.notifyPortal = body.notifyPortal;

  const [upserted] = await db
    .insert(usageThresholds)
    .values({ ...values, warnAtPct: values.warnAtPct ?? 80 })
    .onConflictDoUpdate({
      target: [usageThresholds.clientId, usageThresholds.resource],
      set: {
        ...(values.warnAtPct !== undefined && { warnAtPct: values.warnAtPct }),
        ...(values.hardLimitQuantity !== undefined && { hardLimitQuantity: values.hardLimitQuantity }),
        ...(values.notifyEmail !== undefined && { notifyEmail: values.notifyEmail }),
        ...(values.notifyPortal !== undefined && { notifyPortal: values.notifyPortal }),
        updatedAt: new Date(),
      },
    })
    .returning();

  return NextResponse.json({ success: true, data: upserted });
}
