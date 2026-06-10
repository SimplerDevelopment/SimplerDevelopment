import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  services, clientServices, clientWebsites, posts,
  emailLists, emailSubscribers, emailCampaigns,
  bookingPages, bookings, pitchDecks,
  userOnboarding, userDashboardPreferences,
} from '@/lib/db/schema';
import { eq, and, count, sql } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getPortalClient } from '@/lib/portal-client';
import { getBrainProfile } from '@/lib/brain/profiles';
import CreditBalance from '@/components/portal/CreditBalance';
import { BrainDashboardWidgetsServer } from '@/components/portal/brain-dashboard';
import { EnableBrainBanner } from '@/components/portal/EnableBrainBanner';
import { Suspense } from 'react';
import { resolveVisibleWidgets, type DashboardWidgetPrefs } from '@/lib/dashboard/widgets';
import { WIDGET_COMPONENTS } from '@/components/portal/dashboard/widgets';
import WidgetBoard from '@/components/portal/dashboard/WidgetBoard';
import { WidgetSkeleton } from '@/components/portal/dashboard/skeletons';

const SERVICE_META: Record<string, { icon: string; color: string; bgColor: string; href: string; description: string; cta: string }> = {
  cms: { icon: 'language', color: 'text-blue-600', bgColor: 'bg-blue-50 dark:bg-blue-950/40', href: '/portal/websites', description: 'Drag-and-drop website builder with unlimited pages, blog, and SEO tools.', cta: 'Build your website' },
  email: { icon: 'email', color: 'text-purple-600', bgColor: 'bg-purple-50 dark:bg-purple-950/40', href: '/portal/email', description: 'Send beautiful campaigns, manage subscribers, and track engagement.', cta: 'Start email marketing' },
  booking: { icon: 'calendar_month', color: 'text-green-600', bgColor: 'bg-green-50 dark:bg-green-950/40', href: '/portal/tools/booking', description: 'Online scheduling with calendar sync, reminders, and embeddable widgets.', cta: 'Set up booking' },
  'pitch-decks': { icon: 'slideshow', color: 'text-amber-600', bgColor: 'bg-amber-50 dark:bg-amber-950/40', href: '/portal/tools/pitch-decks', description: 'AI-powered pitch decks with auto-branding and PDF export.', cta: 'Create a deck' },
  'project-mgmt': { icon: 'view_kanban', color: 'text-indigo-600', bgColor: 'bg-indigo-50 dark:bg-indigo-950/40', href: '/portal/projects', description: 'Kanban boards, sprint planning, and team collaboration.', cta: 'Manage projects' },
  ai: { icon: 'smart_toy', color: 'text-pink-600', bgColor: 'bg-pink-50 dark:bg-pink-950/40', href: '/portal/services', description: 'AI chatbot trained on your content for support and lead capture.', cta: 'Add AI chat' },
  hosting: { icon: 'cloud', color: 'text-slate-600', bgColor: 'bg-slate-50 dark:bg-slate-950/40', href: '/portal/hosting', description: 'Managed hosting with SSL, CDN, daily backups, and 99.9% uptime.', cta: 'Get hosting' },
  bundle: { icon: 'auto_awesome', color: 'text-primary', bgColor: 'bg-primary/10', href: '/portal/services', description: 'All 7 tools in one package with 900K pooled AI tokens.', cta: 'View details' },
};

