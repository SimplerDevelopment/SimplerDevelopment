import { notFound } from 'next/navigation';
import { and, asc, eq } from 'drizzle-orm';
import { getClientWebsiteByDomain } from '@/lib/actions/client-sites';
import { getBrandingByWebsiteId } from '@/lib/branding';
import { db } from '@/lib/db';
import { products, productDesignSurfaces, storeSettings } from '@/lib/db/schema';
import { DesignerClient } from '@/components/storefront/designer/DesignerClient';

// Designer pages are interactive — never cache.
export const dynamic = 'force-dynamic';

interface DesignerPageProps {
  params: Promise<{ domain: string; productSlug: string }>;
}

export default async function DesignerPage({ params }: DesignerPageProps) {
  const { domain, productSlug } = await params;

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
    />
  );
}
