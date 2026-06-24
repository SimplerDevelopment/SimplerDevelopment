import { db } from '@/lib/db';
import { services, clientServices, clients } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { formatCents } from '@/lib/portal';
import Link from 'next/link';
import BuyServiceButton from './_components/BuyServiceButton';
import { PortalPageHeader } from '@/components/portal/PortalPageHeader';
import { pBtnPrimary } from '@/components/portal/portal-ui';

const categoryIcon: Record<string, string> = {
  cms: 'web',
  email: 'email',
  booking: 'calendar_month',
  'project-mgmt': 'view_kanban',
  ai: 'smart_toy',
  domain: 'language',
  hosting: 'cloud',
  development: 'code',
  maintenance: 'build',
  plugins: 'extension',
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
    db.select().from(services).where(eq(services.active, true)).orderBy(services.name),
    db.select({ serviceId: clientServices.serviceId, status: clientServices.status })
      .from(clientServices)
      .where(eq(clientServices.clientId, client.id)),
  ]);

  const myServiceIds = new Set(myServices.filter(s => s.status === 'active').map(s => s.serviceId));

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <PortalPageHeader
        eyebrow="Catalog"
        title="Add a Service"
        subtitle="Extend your workspace with powerful add-ons managed by Simpler Development."
      />

      {purchased === '1' && (
        <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-xl text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-300">
          <span className="material-icons text-green-600">check_circle</span>
          <div>
            <p className="font-medium text-sm">Payment successful!</p>
            <p className="text-xs mt-0.5">Your service is being activated. It will appear as active shortly.</p>
          </div>
        </div>
      )}

      {requested === '1' && (
        <div className="flex items-center gap-3 p-4 bg-blue-50 border border-blue-200 rounded-xl text-blue-800 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-300">
          <span className="material-icons text-blue-600">check_circle</span>
          <div>
            <p className="font-medium text-sm">Request submitted!</p>
            <p className="text-xs mt-0.5">We&apos;ve received your request and will be in touch shortly.</p>
          </div>
        </div>
      )}

      {allServices.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-12 text-center">
          <span className="material-icons text-5xl text-muted-foreground">storefront</span>
          <h3 className="mt-4 font-semibold text-foreground">No services available</h3>
          <p className="mt-2 text-sm text-muted-foreground">Check back soon or contact us about custom services.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {allServices.map((svc) => {
            const owned = myServiceIds.has(svc.id);
            const hasSurvey = (svc.surveyFields as unknown[])?.length > 0;
            const icon = categoryIcon[svc.category] ?? 'category';
            const features = svc.features as string[];

            return (
              <div
                key={svc.id}
                className={`bg-card border rounded-xl p-5 transition-colors ${
                  owned ? 'border-primary/40 bg-primary/3' : 'border-border hover:border-border/80'
                }`}
              >
                <div className="flex items-start gap-4">
                  {/* Icon */}
                  <div className={`shrink-0 w-11 h-11 rounded-xl flex items-center justify-center ${owned ? 'bg-primary/10' : 'bg-muted'}`}>
                    <span className={`material-icons text-xl ${owned ? 'text-primary' : 'text-muted-foreground'}`}>
                      {icon}
                    </span>
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-foreground">{svc.name}</h3>
                          {owned && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium">
                              <span className="material-icons text-xs">check_circle</span>
                              Active
                            </span>
                          )}
                        </div>
                        {svc.description && (
                          <p className="text-sm text-muted-foreground mt-0.5">{svc.description}</p>
                        )}
                      </div>

                      {/* Price + CTA — desktop */}
                      <div className="hidden sm:flex flex-col items-end gap-2 shrink-0">
                        <div className="text-right">
                          <span className="text-lg font-bold text-foreground">{formatCents(svc.price)}</span>
                          {svc.billingCycle !== 'once' && (
                            <span className="text-xs text-muted-foreground">/{svc.billingCycle}</span>
                          )}
                        </div>
                        {owned ? (
                          <span className="text-xs text-primary flex items-center gap-0.5 font-medium">
                            <span className="material-icons text-xs">verified</span>
                            Subscribed
                          </span>
                        ) : hasSurvey ? (
                          <Link
                            href={`/portal/services/${svc.id}/request`}
                            className={pBtnPrimary}
                          >
                            Get Started
                            <span className="material-icons text-base">arrow_forward</span>
                          </Link>
                        ) : (
                          <BuyServiceButton serviceId={svc.id} label="Buy" />
                        )}
                      </div>
                    </div>

                    {/* Features */}
                    {features.length > 0 && (
                      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3">
                        {features.map((f, i) => (
                          <span key={i} className="flex items-center gap-1 text-xs text-muted-foreground">
                            <span className="material-icons text-xs text-green-500">check</span>
                            {f}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Price + CTA — mobile */}
                    <div className="flex sm:hidden items-center justify-between mt-4 pt-3 border-t border-border">
                      <div>
                        <span className="text-base font-bold text-foreground">{formatCents(svc.price)}</span>
                        {svc.billingCycle !== 'once' && (
                          <span className="text-xs text-muted-foreground">/{svc.billingCycle}</span>
                        )}
                      </div>
                      {owned ? (
                        <span className="text-xs text-primary flex items-center gap-0.5 font-medium">
                          <span className="material-icons text-xs">verified</span>
                          Subscribed
                        </span>
                      ) : hasSurvey ? (
                        <Link
                          href={`/portal/services/${svc.id}/request`}
                          className={pBtnPrimary}
                        >
                          Get Started
                          <span className="material-icons text-base">arrow_forward</span>
                        </Link>
                      ) : (
                        <BuyServiceButton serviceId={svc.id} label="Buy" />
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex items-center gap-3 p-4 bg-muted/40 border border-border rounded-xl">
        <span className="material-icons text-muted-foreground">help_outline</span>
        <p className="text-sm text-muted-foreground flex-1">Need something not listed here?</p>
        <Link
          href="/portal/tickets/new"
          className="flex items-center gap-1 text-sm text-primary hover:underline shrink-0"
        >
          Contact us
          <span className="material-icons text-sm">arrow_forward</span>
        </Link>
      </div>
    </div>
  );
}
