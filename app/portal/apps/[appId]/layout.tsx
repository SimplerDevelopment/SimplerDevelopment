/**
 * Plugin app entitlement gate.
 *
 * Wraps every `/portal/apps/<slug>/**` route. The middleware (Worker 2C's
 * `lib/plugins/proxy.ts`) is the primary entry point — it auths, mints a
 * JWT, and rewrites the request to the plugin host. This layout is the
 * **fallback** path: it runs whenever the rewrite did NOT happen (entitlement
 * UI render, plugin proxy disabled, dev-server mode without the rewrite),
 * and serves either the proxied children or the upsell card.
 *
 * Mirrors `app/portal/email/layout.tsx` and `app/portal/brain/layout.tsx`:
 *   1. auth() → redirect to /portal/login when unauthenticated
 *   2. getPortalClient → redirect to /portal/dashboard when no client resolves
 *   3. findActivePluginBySlug → notFound() when the slug doesn't match
 *      an active row
 *   4. isClientEntitledToApp → render children when entitled, else upsell
 *
 * The upsell is intentionally simpler than the email/brain ones (no Stripe
 * checkout link, no feature grid) — plugins ship without per-tenant
 * self-serve billing in v1; the operator grants access manually.
 */

import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';
import {
  findActivePluginBySlug,
  isClientEntitledToApp,
} from '@/lib/plugins/entitlement';

export default async function PluginAppLayout({
  params,
  children,
}: {
  params: Promise<{ appId: string }>;
  children: React.ReactNode;
}) {
  const { appId: slug } = await params;

  const session = await auth();
  if (!session?.user?.id) redirect('/portal/login');

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) redirect('/portal/dashboard');

  const app = await findActivePluginBySlug(slug);
  if (!app) notFound();

  const entitled = await isClientEntitledToApp(client.id, app);
  if (!entitled) {
    return <PluginUpsell appName={app.name} icon={app.icon ?? 'extension'} />;
  }

  return <>{children}</>;
}

function PluginUpsell({
  appName,
  icon,
}: {
  appName: string;
  icon: string;
}) {
  return (
    <div className="max-w-3xl mx-auto py-12 px-4">
      <div className="bg-card border border-border rounded-2xl p-8 text-center">
        <span className="material-icons text-5xl text-muted-foreground mb-3 block">
          {icon || 'extension_off'}
        </span>
        <h1 className="text-2xl font-bold text-foreground mb-2">
          {appName} is not available on your plan
        </h1>
        <p className="text-sm text-muted-foreground max-w-xl mx-auto mb-6">
          This app is gated behind an entitlement you don&rsquo;t currently
          have. Contact your account manager at Simpler Development to enable
          it for your account.
        </p>

        <div className="flex flex-col items-center gap-3">
          <Link
            href="/portal/dashboard"
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <span className="material-icons text-base">arrow_back</span>
            Back to dashboard
          </Link>

          <a
            href={`mailto:${process.env.SUPPORT_EMAIL || 'support@simplerdevelopment.com'}`}
            className="text-xs text-muted-foreground hover:underline"
          >
            {process.env.SUPPORT_EMAIL || 'support@simplerdevelopment.com'}
          </a>
        </div>

        <p className="text-xs text-muted-foreground mt-6">
          Just got access but still seeing this page? Refresh &mdash;
          provisioning can take a moment.
        </p>
      </div>
    </div>
  );
}
