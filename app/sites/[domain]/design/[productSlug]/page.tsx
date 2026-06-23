import { notFound } from 'next/navigation';
import { getClientWebsiteByDomain } from '@/lib/actions/client-sites';
import { db } from '@/lib/db';
import { products, storeSettings } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { ProductDesignerClient } from './ProductDesignerClient';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ domain: string; productSlug: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { domain, productSlug } = await params;
  const site = await getClientWebsiteByDomain(domain);
  if (!site) return { title: { absolute: 'Not Found' } };

  const [product] = await db
    .select({ name: products.name })
    .from(products)
    .where(and(eq(products.websiteId, site.id), eq(products.slug, productSlug), eq(products.status, 'active')))
    .limit(1);

  if (!product) return { title: { absolute: 'Not Found' } };

  return {
    title: { absolute: `Customize ${product.name} — ${site.name}` },
    robots: { index: false, follow: false },
  };
}

export default async function DesignPage({ params, searchParams }: PageProps) {
  const { domain, productSlug } = await params;
  const sp = await searchParams;
  const designId = typeof sp.designId === 'string' ? sp.designId : undefined;

  const site = await getClientWebsiteByDomain(domain);
  if (!site) notFound();

  // Gate on store being enabled (mirrors the storefront API route)
  const [store] = await db
    .select()
    .from(storeSettings)
    .where(and(eq(storeSettings.websiteId, site.id), eq(storeSettings.enabled, true)))
    .limit(1);

  if (!store) notFound();

  const [product] = await db
    .select()
    .from(products)
    .where(and(eq(products.websiteId, site.id), eq(products.slug, productSlug), eq(products.status, 'active')))
    .limit(1);

  if (!product) notFound();

  // The Product Designer can only render for products explicitly flagged
  // designable — buy-as-is-only products shouldn't expose the editor.
  if (!product.designable) notFound();

  return (
    <ProductDesignerClient
      siteId={site.id}
      websiteId={product.websiteId}
      productId={String(product.id)}
      productName={product.name}
      productSlug={product.slug}
      initialDesignId={designId}
    />
  );
}
