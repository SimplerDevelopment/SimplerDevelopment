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

  // Resolve the product on the user's website.
  const [product] = await db
    .select({ id: products.id, slug: products.slug })
    .from(products)
    .where(and(eq(products.id, productId), eq(products.websiteId, siteId)))
    .limit(1);
  if (!product) notFound();

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

  // Pick the public host. Prefer the custom domain, then the Vercel domain,
  // then the simpledevelopment.com subdomain. We use the canonical /sites/
  // route which works for any of these.
  const host = site.domain || site.vercelDomain || (site.subdomain ? `${site.subdomain}.simplerdevelopment.com` : null);
  if (!host) notFound();

  const params2 = new URLSearchParams({ staff: '1' });
  if (design) params2.set('designId', design.id);

  // Same-origin redirect — the dev server proxies /sites/<domain>/* on the
  // same host, so we use a path-only redirect to stay on the current origin.
  redirect(`/sites/${host}/designer/${product.slug}?${params2.toString()}`);
}
