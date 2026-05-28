import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { services, clientServices } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';

const categoryIcon: Record<string, string> = {
  cms: 'language',
  email: 'email',
  booking: 'calendar_month',
  'pitch-decks': 'slideshow',
  'project-mgmt': 'view_kanban',
  ai: 'smart_toy',
  domain: 'public',
  hosting: 'cloud',
  development: 'code',
  maintenance: 'build',
  plugins: 'extension',
};

const categoryPath: Record<string, string> = {
  cms: '/portal/websites',
  email: '/portal/email',
  booking: '/portal/tools/booking',
  'pitch-decks': '/portal/tools/pitch-decks',
  hosting: '/portal/hosting',
  plugins: '/portal/apps',
};

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return NextResponse.json({ success: true, data: [] });

  const [allServices, myServices] = await Promise.all([
    db.select().from(services).where(eq(services.active, true)).orderBy(services.name),
    db.select({ serviceId: clientServices.serviceId, status: clientServices.status })
      .from(clientServices)
      .where(eq(clientServices.clientId, client.id)),
  ]);

  const activeIds = new Set(myServices.filter(s => s.status === 'active').map(s => s.serviceId));

  // 'plugins' is surfaced via the dedicated Apps group (see lib/portal-nav.ts
  // + loadUserApps + isClientEntitledToApp). Keeping it in this generic
  // services list leaks the plugin row to every tenant as a top-level item,
  // bypassing the registered_apps.allowedClientIds gate. Hide it here.
  const hiddenCategories = new Set(['hosting', 'plugins']);

  const data = allServices.filter(svc => !hiddenCategories.has(svc.category)).map(svc => ({
    id: svc.id,
    name: svc.name,
    category: svc.category,
    icon: categoryIcon[svc.category] ?? 'category',
    href: categoryPath[svc.category] ?? `/portal/services/${svc.id}/request`,
    subscribed: activeIds.has(svc.id),
  }));

  return NextResponse.json({ success: true, data });
}
