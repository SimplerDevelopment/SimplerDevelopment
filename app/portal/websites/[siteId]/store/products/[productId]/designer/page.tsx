import { redirect, notFound } from 'next/navigation';
import { and, eq, or } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  clients,
  clientMembers,
  clientWebsites,
  products,
} from '@/lib/db/schema';

// Portal-side entry point for editing a store-mode product's design in the
// same Print Designer customers use at /sites/<domain>/design/<slug>.
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
  // designable — the single flag that opens the Print Designer.
  const [product] = await db
    .select({
      id: products.id,
      slug: products.slug,
      designable: products.designable,
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

  // Always the Print Designer. The legacy designer was retired once the cart
  // moved onto product_designs — see vault ADR
  // consolidate-on-product-designs-via-uuid. `isDesignable`, the flag that used
  // to route here to the legacy editor, was folded into `designable` and
  // dropped (migration 9019, "collapse the two designable flags into one") —
  // so this is the only destination now.
  redirect(`/sites/${host}/design/${product.slug}?staff=1`);
}
