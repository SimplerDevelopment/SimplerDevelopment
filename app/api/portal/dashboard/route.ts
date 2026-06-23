import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  services, clientServices, clientWebsites, posts,
  emailLists, emailSubscribers, emailCampaigns,
  bookingPages, bookings, pitchDecks,
  projects, supportTickets, invoices,
} from '@/lib/db/schema';
import { eq, and, ne, count, sum, sql } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return NextResponse.json({ error: 'No client' }, { status: 404 });

  // Fetch all services and subscriptions in parallel
  const [allServices, mySubscriptions] = await Promise.all([
    db.select().from(services).where(eq(services.active, true)).orderBy(services.name),
    db.select({ serviceId: clientServices.serviceId, status: clientServices.status })
      .from(clientServices)
      .where(eq(clientServices.clientId, client.id)),
  ]);

  const activeIds = new Set(mySubscriptions.filter(s => s.status === 'active').map(s => s.serviceId));

  // Fetch stats for active services in parallel
  const [
    websiteStats,
    emailStats,
    bookingStats,
    deckStats,
    projectStats,
    ticketStats,
    invoiceStats,
  ] = await Promise.all([
    // Websites: count sites, total pages, published pages
    activeIds.size > 0 ? (async () => {
      const sites = await db.select({ count: count() }).from(clientWebsites)
        .where(and(eq(clientWebsites.clientId, client.id), eq(clientWebsites.active, true)));
      const siteRows = await db.select({ id: clientWebsites.id }).from(clientWebsites)
        .where(and(eq(clientWebsites.clientId, client.id), eq(clientWebsites.active, true)));
      const siteIds = siteRows.map(r => r.id);
      let totalPages = 0;
      let publishedPages = 0;
      if (siteIds.length > 0) {
        const pageStats = await db.select({ count: count() }).from(posts)
          .where(sql`${posts.websiteId} IN (${sql.join(siteIds.map(id => sql`${id}`), sql`, `)})`);
        totalPages = pageStats[0]?.count ?? 0;
        const pubStats = await db.select({ count: count() }).from(posts)
          .where(sql`${posts.websiteId} IN (${sql.join(siteIds.map(id => sql`${id}`), sql`, `)}) AND ${posts.published} = true`);
        publishedPages = pubStats[0]?.count ?? 0;
      }
      return { sites: sites[0]?.count ?? 0, totalPages, publishedPages };
    })() : Promise.resolve(null),

    // Email: lists, subscribers, campaigns sent, avg open rate
    (async () => {
      const lists = await db.select({ count: count() }).from(emailLists)
        .where(eq(emailLists.clientId, client.id));
      if ((lists[0]?.count ?? 0) === 0) return null;
      const listRows = await db.select({ id: emailLists.id }).from(emailLists)
        .where(eq(emailLists.clientId, client.id));
      const listIds = listRows.map(r => r.id);
      let totalSubs = 0;
      let sentCampaigns = 0;
      let avgOpenRate = 0;
      if (listIds.length > 0) {
        const subStats = await db.select({ count: count() }).from(emailSubscribers)
          .where(sql`${emailSubscribers.listId} IN (${sql.join(listIds.map(id => sql`${id}`), sql`, `)}) AND ${emailSubscribers.status} = 'active'`);
        totalSubs = subStats[0]?.count ?? 0;
        const campStats = await db.select({ count: count(), avgOpen: sql<number>`AVG(CASE WHEN total_sent > 0 THEN total_opened * 100.0 / total_sent ELSE 0 END)` })
          .from(emailCampaigns)
          .where(sql`${emailCampaigns.listId} IN (${sql.join(listIds.map(id => sql`${id}`), sql`, `)}) AND ${emailCampaigns.status} = 'sent'`);
        sentCampaigns = campStats[0]?.count ?? 0;
        avgOpenRate = Math.round(Number(campStats[0]?.avgOpen ?? 0));
      }
      return { lists: lists[0]?.count ?? 0, subscribers: totalSubs, campaigns: sentCampaigns, openRate: avgOpenRate };
    })(),

    // Booking: pages, upcoming bookings
    (async () => {
      const pages = await db.select({ count: count() }).from(bookingPages)
        .where(eq(bookingPages.clientId, client.id));
      if ((pages[0]?.count ?? 0) === 0) return null;
      const upcoming = await db.select({ count: count() }).from(bookings)
        .where(and(
          eq(bookings.clientId, client.id),
          eq(bookings.status, 'confirmed'),
          sql`${bookings.startTime} > NOW()`,
        ));
      return { pages: pages[0]?.count ?? 0, upcomingBookings: upcoming[0]?.count ?? 0 };
    })(),

    // Pitch Decks: count
    (async () => {
      const decks = await db.select({ count: count() }).from(pitchDecks)
        .where(eq(pitchDecks.clientId, client.id));
      return (decks[0]?.count ?? 0) > 0 ? { count: decks[0]?.count ?? 0 } : null;
    })(),

    // Projects
    db.select({ count: count() }).from(projects)
      .where(and(eq(projects.clientId, client.id), ne(projects.status, 'archived'))),

    // Support tickets
    db.select({ count: count() }).from(supportTickets)
      .where(and(eq(supportTickets.clientId, client.id), ne(supportTickets.status, 'closed'))),

    // Invoices
    db.select({ count: count(), total: sum(invoices.total) }).from(invoices)
      .where(and(eq(invoices.clientId, client.id), eq(invoices.status, 'sent'))),
  ]);

  // Build service cards
  const categoryMeta: Record<string, { icon: string; color: string; href: string; description: string; cta: string }> = {
    cms: { icon: 'language', color: 'blue', href: '/portal/websites', description: 'Drag-and-drop website builder with unlimited pages, blog, SEO tools, and custom content types.', cta: 'Build your website' },
    email: { icon: 'email', color: 'purple', href: '/portal/email', description: 'Send beautiful email campaigns, manage subscribers, and track opens and clicks.', cta: 'Start email marketing' },
    booking: { icon: 'calendar_month', color: 'green', href: '/portal/tools/booking', description: 'Online appointment scheduling with Google Calendar sync, reminders, and embeddable widgets.', cta: 'Set up booking' },
    'pitch-decks': { icon: 'slideshow', color: 'amber', href: '/portal/tools/pitch-decks', description: 'AI-powered pitch deck generator with auto-branding, version history, and PDF export.', cta: 'Create a deck' },
    'project-mgmt': { icon: 'view_kanban', color: 'indigo', href: '/portal/projects', description: 'Kanban boards, sprint planning, file sharing, and team collaboration for your projects.', cta: 'Manage projects' },
    ai: { icon: 'smart_toy', color: 'pink', href: '/portal/services', description: 'AI chatbot trained on your content for lead capture, customer support, and website engagement.', cta: 'Add AI chat' },
    hosting: { icon: 'cloud', color: 'slate', href: '/portal/hosting', description: 'Managed hosting with free SSL, CDN, daily backups, and 99.9% uptime SLA.', cta: 'Get hosting' },
    plugins: { icon: 'extension', color: 'teal', href: '/portal/apps', description: 'Custom-built dashboards and automations plugged into your portal as first-class apps.', cta: 'Open app' },
  };

  const serviceCards = allServices.map(svc => {
    const meta = categoryMeta[svc.category] ?? { icon: 'category', color: 'gray', href: '/portal/services', description: svc.description || '', cta: 'Get started' };
    const subscribed = activeIds.has(svc.id);

    let stats: Record<string, string | number> | null = null;
    if (subscribed) {
      if (svc.category === 'cms' && websiteStats) {
        stats = { 'Websites': websiteStats.sites, 'Total Pages': websiteStats.totalPages, 'Published': websiteStats.publishedPages };
      } else if (svc.category === 'email' && emailStats) {
        stats = { 'Subscribers': emailStats.subscribers, 'Campaigns Sent': emailStats.campaigns, 'Avg Open Rate': `${emailStats.openRate}%` };
      } else if (svc.category === 'booking' && bookingStats) {
        stats = { 'Booking Pages': bookingStats.pages, 'Upcoming': bookingStats.upcomingBookings };
      } else if (svc.category === 'pitch-decks' && deckStats) {
        stats = { 'Decks Created': deckStats.count };
      }
    }

    return {
      id: svc.id,
      name: svc.name,
      category: svc.category,
      price: svc.price,
      billingCycle: svc.billingCycle,
      features: svc.features,
      subscribed,
      stats,
      ...meta,
    };
  });

  return NextResponse.json({
    company: client.company,
    core: {
      projects: projectStats[0]?.count ?? 0,
      tickets: ticketStats[0]?.count ?? 0,
      invoices: invoiceStats[0]?.count ?? 0,
      amountDue: Number(invoiceStats[0]?.total ?? 0),
    },
    services: serviceCards,
  });
}
