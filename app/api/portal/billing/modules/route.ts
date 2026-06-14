// GET /api/portal/billing/modules
//
// Returns the full module catalog merged with:
//   - live services rows (price, stripePriceId, serviceId)
//   - the client's active clientServices rows (subscription state)
// Used to power the self-serve pricing page at /portal/settings/billing/plans.

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { services, clientServices } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { authorizePortal, isAuthError } from '@/lib/portal-auth';
import { getClientEntitlements } from '@/lib/billing/entitlements';
import {
  FEATURE_DOMAINS,
  BUNDLE,
  BUNDLE_SLUG,
  INCLUDED_SEATS,
  SEAT_PRICE_CAP_CENTS,
  computeAccountBilling,
} from '@/lib/billing/domain-catalog';
import { countBillableSeats } from '@/lib/billing/seats';

export async function GET() {
  const auth = await authorizePortal({ action: 'read' });
  if (isAuthError(auth)) return auth.response;

  const { client } = auth;

  // ── 1. Load all active services from DB once ──────────────────────────────
  const allServices = await db
    .select({
      id: services.id,
      slug: services.slug,
      category: services.category,
      price: services.price,
      stripePriceId: services.stripePriceId,
    })
    .from(services)
    .where(eq(services.active, true));

  const serviceBySlug = new Map(allServices.map((s) => [s.slug, s]));

  // ── 2. Load client's active clientServices rows ───────────────────────────
  const clientSubs = await db
    .select({
      id: clientServices.id,
      serviceId: clientServices.serviceId,
      status: clientServices.status,
      renewalDate: clientServices.renewalDate,
      stripeSubscriptionId: clientServices.stripeSubscriptionId,
    })
    .from(clientServices)
    .where(
      and(
        eq(clientServices.clientId, client.id),
        eq(clientServices.status, 'active'),
      ),
    );

  const clientSubByServiceId = new Map(clientSubs.map((cs) => [cs.serviceId, cs]));

  // ── 3. Entitlements (to populate hasBundle etc.) ──────────────────────────
  const ent = await getClientEntitlements(client.id, {
    billingMode: client.billingMode,
    brainTrialUntil: client.brainTrialUntil,
  });

  // ── 4. Merge modules ──────────────────────────────────────────────────────
  const modules = FEATURE_DOMAINS.map((domain) => {
    const svc = serviceBySlug.get(domain.slug);
    const clientSub = svc ? clientSubByServiceId.get(svc.id) : undefined;

    return {
      // catalog fields
      key: domain.key,
      slug: domain.slug,
      name: domain.name,
      tagline: domain.tagline,
      icon: domain.icon,
      features: domain.features,
      meters: domain.meters,
      byokProviders: domain.byokProviders,
      // live price: services row first, fall back to catalog default
      monthlyPriceCents: svc?.price ?? domain.monthlyPriceCents,
      // service lookup
      serviceId: svc?.id ?? null,
      stripePriceId: svc?.stripePriceId ?? null,
      purchasable: !!(svc?.stripePriceId),
      // subscription state
      clientServiceId: clientSub?.id ?? null,
      status: clientSub?.status ?? null,
      renewalDate: clientSub?.renewalDate ?? null,
      selfServe: !!(clientSub?.stripeSubscriptionId),
    };
  });

  // ── 5. Merge bundle ───────────────────────────────────────────────────────
  const bundleSvc = serviceBySlug.get(BUNDLE_SLUG);
  const bundleClientSub = bundleSvc ? clientSubByServiceId.get(bundleSvc.id) : undefined;

  const bundle = {
    slug: BUNDLE.slug,
    name: BUNDLE.name,
    tagline: BUNDLE.tagline,
    icon: BUNDLE.icon,
    monthlyPriceCents: bundleSvc?.price ?? BUNDLE.monthlyPriceCents,
    serviceId: bundleSvc?.id ?? null,
    stripePriceId: bundleSvc?.stripePriceId ?? null,
    purchasable: !!(bundleSvc?.stripePriceId),
    clientServiceId: bundleClientSub?.id ?? null,
    status: bundleClientSub?.status ?? null,
    renewalDate: bundleClientSub?.renewalDate ?? null,
    selfServe: !!(bundleClientSub?.stripeSubscriptionId),
  };

  // ── 6. Seat billing — current accepted seats + the per-seat charge ────────
  // M = the module subtotal after volume discount (or the flat bundle price).
  // Each additional accepted seat is billed min(M, $30).
  const seatCount = await countBillableSeats(client.id);
  const activeModulePrices = modules
    .filter((m) => m.status === 'active')
    .map((m) => m.monthlyPriceCents);
  const bundleActive = bundle.status === 'active';
  const moduleSubtotalCents = bundleActive
    ? bundle.monthlyPriceCents
    : computeAccountBilling(activeModulePrices, seatCount).moduleSubtotalCents;
  const additionalSeats = Math.max(0, seatCount - INCLUDED_SEATS);
  const perSeatCents = Math.min(moduleSubtotalCents, SEAT_PRICE_CAP_CENTS);

  return NextResponse.json({
    success: true,
    data: {
      billingMode: client.billingMode,
      entitlements: {
        domains: [...ent.domains],
        hasBundle: ent.hasBundle,
        gatingBypassed: ent.gatingBypassed,
      },
      bundle,
      modules,
      seats: {
        count: seatCount,
        included: INCLUDED_SEATS,
        additional: additionalSeats,
        capCents: SEAT_PRICE_CAP_CENTS,
        perSeatCents,
        seatTotalCents: perSeatCents * additionalSeats,
        moduleSubtotalCents,
      },
    },
  });
}
