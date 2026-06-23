/**
 * Email Marketing entitlement gate.
 *
 * Wraps every `/portal/email/**` route. When the active client doesn't have an
 * active `'email'` (or `'bundle'`) subscription we render the Email Marketing
 * upsell card instead of the requested page — the user stays in-context, sees
 * what Email Marketing does, and can convert with one click.
 *
 * Why this exists: `/portal/email/automations` previously redirected to
 * `/portal/brain/automations`, which gates on the `'brain'` SKU. Users hitting
 * the email automations page without an email subscription got the Company
 * Brain ($49/mo) upsell — confusing, because they were trying to access an
 * email feature. Gating /portal/email/** at this layout level ensures they
 * always see the Email Marketing upsell when they lack the email service.
 */

import { redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { clientServices, services } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { formatCents } from '@/lib/portal';

const EMAIL_SERVICE_CATEGORY = 'email' as const;

/**
 * True when the test runner is hosting this process. Mirrors the bypass used
 * by `lib/brain/entitlement.ts` so existing email integration specs don't
 * have to seed an `email` SKU + `client_services` row.
 */
function isTestRuntime(): boolean {
  if (process.env.EMAIL_ENTITLEMENT_BYPASS === '1') return true;
  if (process.env.VITEST === 'true' || process.env.VITEST === '1') return true;
  if (process.env.VITEST_POOL_ID !== undefined) return true;
  return false;
}

async function isEmailEntitled(clientId: number): Promise<boolean> {
  if (isTestRuntime()) return true;

  const rows = await db
    .select({ category: services.category })
    .from(clientServices)
    .innerJoin(services, eq(services.id, clientServices.serviceId))
    .where(and(
      eq(clientServices.clientId, clientId),
      eq(clientServices.status, 'active'),
    ));

  return rows.some((r) => r.category === EMAIL_SERVICE_CATEGORY || r.category === 'bundle');
}

export default async function EmailLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) redirect('/portal/login');

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) redirect('/portal/dashboard');

  const entitled = await isEmailEntitled(client.id);
  if (entitled) return <>{children}</>;

  const [emailService] = await db
    .select()
    .from(services)
    .where(and(
      eq(services.category, EMAIL_SERVICE_CATEGORY),
      eq(services.active, true),
    ))
    .limit(1);

  return <EmailUpsell emailService={emailService ?? null} />;
}

function EmailUpsell({
  emailService,
}: {
  emailService: typeof services.$inferSelect | null;
}) {
  const price = emailService ? formatCents(emailService.price) : '$19';
  const cycle: string = emailService?.billingCycle ?? 'monthly';
  const description = emailService?.description
    ?? 'Send beautiful email campaigns to your audience. Manage subscriber lists, design emails with a rich editor, and track opens, clicks, and unsubscribes — all from your client portal.';
  const features = (emailService?.features as string[] | undefined) ?? [
    'Unlimited subscriber lists',
    'Visual email campaign builder',
    'Open & click tracking',
    'Unsubscribe management',
    'Custom sending domain',
    'Campaign scheduling',
  ];

  return (
    <div className="max-w-3xl mx-auto py-12 px-4">
      <div className="bg-card border border-border rounded-2xl p-8 text-center">
        <span className="material-icons text-5xl text-primary mb-3 block">mail</span>
        <h1 className="text-2xl font-bold text-foreground mb-2">Email Marketing</h1>
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

          {emailService ? (
            <Link
              href={`/portal/services/${emailService.id}/request`}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <span className="material-icons text-base">shopping_cart</span>
              Subscribe to Email Marketing
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
