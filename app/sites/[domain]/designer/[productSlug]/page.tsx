import { notFound } from 'next/navigation';
import { and, asc, eq } from 'drizzle-orm';
import { getClientWebsiteByDomain } from '@/lib/actions/client-sites';
import { db } from '@/lib/db';
import { products, productDesignSurfaces } from '@/lib/db/schema';
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
  return (
    <DesignerClient
      siteId={site.id}
      domain={domain}
      product={{ id: product.id, slug: product.slug, name: product.name }}
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
