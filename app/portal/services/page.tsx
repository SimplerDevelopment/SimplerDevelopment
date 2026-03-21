import { db } from '@/lib/db';
import { services, clientServices, clients } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { formatCents } from '@/lib/portal';
import Link from 'next/link';

const categoryIcon: Record<string, string> = {
  domain: 'language',
  hosting: 'cloud',
  development: 'code',
  maintenance: 'build',
};

const categoryLabel: Record<string, string> = {
  domain: 'White Label Domains',
  hosting: 'White Label Hosting (Railway)',
  development: 'Development',
  maintenance: 'Maintenance',
};

export default async function PortalServicesPage({
  searchParams,
}: {
  searchParams: Promise<{ purchased?: string; requested?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect('/portal/login');

  const userId = parseInt(session.user.id, 10);
  const [client] = await db.select().from(clients).where(eq(clients.userId, userId)).limit(1);
  if (!client) redirect('/portal/dashboard');

  const { purchased, requested } = await searchParams;

  const [allServices, myServices] = await Promise.all([
    db.select().from(services).where(eq(services.active, true)).orderBy(services.category, services.name),
    db.select({ serviceId: clientServices.serviceId, status: clientServices.status })
      .from(clientServices)
      .where(eq(clientServices.clientId, client.id)),
  ]);

  const myServiceIds = new Set(myServices.filter(s => s.status === 'active').map(s => s.serviceId));

  const grouped = allServices.reduce((acc, svc) => {
    if (!acc[svc.category]) acc[svc.category] = [];
    acc[svc.category].push(svc);
    return acc;
  }, {} as Record<string, typeof allServices>);

  const categories = Object.keys(grouped);

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Services</h1>
        <p className="text-muted-foreground mt-1">White-label domains, hosting, and more — powered by Simpler Development.</p>
      </div>

      {purchased === '1' && (
        <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-xl text-green-800">
          <span className="material-icons text-green-600">check_circle</span>
          <div>
            <p className="font-medium text-sm">Payment successful!</p>
            <p className="text-xs mt-0.5">Your service is being activated. It will appear as Active below shortly.</p>
          </div>
        </div>
      )}

      {requested === '1' && (
        <div className="flex items-center gap-3 p-4 bg-blue-50 border border-blue-200 rounded-xl text-blue-800">
          <span className="material-icons text-blue-600">check_circle</span>
          <div>
            <p className="font-medium text-sm">Request submitted!</p>
            <p className="text-xs mt-0.5">We&apos;ve received your request and will be in touch shortly.</p>
          </div>
        </div>
      )}

      {categories.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-12 text-center">
          <span className="material-icons text-5xl text-muted-foreground">storefront</span>
          <h3 className="mt-4 font-semibold text-foreground">No services available</h3>
          <p className="mt-2 text-sm text-muted-foreground">Check back soon or contact us about custom services.</p>
        </div>
      ) : (
        categories.map((category) => (
          <section key={category}>
            <div className="flex items-center gap-2 mb-4">
              <span className="material-icons text-primary">{categoryIcon[category] ?? 'category'}</span>
              <h2 className="text-lg font-semibold text-foreground">{categoryLabel[category] ?? category}</h2>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {grouped[category].map((svc) => {
                const owned = myServiceIds.has(svc.id);
                const hasSurvey = (svc.surveyFields as unknown[])?.length > 0;
                return (
                  <div key={svc.id} className={`bg-card border rounded-xl p-5 flex flex-col ${owned ? 'border-primary/50 bg-primary/5' : 'border-border'}`}>
                    {owned && (
                      <div className="flex items-center gap-1 text-xs text-primary font-medium mb-2">
                        <span className="material-icons text-xs">check_circle</span>
                        Active
                      </div>
                    )}
                    <h3 className="font-semibold text-foreground">{svc.name}</h3>
                    {svc.description && (
                      <p className="mt-1 text-sm text-muted-foreground flex-1">{svc.description}</p>
                    )}
                    {(svc.features as string[]).length > 0 && (
                      <ul className="mt-3 space-y-1">
                        {(svc.features as string[]).map((f, i) => (
                          <li key={i} className="text-xs text-muted-foreground flex items-center gap-1">
                            <span className="material-icons text-xs text-green-600">check</span>
                            {f}
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="mt-4 flex items-center justify-between">
                      <div>
                        <span className="text-xl font-bold text-foreground">{formatCents(svc.price)}</span>
                        {svc.billingCycle !== 'once' && (
                          <span className="text-xs text-muted-foreground">/{svc.billingCycle}</span>
                        )}
                      </div>
                      {owned ? (
                        <span className="text-xs text-primary flex items-center gap-0.5 font-medium">
                          <span className="material-icons text-xs">verified</span>Active
                        </span>
                      ) : (
                        <Link
                          href={`/portal/services/${svc.id}/request`}
                          className="flex items-center gap-1 text-xs px-3 py-1.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
                        >
                          <span className="material-icons text-xs">{hasSurvey ? 'assignment' : 'send'}</span>
                          {hasSurvey ? 'Get Started' : 'Request Service'}
                        </Link>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))
      )}

      <div className="bg-muted/50 border border-border rounded-xl p-6 text-center">
        <span className="material-icons text-2xl text-muted-foreground">help_outline</span>
        <p className="mt-2 text-sm text-muted-foreground">Need something not listed here?</p>
        <a href="/contact" className="mt-2 inline-flex items-center gap-1 text-sm text-primary hover:underline">
          Contact us for a custom quote
          <span className="material-icons text-sm">arrow_forward</span>
        </a>
      </div>
    </div>
  );
}
