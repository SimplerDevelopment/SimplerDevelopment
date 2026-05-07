import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { clientServices, services } from '@/lib/db/schema';
import { and, eq, inArray } from 'drizzle-orm';

/**
 * Admin tier-assignment endpoint.
 *
 * GET   — return the current active tier for a client (if any) plus the
 *         catalog of available tier services so the picker UI can render in
 *         a single round-trip.
 *
 * POST  — assign / change the active tier. We deactivate any prior tier
 *         (status='cancelled') and create a new active clientServices row
 *         pointing at the requested tier. Sending `serviceId: null` cancels
 *         the current tier without replacing it.
 *
 * Tier services are identified by a `tier-` prefix on the slug, seeded by
 * scripts/seed-pricing-tiers.ts. We deliberately do NOT touch any
 * non-tier clientServices rows — switching tiers does NOT cancel domain /
 * hosting / per-service add-ons.
 */

const TIER_SLUGS = ['tier-starter', 'tier-growth', 'tier-scale'] as const;

async function requireStaff() {
  const session = await auth();
  if (!session?.user?.id) return null;
  const role = (session.user as { role?: string })?.role;
  if (role !== 'admin' && role !== 'employee') return null;
  return session;
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

  // Available tier catalog
  const tierCatalog = await db
    .select({
      id: services.id,
      slug: services.slug,
      name: services.name,
      description: services.description,
      price: services.price,
      billingCycle: services.billingCycle,
      features: services.features,
      usageLimits: services.usageLimits,
      active: services.active,
    })
    .from(services)
    .where(inArray(services.slug, TIER_SLUGS as unknown as string[]));

  // Currently active tier for this client (if any).
  const tierIds = tierCatalog.map(t => t.id);
  let active: { clientServiceId: number; serviceId: number; slug: string; name: string; startDate: Date | null } | null = null;
  if (tierIds.length > 0) {
    const [row] = await db
      .select({
        clientServiceId: clientServices.id,
        serviceId: clientServices.serviceId,
        slug: services.slug,
        name: services.name,
        startDate: clientServices.startDate,
      })
      .from(clientServices)
      .innerJoin(services, eq(services.id, clientServices.serviceId))
      .where(and(
        eq(clientServices.clientId, clientId),
        eq(clientServices.status, 'active'),
        inArray(clientServices.serviceId, tierIds),
      ))
      .limit(1);
    active = row ?? null;
  }

  return NextResponse.json({
    success: true,
    data: { active, catalog: tierCatalog },
  });
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
  const serviceIdRaw = (body as { serviceId?: number | null }).serviceId;
  const targetServiceId = serviceIdRaw === null ? null : Number(serviceIdRaw);

  // Validate target — must be one of the tier services (or explicit null to cancel).
  let targetService: { id: number; slug: string; name: string } | null = null;
  if (targetServiceId !== null) {
    if (!Number.isFinite(targetServiceId)) {
      return NextResponse.json({ success: false, message: 'Invalid serviceId' }, { status: 400 });
    }
    const [row] = await db
      .select({ id: services.id, slug: services.slug, name: services.name })
      .from(services)
      .where(eq(services.id, targetServiceId as number))
      .limit(1);
    if (!row) {
      return NextResponse.json({ success: false, message: 'Service not found' }, { status: 404 });
    }
    if (!(TIER_SLUGS as readonly string[]).includes(row.slug)) {
      return NextResponse.json({ success: false, message: 'Service is not a pricing tier' }, { status: 400 });
    }
    targetService = row;
  }

  // Find tier catalog ids so we only deactivate prior *tier* rows, not
  // unrelated services on this client.
  const tierIds = await db
    .select({ id: services.id })
    .from(services)
    .where(inArray(services.slug, TIER_SLUGS as unknown as string[]));
  const tierIdList = tierIds.map(r => r.id);

  // Deactivate any currently-active tier rows for this client.
  if (tierIdList.length > 0) {
    await db
      .update(clientServices)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(and(
        eq(clientServices.clientId, clientId),
        eq(clientServices.status, 'active'),
        inArray(clientServices.serviceId, tierIdList),
      ));
  }

  // Insert the new active row, if a target was specified.
  let newRow: { id: number; serviceId: number; status: string } | null = null;
  if (targetService) {
    const [inserted] = await db
      .insert(clientServices)
      .values({
        clientId,
        serviceId: targetService.id,
        status: 'active',
        startDate: new Date(),
      })
      .returning({ id: clientServices.id, serviceId: clientServices.serviceId, status: clientServices.status });
    newRow = inserted;
  }

  return NextResponse.json({
    success: true,
    data: {
      clientId,
      assigned: newRow,
      tier: targetService ? { id: targetService.id, slug: targetService.slug, name: targetService.name } : null,
    },
  });
}
