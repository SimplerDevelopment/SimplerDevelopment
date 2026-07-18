import { redirect, notFound } from 'next/navigation';
import { and, asc, eq, or } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  clients,
  clientMembers,
  clientWebsites,
  designs,
  products,
} from '@/lib/db/schema';

// Portal-side entry point for editing a store-mode product's design in the
// same canvas designer customers use at /sites/<domain>/designer/<slug>.
//
// What this page does: verifies portal auth + access, resolves the product's
// template design row, then issues an HTTP redirect to the storefront
// designer URL with `?staff=1&designId=<id>`. The storefront route honors
// the flag (after re-verifying access) and renders the same DesignerClient
// in staff mode — load by designId, save via x-portal-staff auth, no add-
// to-cart.
//
// Why redirect instead of rendering the designer inline here: keeps a single
// canonical place where the canvas component is wired up (storefront route),
// avoids duplicating the substantial branding / surfaces / store-settings
// prop plumbing.

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ siteId: string; productId: string }>;
}

export default async function PortalDesignerEntryPage({ params }: PageProps) {
  const { siteId: siteIdRaw, productId: productIdRaw } = await params;
  const siteId = parseInt(siteIdRaw, 10);
  const productId = parseInt(productIdRaw, 10);
  if (!Number.isFinite(siteId) || !Number.isFinite(productId)) notFound();

  const session = await auth();
  const userIdRaw = session?.user?.id;
  if (!userIdRaw) redirect('/portal/login');
  const userId = parseInt(userIdRaw, 10);
  if (!Number.isFinite(userId)) redirect('/portal/login');

  // Confirm the user has access to this website (direct owner OR clientMembers).
  const [site] = await db
    .select({
      id: clientWebsites.id,
      domain: clientWebsites.domain,
      subdomain: clientWebsites.subdomain,
      vercelDomain: clientWebsites.vercelDomain,
    })
    .from(clientWebsites)
    .innerJoin(clients, eq(clients.id, clientWebsites.clientId))
    .leftJoin(
      clientMembers,
      and(eq(clientMembers.clientId, clients.id), eq(clientMembers.userId, userId)),
    )
    .where(
      and(
        eq(clientWebsites.id, siteId),
        or(eq(clients.userId, userId), eq(clientMembers.userId, userId)),
      ),
    )
    .limit(1);
  if (!site) notFound();

  // Resolve the product on the user's website. Widened to include the
  // designable/isDesignable/metadata columns so we can branch below between
  // the legacy `designs`-table designer and the new `productDesigns` one.
  const [product] = await db
    .select({
      id: products.id,
      slug: products.slug,
      designable: products.designable,
      isDesignable: products.isDesignable,
      metadata: products.metadata,
    })
    .from(products)
    .where(and(eq(products.id, productId), eq(products.websiteId, siteId)))
    .limit(1);
  if (!product) notFound();

  // Pick the public host. Prefer the custom domain, then the Vercel domain,
  // then the simpledevelopment.com subdomain. We use the canonical /sites/
  // route which works for any of these. Hoisted above the legacy design
  // lookup so the new-designer branch (below) can redirect without it.
  const host = site.domain || site.vercelDomain || (site.subdomain ? `${site.subdomain}.simplerdevelopment.com` : null);
  if (!host) notFound();

  // New product designer (`productDesigns` table, /sites/<host>/design/<slug>)
  // — only for products flagged `designable` that AREN'T also flagged for
  // the legacy designer. Without this branch, these products' "Open Designer
  // Setup" / "Open in Designer" buttons fell through to the legacy redirect
  // below and 404'd on /designer/<slug> (isDesignable required there).
  const meta = (product.metadata ?? {}) as Record<string, unknown>;
  const useLegacy = product.isDesignable || meta.productDesignMode === 'store';
  if (!useLegacy && product.designable) {
    redirect(`/sites/${host}/design/${product.slug}?staff=1`);
  }

  // Find the design — prefer the template flavor (server-authored), fall
  // back to any design on the product. If none exists yet, the storefront
  // route's auto-create-on-first-action will mint one.
  const [design] = await db
    .select({ id: designs.id })
    .from(designs)
    .where(
      and(
        eq(designs.productId, productId),
        eq(designs.websiteId, siteId),
        eq(designs.isTemplate, true),
      ),
    )
    .orderBy(asc(designs.createdAt))
    .limit(1);

  const params2 = new URLSearchParams({ staff: '1' });
  if (design) params2.set('designId', design.id);

  // Same-origin redirect — the dev server proxies /sites/<domain>/* on the
  // same host, so we use a path-only redirect to stay on the current origin.
  redirect(`/sites/${host}/designer/${product.slug}?${params2.toString()}`);
}
