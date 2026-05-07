/**
 * Brain entitlement gate.
 *
 * Wraps every `/portal/brain/**` route. When the active client doesn't have
 * an active `'brain'` (or `'bundle'`) subscription we render the upsell card
 * instead of the requested page — the user stays in-context, sees what Brain
 * does, and can convert with one click. We deliberately do NOT 404 or redirect
 * to `/portal/services`: keeping the URL stable means deep-linked notifications
 * (e.g. "review this proposed task") still land on a useful page.
 */

import { redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { services } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { isBrainEntitled, BRAIN_SERVICE_CATEGORY } from '@/lib/brain/entitlement';
import { formatCents } from '@/lib/portal';

export default async function BrainLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) redirect('/portal/login');

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) redirect('/portal/dashboard');

  const entitled = await isBrainEntitled(client.id);
  if (entitled) return <>{children}</>;

  // Find the brain service so the upsell CTA goes to the real checkout endpoint.
  const [brainService] = await db
    .select()
    .from(services)
    .where(and(
      eq(services.category, BRAIN_SERVICE_CATEGORY),
      eq(services.active, true),
    ))
    .limit(1);

  return <BrainUpsell brainService={brainService ?? null} />;
}

function BrainUpsell({ brainService }: { brainService: typeof services.$inferSelect | null }) {
  const price = brainService ? formatCents(brainService.price) : '$49';
  const cycle: string = brainService?.billingCycle ?? 'monthly';
  const description = brainService?.description
    ?? 'A structured AI operating layer for your business. Capture meetings, decisions, and commitments; AI proposes tasks and connections; humans approve.';
  const features = (brainService?.features as string[] | undefined) ?? [
    'Meeting transcript ingestion',
    'AI-extracted tasks & decisions (human approval required)',
    'Cross-record search with citations',
    'Confidentiality controls',
  ];

  return (
    <div className="max-w-3xl mx-auto py-12 px-4">
      <div className="bg-card border border-border rounded-2xl p-8 text-center">
        <span className="material-icons text-5xl text-primary mb-3 block">psychology</span>
        <h1 className="text-2xl font-bold text-foreground mb-2">Company Brain</h1>
        <p className="text-sm text-muted-foreground max-w-xl mx-auto mb-6">{description}</p>

        <div className="grid sm:grid-cols-2 gap-3 max-w-2xl mx-auto mb-6 text-left">
          {features.slice(0, 6).map((f, i) => (
            <div key={i} className="flex items-start gap-2 text-sm text-foreground">
              <span className="material-icons text-base text-primary mt-0.5">check_circle</span>
              <span>{f}</span>
            </div>
          ))}
        </div>

        <div className="flex flex-col items-center gap-3">
          <div className="text-3xl font-bold text-foreground">
            {price}
            <span className="text-sm font-normal text-muted-foreground">/{cycle === 'monthly' ? 'mo' : cycle}</span>
          </div>

          {brainService ? (
            <Link
              href={`/portal/services/${brainService.id}/request`}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <span className="material-icons text-base">shopping_cart</span>
              Subscribe to Company Brain
            </Link>
          ) : (
            <Link
              href="/portal/services"
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <span className="material-icons text-base">storefront</span>
              View Services
            </Link>
          )}

          <Link href="/portal/dashboard" className="text-xs text-muted-foreground hover:underline">
            Back to dashboard
          </Link>
        </div>

        <p className="text-xs text-muted-foreground mt-6">
          Already subscribed but seeing this page? Refresh — provisioning can take a moment after checkout completes.
        </p>
      </div>
    </div>
  );
}
