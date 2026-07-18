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
import { clients, services } from '@/lib/db/schema';
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

  // Look up brain service + trial state in parallel so the upsell card can
  // (a) link to the real checkout and (b) tell the user whether their trial
  // is still active or has just expired (drives a different CTA tone).
  const [[brainService], [trialRow]] = await Promise.all([
    db
      .select()
      .from(services)
      .where(and(
        eq(services.category, BRAIN_SERVICE_CATEGORY),
        eq(services.active, true),
      ))
      .limit(1),
    db
      .select({ brainTrialUntil: clients.brainTrialUntil })
      .from(clients)
      .where(eq(clients.id, client.id))
      .limit(1),
  ]);

  const trialUntil = trialRow?.brainTrialUntil ?? null;
  const now = new Date();
  const trialState: TrialState = !trialUntil
    ? 'none'
    : trialUntil > now
      ? 'active'  // entitled check would have caught this — defensive fallback.
      : 'expired';

  return (
    <BrainUpsell
      brainService={brainService ?? null}
      trialState={trialState}
      trialUntil={trialUntil}
    />
  );
}

type TrialState = 'none' | 'active' | 'expired';

function formatTrialDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function BrainUpsell({
  brainService,
  trialState,
  trialUntil,
}: {
  brainService: typeof services.$inferSelect | null;
  trialState: TrialState;
  trialUntil: Date | null;
}) {
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

        {trialState === 'expired' && trialUntil && (
          <div className="mb-6 flex items-start gap-3 text-left bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 max-w-xl mx-auto">
            <span className="material-icons text-amber-600 dark:text-amber-400 text-xl shrink-0">schedule</span>
            <div className="text-sm">
              <div className="font-semibold text-foreground">Your trial ended on {formatTrialDate(trialUntil)}.</div>
              <p className="text-muted-foreground mt-0.5">
                Your notes and history are preserved. Subscribe below to keep working with Brain.
              </p>
            </div>
          </div>
        )}

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
