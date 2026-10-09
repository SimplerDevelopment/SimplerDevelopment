import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  services, clientServices,
  userOnboarding, userDashboardPreferences,
} from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getPortalClient } from '@/lib/portal-client';
import { getBrainProfile } from '@/lib/brain/profiles';
import { Suspense } from 'react';
import { resolveVisibleWidgets, type DashboardWidgetPrefs } from '@/lib/dashboard/widgets';
import { WIDGET_COMPONENTS } from '@/components/portal/dashboard/widgets';
import WidgetBoard from '@/components/portal/dashboard/WidgetBoard';
import { WidgetSkeleton } from '@/components/portal/dashboard/skeletons';
import GetStartedChecklist from '@/components/portal/onboarding/GetStartedChecklist';
import { PortalPageHeader } from '@/components/portal/PortalPageHeader';
import { pBtnGhost } from '@/components/portal/portal-ui';
import { hasFlag } from '@/lib/feature-flags';
import { collectNeedsYou } from '@/lib/portal/needs-you';
import { needsYouSummary } from '@/lib/portal/needs-you-shape';
import NeedsYouCard from '@/components/portal/dashboard/NeedsYouCard';
import { Greeting, TodayLine } from '@/components/portal/dashboard/HomeGreeting';

// A first-impression page must never crash on a single optional data load.
// Each widget count / pref lookup degrades to its natural fallback (and logs)
// rather than rejecting the whole page into the error boundary. The first
// thing a new user sees after onboarding is this dashboard — a missing row or
// a transient query failure should cost one widget, not the entire screen.
async function safe<T>(p: Promise<T>, fallback: T, label: string): Promise<T> {
  try {
    return await p;
  } catch (err) {
    console.error(`[dashboard] optional load "${label}" failed — using fallback:`, err);
    return fallback;
  }
}

export default async function PortalDashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/portal/login');

  const userId = parseInt(session.user.id, 10);

  // First-run gate: send brand-new users into the onboarding wizard. We treat
  // "no row" and "row with NULL completed_at" identically — both mean the
  // user has never finished. Self-link from settings can `reopen` later.
  // This is the ONLY place in app/portal that checks completedAt — other
  // portal pages don't redirect, so a user who lands deep-linked elsewhere
  // (bookmark, shared URL) bypasses the wizard entirely for that visit.
  const [ob] = await db
    .select({ completedAt: userOnboarding.completedAt })
    .from(userOnboarding)
    .where(eq(userOnboarding.userId, userId))
    .limit(1);
  if (!ob || !ob.completedAt) {
    redirect('/portal/onboarding');
  }

  const client = await getPortalClient(userId);

  if (!client) {
    return (
      <div className="max-w-2xl mx-auto text-center py-20">
        <span className="material-icons text-5xl text-muted-foreground">person_off</span>
        <h2 className="mt-4 text-xl font-semibold">No client profile found</h2>
        <p className="mt-2 text-muted-foreground text-sm">Please contact us to set up your account.</p>
      </div>
    );
  }

  const brainProfile = await safe(getBrainProfile(client.id), null, 'brainProfile');
  const brainEnabled = brainProfile?.enabled ?? false;

  // PUX-145: under the redesign Home opens with "Needs you" — the cross-room
  // list of what only this client can do — and the greeting is written around
  // its count. Off = today's header + board, untouched.
  const studio = hasFlag(client, 'portal-redesign');
  const firstName = session.user.name?.trim().split(/\s+/)[0] || null;

  // Only the data the surviving dashboard needs: the service list + this
  // client's subscriptions (to gate which widgets are on the board) and the
  // user's saved widget prefs. Every item degrades independently (see `safe`).
  const [allServices, mySubscriptions, dashboardPrefsRow, needs] = await Promise.all([
    safe(db.select().from(services).where(eq(services.active, true)).orderBy(services.name), [], 'services'),
    safe(db.select({ serviceId: clientServices.serviceId, status: clientServices.status })
      .from(clientServices).where(eq(clientServices.clientId, client.id)), [], 'subscriptions'),
    safe(db.select({ prefs: userDashboardPreferences.prefs })
      .from(userDashboardPreferences)
      .where(and(
        eq(userDashboardPreferences.userId, userId),
        eq(userDashboardPreferences.clientId, client.id),
      ))
      .limit(1), [], 'dashboardPrefs'),
    studio ? safe(collectNeedsYou(client.id), { items: [], total: 0 }, 'needsYou') : Promise.resolve(null),
  ]);

  const activeIds = new Set(mySubscriptions.filter(s => s.status === 'active').map(s => s.serviceId));

  // Compute active service categories for widget gating.
  const activeServiceCategories = new Set(
    allServices
      .filter(s => activeIds.has(s.id) && s.category && s.category !== 'bundle')
      .map(s => s.category as string),
  );

  // Resolve widget visibility.
  const dashboardPrefs = (dashboardPrefsRow[0]?.prefs ?? {}) as DashboardWidgetPrefs;
  const { visible: visibleWidgets, available: availableWidgets } = resolveVisibleWidgets(
    dashboardPrefs,
    activeServiceCategories,
    brainEnabled,
  );
  // True board membership — a widget can be "not hidden" yet not on the board
  // (default-off + unentitled). The customize toggle must reflect this, not just
  // the hidden set, or it lies about off-by-default widgets.
  const visibleIds = new Set(visibleWidgets.map((w) => w.id));

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Header */}
      <PortalPageHeader
        eyebrow={studio ? <TodayLine tail={needs && needs.total > 0 ? `${needs.total} open` : undefined} /> : 'Workspace'}
        title={studio ? <Greeting name={firstName} /> : (
          <span className="flex items-center gap-2">
            {brainEnabled && <span className="material-icons text-primary">psychology</span>}
            Welcome back{client.company ? `, ${client.company}` : ''}!
          </span>
        )}
        subtitle={needs ? needsYouSummary(needs.total) : "Here's what's happening across your business."}
        actions={brainEnabled ? (
          <Link href="/portal/brain/settings" className={`${pBtnGhost} shrink-0`}>
            <span className="material-icons text-base">settings</span>
            Brain Settings
          </Link>
        ) : undefined}
      />

      {/* Post-onboarding get-started checklist — client component, self-hiding */}
      <GetStartedChecklist />

      {/* AI Credits moved to the sidebar badge + /portal/settings/ai — VEQA-003 */}

      {/* PUX-145: "Needs you" is the page. Top five; the full list is screen 57, not yet built. */}
      {needs && <NeedsYouCard items={needs.items} total={needs.total} />}


      {/* Widget Board — the customizable dashboard (drag/hide/collapse, per-user) */}
      <WidgetBoard
        widgets={visibleWidgets.map(w => ({ id: w.id, title: w.title, icon: w.icon, href: w.href }))}
        allAvailable={availableWidgets.map(w => ({
          id: w.id,
          title: w.title,
          icon: w.icon,
          href: w.href,
          description: w.description,
          visible: visibleIds.has(w.id),
          solution: w.solution,
        }))}
        initialPrefs={dashboardPrefs}
        slots={Object.fromEntries(
          visibleWidgets.map(w => {
            const WidgetComponent = WIDGET_COMPONENTS[w.id];
            return [
              w.id,
              <Suspense key={w.id} fallback={<WidgetSkeleton />}>
                <WidgetComponent clientId={client.id} userId={userId} />
              </Suspense>,
            ];
          }),
        )}
      />
    </div>
  );
}
