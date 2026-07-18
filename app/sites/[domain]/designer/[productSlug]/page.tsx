import { notFound, redirect } from 'next/navigation';
import { and, asc, eq, or } from 'drizzle-orm';
import { getClientWebsiteByDomain } from '@/lib/actions/client-sites';
import { getBrandingByWebsiteId } from '@/lib/branding';
import { db } from '@/lib/db';
import { products, productDesignSurfaces, storeSettings, designs, clients, clientMembers, clientWebsites } from '@/lib/db/schema';
import { DesignerClient } from '@/components/storefront/designer/DesignerClient';
import { auth } from '@/lib/auth';

// Designer pages are interactive — never cache.
export const dynamic = 'force-dynamic';

interface DesignerPageProps {
  params: Promise<{ domain: string; productSlug: string }>;
  searchParams: Promise<{ staff?: string; designId?: string }>;
}

/**
 * Same gate the design API uses — does the current portal user have access
 * to manage this website? Used to authorize the `?staff=1` flow that lets
 * staff edit store-mode designs that customers can't reach.
 */
async function portalUserHasSiteAccess(websiteId: number): Promise<boolean> {
  const session = await auth();
  const userIdRaw = session?.user?.id;
  if (!userIdRaw) return false;
  const userId = parseInt(userIdRaw, 10);
  if (!Number.isFinite(userId)) return false;
  const [hit] = await db
    .select({ id: clientWebsites.id })
    .from(clientWebsites)
    .innerJoin(clients, eq(clients.id, clientWebsites.clientId))
    .leftJoin(
      clientMembers,
      and(eq(clientMembers.clientId, clients.id), eq(clientMembers.userId, userId)),
    )
    .where(
      and(
        eq(clientWebsites.id, websiteId),
        or(eq(clients.userId, userId), eq(clientMembers.userId, userId)),
      ),
    )
    .limit(1);
  return !!hit;
}

export default async function DesignerPage({ params, searchParams }: DesignerPageProps) {
  const { domain, productSlug } = await params;
  const { staff, designId } = await searchParams;
  const isStaffRequest = staff === '1';

  const site = await getClientWebsiteByDomain(domain);
  if (!site) notFound();

  const [product] = await db
    .select()
    .from(products)
    .where(
      and(
        eq(products.websiteId, site.id),
        eq(products.slug, productSlug),
        eq(products.status, 'active'),
      ),
    )
    .limit(1);

  if (!product || !product.isDesignable) notFound();

  // Store-designed products: customers land on /shop; staff with the
  // ?staff=1 query param (and portal access to this website) bypass that
  // and edit the design in the same canvas. The DesignerClient is told
  // it's in staff mode below, which (a) loads the explicit designId
  // instead of looking up a sessionId-keyed draft and (b) attaches the
  // x-portal-staff header to its save/upload calls so the API authorizes
  // via the portal session.
  const productMetadata = (product.metadata ?? {}) as Record<string, unknown>;
  let staffMode = false;
  if (productMetadata.productDesignMode === 'store') {
    if (isStaffRequest && (await portalUserHasSiteAccess(site.id))) {
      staffMode = true;
    } else {
      redirect(`/shop/${product.slug}`);
    }
  } else if (isStaffRequest && (await portalUserHasSiteAccess(site.id))) {
    // Staff can also edit customer-designable products via the same path,
    // useful for tweaking a featured/example design.
    staffMode = true;
  }

  // Resolve the explicit design to load. For staff mode we prefer the
  // ?designId= query (which the portal page sets), then fall back to the
  // most recent template design tied to this product.
  let initialDesignId: string | undefined = undefined;
  if (staffMode) {
    if (typeof designId === 'string' && /^[0-9a-fA-F-]{36}$/.test(designId)) {
      const [d] = await db
        .select({ id: designs.id })
        .from(designs)
        .where(and(eq(designs.id, designId), eq(designs.productId, product.id)))
        .limit(1);
      if (d) initialDesignId = d.id;
    }
    if (!initialDesignId) {
      const [d] = await db
        .select({ id: designs.id })
        .from(designs)
        .where(and(eq(designs.productId, product.id), eq(designs.isTemplate, true)))
        .orderBy(asc(designs.createdAt))
        .limit(1);
      if (d) initialDesignId = d.id;
    }
  }

  const surfaces = await db
    .select()
    .from(productDesignSurfaces)
    .where(
      and(
        eq(productDesignSurfaces.productId, product.id),
        eq(productDesignSurfaces.active, true),
      ),
    )
    .orderBy(asc(productDesignSurfaces.displayOrder));

  if (surfaces.length === 0) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <span className="material-icons text-6xl text-muted-foreground/30 mb-4 block">brush</span>
        <h1 className="text-2xl font-bold mb-2">Designer not configured</h1>
        <p className="text-muted-foreground">
          This product is marked as customizable but no design surfaces have been added yet.
        </p>
      </div>
    );
  }

  // sessionId lives in localStorage on the storefront — the client wrapper
  // reads it and creates a draft design (or loads any existing draft).
  // Storefront settings give us the currency for the price label.
  const [store] = await db
    .select({ currency: storeSettings.currency })
    .from(storeSettings)
    .where(eq(storeSettings.websiteId, site.id))
    .limit(1);

  // Brand palette — surfaced by ColorPicker as a one-click "Brand" row so
  // customers can pick on-brand colors without typing hex codes. Falls back
  // to an empty list when the site has no branding profile assigned.
  const branding = await getBrandingByWebsiteId(site.id).catch(() => null);
  const brandColors = branding
    ? [
        branding.primaryColor,
        branding.secondaryColor,
        branding.accentColor,
        branding.linkColor,
        branding.textColor,
        branding.backgroundColor,
      ].filter((c): c is string => typeof c === 'string' && c.length > 0)
    : [];
  // Logo URL — surfaced by AddLayerPanel as a one-click "Use my logo"
  // button. Prefer the square variant since apparel designs are usually
  // square-ish, then fall back to the rectangular logo, then the generic
  // one. Empty string when nothing is configured.
  const brandLogoUrl = branding
    ? branding.logoSquareUrl || branding.logoUrl || branding.logoRectUrl || ''
    : '';
  // Brand fonts — surfaced by FontPicker as a pinned "Brand" row at the
  // top of the dropdown. Only fields that look like real font names get
  // plumbed; empty strings / nulls are filtered out so the row hides
  // cleanly when nothing's configured.
  const brandFonts = branding
    ? {
        heading: branding.headingFont || undefined,
        body: branding.bodyFont || undefined,
      }
    : {};

  return (
    <DesignerClient
      siteId={site.id}
      domain={domain}
      brandColors={brandColors}
      brandLogoUrl={brandLogoUrl}
      brandFonts={brandFonts}
      product={{
        id: product.id,
        slug: product.slug,
        name: product.name,
        priceCents: product.price,
        currency: store?.currency || 'USD',
      }}
      surfaces={surfaces.map((s) => ({
        id: s.id,
        name: s.name,
        slug: s.slug,
        mockupImage: s.mockupImage,
        canvasWidth: s.canvasWidth,
        canvasHeight: s.canvasHeight,
        printAreaX: s.printAreaX,
        printAreaY: s.printAreaY,
        printAreaWidth: s.printAreaWidth,
        printAreaHeight: s.printAreaHeight,
        printDpi: s.printDpi,
        displayOrder: s.displayOrder,
      }))}
      staffMode={staffMode}
      initialDesignId={initialDesignId}
    />
  );
}
