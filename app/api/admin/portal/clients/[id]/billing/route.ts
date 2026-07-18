// Admin billing management for one client (Card C3 of Admin Billing Parity).
//
//   GET  — the full billing read-model: active modules / bundle, seats
//          (derived vs override + per-seat charge), volume discount, comp %,
//          BYOK eligibility, and the computed MRR (gross + comp + net).
//   POST — staff actions, each mutating the DB then re-running the SINGLE
//          writer recomputeClientSubscription so Stripe matches. Actions:
//            set-seats   { override: number|null }   — billableSeatsOverride
//            set-comp    { percent: number|null }    — compDiscountPercent (0-100)
//            set-byok    { override: boolean|null }  — byokEligibleOverride (no recompute)
//            add-module  { slug }                    — grant a module
//            remove-module { clientServiceId }        — cancel a module/bundle row
//            set-bundle  {}                           — swap to the everything bundle
//
// billingMode is managed by the existing .../billing-mode route — not here.
// Staff-only (requireStaffSession). No tenant scoping — this is a global panel,
// but every write is filtered to the path's clientId.

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { clients, clientServices, services } from '@/lib/db/schema';
import { and, eq, isNotNull } from 'drizzle-orm';
import { requireStaffSession } from '@/lib/admin/auth';
import {
  FEATURE_DOMAINS,
  BUNDLE_SLUG,
  computeAccountBilling,
  SEAT_PRICE_CAP_CENTS,
  INCLUDED_SEATS,
} from '@/lib/billing/domain-catalog';
import { recomputeClientSubscription } from '@/lib/billing/recompute-subscription';
import { deriveBillableSeats } from '@/lib/billing/seats';
import { getClientEntitlements } from '@/lib/billing/entitlements';
import Stripe from 'stripe';

export const runtime = 'nodejs';

const MODULE_CATEGORIES = new Set(FEATURE_DOMAINS.map((d) => d.key));
const MODULE_SLUGS = new Set(FEATURE_DOMAINS.map((d) => d.slug));

function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  return key ? new Stripe(key) : null;
}