export default async function PortalDashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/portal/login');

  const userId = parseInt(session.user.id, 10);

  // First-run gate: send brand-new users into the onboarding wizard. We treat
  // "no row" and "row with NULL completed_at" identically — both mean the
  // user has never finished. Self-link from settings can `reopen` later.
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

  const brainProfile = await getBrainProfile(client.id);
  const brainEnabled = brainProfile?.enabled ?? false;

  // Fetch everything in parallel
  const [
    allServices, mySubscriptions,
    websiteSites, emailListRows, bookingPageRows, deckCount,
    dashboardPrefsRow,
  ] = await Promise.all([
    db.select().from(services).where(eq(services.active, true)).orderBy(services.name),
    db.select({ serviceId: clientServices.serviceId, status: clientServices.status })
      .from(clientServices).where(eq(clientServices.clientId, client.id)),
    // Service-specific counts
    db.select({ count: count() }).from(clientWebsites)
      .where(and(eq(clientWebsites.clientId, client.id), eq(clientWebsites.active, true))),
    db.select({ count: count() }).from(emailLists).where(eq(emailLists.clientId, client.id)),
    db.select({ count: count() }).from(bookingPages).where(eq(bookingPages.clientId, client.id)),
    db.select({ count: count() }).from(pitchDecks).where(eq(pitchDecks.clientId, client.id)),
    // Dashboard widget prefs
    db.select({ prefs: userDashboardPreferences.prefs })
      .from(userDashboardPreferences)
      .where(and(
        eq(userDashboardPreferences.userId, userId),
        eq(userDashboardPreferences.clientId, client.id),
      ))
      .limit(1),
  ]);

  const activeIds = new Set(mySubscriptions.filter(s => s.status === 'active').map(s => s.serviceId));

  // Compute active service categories for widget gating
  const activeServiceCategories = new Set(
    allServices
      .filter(s => activeIds.has(s.id) && s.category && s.category !== 'bundle')
      .map(s => s.category as string),
  );

  // Resolve widget visibility
  const dashboardPrefs = (dashboardPrefsRow[0]?.prefs ?? {}) as DashboardWidgetPrefs;
  const { visible: visibleWidgets, available: availableWidgets } = resolveVisibleWidgets(
    dashboardPrefs,
    activeServiceCategories,
    brainEnabled,
  );

  // Get deeper stats for active services
  const siteIds = websiteSites[0]?.count ? (await db.select({ id: clientWebsites.id }).from(clientWebsites)
    .where(and(eq(clientWebsites.clientId, client.id), eq(clientWebsites.active, true)))).map(r => r.id) : [];

  let websitePageCount = 0;
  if (siteIds.length > 0) {
    const r = await db.select({ count: count() }).from(posts)
      .where(sql`${posts.websiteId} IN (${sql.join(siteIds.map(id => sql`${id}`), sql`, `)})`);
    websitePageCount = r[0]?.count ?? 0;
  }

  let emailSubCount = 0;
  let emailCampaignCount = 0;
  if (emailListRows[0]?.count) {
    const listIds = (await db.select({ id: emailLists.id }).from(emailLists).where(eq(emailLists.clientId, client.id))).map(r => r.id);
    if (listIds.length > 0) {
      const s = await db.select({ count: count() }).from(emailSubscribers)
        .where(sql`${emailSubscribers.listId} IN (${sql.join(listIds.map(id => sql`${id}`), sql`, `)}) AND ${emailSubscribers.status} = 'active'`);
      emailSubCount = s[0]?.count ?? 0;
      const c = await db.select({ count: count() }).from(emailCampaigns)
        .where(sql`${emailCampaigns.listId} IN (${sql.join(listIds.map(id => sql`${id}`), sql`, `)}) AND ${emailCampaigns.status} = 'sent'`);
      emailCampaignCount = c[0]?.count ?? 0;
    }
  }

  let upcomingBookings = 0;
  if (bookingPageRows[0]?.count) {
    const b = await db.select({ count: count() }).from(bookings)
      .where(and(eq(bookings.clientId, client.id), eq(bookings.status, 'confirmed'), sql`${bookings.startTime} > NOW()`));
    upcomingBookings = b[0]?.count ?? 0;
  }

  // Categorize services (separate bundle from individual services)
  const bundleService = allServices.find(s => s.category === 'bundle');
  const individualServices = allServices.filter(s => s.category !== 'bundle');
  const activeServices = individualServices.filter(s => activeIds.has(s.id));
  const availableServices = individualServices.filter(s => !activeIds.has(s.id));
  const hasBundle = bundleService && activeIds.has(bundleService.id);
  const showBundleUpsell = !hasBundle && activeServices.length >= 3;
  const bundleSavings = hasBundle ? 0 : individualServices.reduce((sum, s) => sum + s.price, 0) - (bundleService?.price ?? 0);

  // Stats for active service cards
  function getServiceStats(category: string): { label: string; value: string | number }[] {
    switch (category) {
      case 'cms': return [
        { label: 'Websites', value: websiteSites[0]?.count ?? 0 },
        { label: 'Pages', value: websitePageCount },
      ];
      case 'email': return [
        { label: 'Subscribers', value: emailSubCount },
        { label: 'Sent', value: emailCampaignCount },
      ];
      case 'booking': return [
        { label: 'Pages', value: bookingPageRows[0]?.count ?? 0 },
        { label: 'Upcoming', value: upcomingBookings },
      ];
      case 'pitch-decks': return [
        { label: 'Decks', value: deckCount[0]?.count ?? 0 },
      ];
      default: return [];
    }
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            {brainEnabled && <span className="material-icons text-primary">psychology</span>}
            Welcome back{client.company ? `, ${client.company}` : ''}!
          </h1>
          <p className="text-muted-foreground mt-1">Here&apos;s what&apos;s happening across your business.</p>
        </div>
        {brainEnabled && (
          <Link
            href="/portal/brain/settings"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md border border-border text-foreground hover:bg-accent shrink-0"
          >
            <span className="material-icons text-base">settings</span>
            Brain Settings
          </Link>
        )}
      </div>

      {/* Brain — operational layer (top of dashboard when enabled).
          Streams in via Suspense so the rest of the dashboard doesn't block
          on the brain dashboard's cached-but-still-not-instant fetch. */}
      {brainEnabled ? (
        <BrainDashboardWidgetsServer clientId={client.id} />
      ) : (
        <EnableBrainBanner />
      )}

      {/* Active Services */}
      {activeServices.length > 0 && (
        <div>
          <h2 className="font-semibold text-foreground mb-4">Your Services</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {activeServices.map(svc => {
              const meta = SERVICE_META[svc.category] ?? SERVICE_META.hosting;
              const stats = getServiceStats(svc.category);
              return (
                <Link key={svc.id} href={meta.href}
                  className="bg-card border border-border rounded-xl p-5 hover:border-primary/50 hover:shadow-sm transition-all group"
                >
                  <div className="flex items-center gap-3 mb-4">
                    <div className={`w-10 h-10 rounded-lg ${meta.bgColor} flex items-center justify-center`}>
                      <span className={`material-icons text-xl ${meta.color}`}>{meta.icon}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-foreground text-sm">{svc.name}</p>
                      <p className="text-[10px] text-green-600 font-medium uppercase tracking-wider">Active</p>
                    </div>
                    <span className="material-icons text-muted-foreground text-lg opacity-0 group-hover:opacity-100 transition-opacity">arrow_forward</span>
                  </div>
                  {stats.length > 0 && (
                    <div className="flex gap-6">
                      {stats.map(st => (
                        <div key={st.label}>
                          <p className="text-lg font-bold text-foreground">{st.value}</p>
                          <p className="text-xs text-muted-foreground">{st.label}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* AI Credits */}
      <CreditBalance />

      {/* Widget Board — replaces the old static Recent Activity grid */}
      <WidgetBoard
        widgets={visibleWidgets.map(w => ({ id: w.id, title: w.title, icon: w.icon, href: w.href }))}
        allAvailable={availableWidgets.map(w => ({
          id: w.id,
          title: w.title,
          icon: w.icon,
          href: w.href,
          description: w.description,
          visible: !dashboardPrefs.hidden?.includes(w.id),
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

      {/* Bundle Upsell */}
      {showBundleUpsell && bundleService && (
        <div className="bg-gradient-to-r from-primary/10 via-purple-500/10 to-pink-500/10 border border-primary/20 rounded-xl p-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="material-icons text-primary">auto_awesome</span>
                <h3 className="font-bold text-foreground">Save ${(bundleSavings / 100).toFixed(0)}/mo with All-In-One</h3>
              </div>
              <p className="text-sm text-muted-foreground max-w-lg">
                You&apos;re using {activeServices.length} services individually. Get all 7 tools for ${(bundleService.price / 100).toFixed(0)}/mo with 900K pooled AI tokens and higher usage limits.
              </p>
            </div>
            <Link href={`/portal/services/${bundleService.id}/request`}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors shrink-0"
            >
              <span className="material-icons text-base">upgrade</span>
              Switch to All-In-One
            </Link>
          </div>
        </div>
      )}

      {/* Available Services (Upsell) */}
      {availableServices.length > 0 && !hasBundle && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <h2 className="font-semibold text-foreground">Grow Your Business</h2>
            <Link href="/portal/services" className="text-xs text-primary hover:underline ml-auto">View all services</Link>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {availableServices.slice(0, 6).map(svc => {
              const meta = SERVICE_META[svc.category] ?? SERVICE_META.hosting;
              return (
                <div key={svc.id} className="bg-card border border-border rounded-xl p-5 flex flex-col">
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`w-10 h-10 rounded-lg ${meta.bgColor} flex items-center justify-center`}>
                      <span className={`material-icons text-xl ${meta.color}`}>{meta.icon}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-foreground text-sm">{svc.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {svc.price ? `$${(svc.price / 100).toFixed(0)}/${svc.billingCycle === 'monthly' ? 'mo' : svc.billingCycle === 'annually' ? 'yr' : 'once'}` : 'Custom'}
                      </p>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mb-4 flex-1">{meta.description}</p>
                  <Link href={`/portal/services/${svc.id}/request`}
                    className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg border border-primary/20 text-primary hover:bg-primary hover:text-primary-foreground transition-colors"
                  >
                    <span className="material-icons text-sm">add</span>
                    {meta.cta}
                  </Link>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="bg-card border border-border rounded-xl p-6">
        <h2 className="font-semibold text-foreground mb-4">Quick Actions</h2>
        <div className="flex flex-wrap gap-3">
          <Link href="/portal/tickets/new" className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors">
            <span className="material-icons text-base">add</span>
            Open Support Ticket
          </Link>
          <Link href="/portal/projects" className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-sm font-medium text-foreground hover:bg-accent transition-colors">
            <span className="material-icons text-base">view_kanban</span>
            View Projects
          </Link>
          <Link href="/portal/services" className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-sm font-medium text-foreground hover:bg-accent transition-colors">
            <span className="material-icons text-base">storefront</span>
            Browse Services
          </Link>
        </div>
      </div>
    </div>
  );
}