/** The client's active self-serve Stripe subscription id, if any. */
async function activeSubscriptionId(clientId: number): Promise<string | null> {
  const rows = await db
    .select({ subId: clientServices.stripeSubscriptionId })
    .from(clientServices)
    .where(and(
      eq(clientServices.clientId, clientId),
      eq(clientServices.status, 'active'),
      isNotNull(clientServices.stripeSubscriptionId),
    ))
    .limit(1);
  return rows[0]?.subId ?? null;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!await requireStaffSession()) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }
  const clientId = parseInt((await params).id, 10);
  if (!Number.isFinite(clientId)) {
    return NextResponse.json({ success: false, message: 'Invalid client id' }, { status: 400 });
  }
  const [client] = await db.select().from(clients).where(eq(clients.id, clientId)).limit(1);
  if (!client) return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  const rows = await db
    .select({
      clientServiceId: clientServices.id,
      slug: services.slug,
      name: services.name,
      category: services.category,
      priceCents: services.price,
      stripeSubscriptionId: clientServices.stripeSubscriptionId,
    })
    .from(clientServices)
    .innerJoin(services, eq(services.id, clientServices.serviceId))
    .where(and(eq(clientServices.clientId, clientId), eq(clientServices.status, 'active')));

  const bundleRow = rows.find((r) => r.category === 'bundle');
  const moduleRows = rows.filter((r) => MODULE_CATEGORIES.has(r.category));
  const subscriptionId = rows.find((r) => r.stripeSubscriptionId)?.stripeSubscriptionId ?? null;

  const derivedSeats = await deriveBillableSeats(clientId);
  const seatsOverride = client.billableSeatsOverride;
  const effectiveSeats = seatsOverride != null && seatsOverride >= 0 ? seatsOverride : derivedSeats;

  // M (post-volume-discount module subtotal) + the volume discount %.
  let moduleSubtotalCents = 0;
  let discountPercent = 0;
  if (bundleRow) {
    moduleSubtotalCents = bundleRow.priceCents ?? 0;
  } else if (moduleRows.length > 0) {
    const billing = computeAccountBilling(moduleRows.map((r) => r.priceCents ?? 0), effectiveSeats);
    moduleSubtotalCents = billing.moduleSubtotalCents;
    discountPercent = billing.discountPercent;
  }
  const perSeatCents = Math.min(moduleSubtotalCents, SEAT_PRICE_CAP_CENTS);
  const additionalSeats = Math.max(0, effectiveSeats - INCLUDED_SEATS);
  const seatTotalCents = perSeatCents * additionalSeats;
  const grossMrrCents = moduleSubtotalCents + seatTotalCents;
  const compPercent = client.compDiscountPercent ?? 0;
  const compDiscountCents = compPercent > 0 ? Math.round((grossMrrCents * compPercent) / 100) : 0;

  const ent = await getClientEntitlements(clientId, {
    billingMode: client.billingMode,
    brainTrialUntil: client.brainTrialUntil,
    byokEligibleOverride: client.byokEligibleOverride,
  });

  return NextResponse.json({
    success: true,
    data: {
      billingMode: client.billingMode,
      hasSubscription: !!subscriptionId,
      modules: moduleRows.map((r) => ({
        clientServiceId: r.clientServiceId,
        key: r.category,
        slug: r.slug,
        name: r.name,
        priceCents: r.priceCents,
      })),
      bundle: bundleRow
        ? { clientServiceId: bundleRow.clientServiceId, priceCents: bundleRow.priceCents }
        : null,
      seats: {
        derived: derivedSeats,
        override: seatsOverride,
        effective: effectiveSeats,
        included: INCLUDED_SEATS,
        additional: additionalSeats,
        perSeatCents,
        seatTotalCents,
      },
      moduleSubtotalCents,
      discountPercent,
      compDiscountPercent: client.compDiscountPercent,
      compDiscountCents,
      byokEligibleOverride: client.byokEligibleOverride,
      byokEligible: ent.byokEligible,
      grossMrrCents,
      netMrrCents: grossMrrCents - compDiscountCents,
    },
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireStaffSession();
  if (!session) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const clientId = parseInt((await params).id, 10);
  if (!Number.isFinite(clientId)) {
    return NextResponse.json({ success: false, message: 'Invalid client id' }, { status: 400 });
  }
  const [client] = await db.select({ id: clients.id }).from(clients).where(eq(clients.id, clientId)).limit(1);
  if (!client) return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });

  let body: { action?: string; override?: unknown; percent?: unknown; slug?: unknown; clientServiceId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: 'Invalid JSON body' }, { status: 400 });
  }
  const action = body.action;
  const stripe = getStripe();
  const recompute = async () => { if (stripe) await recomputeClientSubscription(stripe, clientId); };

  const audit = (detail: Record<string, unknown>) =>
    console.log('[admin/clients/billing]', { staffUserId: session.user?.id, clientId, action, ...detail });

  switch (action) {
    case 'set-seats': {
      const v = body.override;
      const override = v === null ? null : Number(v);
      if (override !== null && (!Number.isInteger(override) || override < 0)) {
        return NextResponse.json({ success: false, message: 'override must be a non-negative integer or null' }, { status: 400 });
      }
      await db.update(clients).set({ billableSeatsOverride: override, updatedAt: new Date() }).where(eq(clients.id, clientId));
      await recompute();
      audit({ override });
      break;
    }
    case 'set-comp': {
      const v = body.percent;
      const percent = v === null ? null : Number(v);
      if (percent !== null && (!Number.isInteger(percent) || percent < 0 || percent > 100)) {
        return NextResponse.json({ success: false, message: 'percent must be 0–100 or null' }, { status: 400 });
      }
      await db.update(clients).set({ compDiscountPercent: percent, updatedAt: new Date() }).where(eq(clients.id, clientId));
      await recompute();
      audit({ percent });
      break;
    }
    case 'set-byok': {
      const v = body.override;
      if (v !== null && typeof v !== 'boolean') {
        return NextResponse.json({ success: false, message: 'override must be a boolean or null' }, { status: 400 });
      }
      // Entitlement-only — no Stripe recompute needed.
      await db.update(clients).set({ byokEligibleOverride: v as boolean | null, updatedAt: new Date() }).where(eq(clients.id, clientId));
      audit({ override: v });
      break;
    }
    case 'add-module': {
      const slug = typeof body.slug === 'string' ? body.slug : '';
      if (!MODULE_SLUGS.has(slug)) {
        return NextResponse.json({ success: false, message: 'Unknown module slug' }, { status: 400 });
      }
      const [svc] = await db.select({ id: services.id }).from(services).where(and(eq(services.slug, slug), eq(services.active, true))).limit(1);
      if (!svc) return NextResponse.json({ success: false, message: 'Module not found' }, { status: 404 });
      // Already active?
      const existing = await db
        .select({ id: clientServices.id })
        .from(clientServices)
        .where(and(eq(clientServices.clientId, clientId), eq(clientServices.serviceId, svc.id), eq(clientServices.status, 'active')))
        .limit(1);
      if (existing.length > 0) {
        return NextResponse.json({ success: false, message: 'Client already has this module' }, { status: 409 });
      }
      const subId = await activeSubscriptionId(clientId);
      await db.insert(clientServices).values({
        clientId,
        serviceId: svc.id,
        status: 'active',
        stripeSubscriptionId: subId, // null = granted without a Stripe line (e.g. comped/managed)
        startDate: new Date(),
      });
      await recompute();
      audit({ slug, billed: !!subId });
      break;
    }
    case 'remove-module': {
      const csId = Number(body.clientServiceId);
      if (!Number.isInteger(csId)) {
        return NextResponse.json({ success: false, message: 'clientServiceId required' }, { status: 400 });
      }
      const res = await db
        .update(clientServices)
        .set({ status: 'cancelled', updatedAt: new Date() })
        .where(and(eq(clientServices.id, csId), eq(clientServices.clientId, clientId), eq(clientServices.status, 'active')))
        .returning({ id: clientServices.id });
      if (res.length === 0) {
        return NextResponse.json({ success: false, message: 'Active row not found for this client' }, { status: 404 });
      }
      await recompute();
      audit({ clientServiceId: csId });
      break;
    }
    case 'set-bundle': {
      const [bundleSvc] = await db.select({ id: services.id }).from(services).where(and(eq(services.slug, BUNDLE_SLUG), eq(services.active, true))).limit(1);
      if (!bundleSvc) return NextResponse.json({ success: false, message: 'Bundle SKU not found' }, { status: 404 });
      // Already on the bundle?
      const onBundle = await db
        .select({ id: clientServices.id })
        .from(clientServices)
        .where(and(eq(clientServices.clientId, clientId), eq(clientServices.serviceId, bundleSvc.id), eq(clientServices.status, 'active')))
        .limit(1);
      if (onBundle.length > 0) {
        return NextResponse.json({ success: false, message: 'Client is already on the bundle' }, { status: 409 });
      }
      const subId = await activeSubscriptionId(clientId);
      // Cancel every active module row, then add the bundle — the reconciler
      // swaps the Stripe items.
      await db
        .update(clientServices)
        .set({ status: 'cancelled', updatedAt: new Date() })
        .where(and(eq(clientServices.clientId, clientId), eq(clientServices.status, 'active')));
      await db.insert(clientServices).values({
        clientId,
        serviceId: bundleSvc.id,
        status: 'active',
        stripeSubscriptionId: subId,
        startDate: new Date(),
      });
      await recompute();
      audit({ swappedToBundle: true, billed: !!subId });
      break;
    }
    default:
      return NextResponse.json({ success: false, message: `Unknown action: ${action}` }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
