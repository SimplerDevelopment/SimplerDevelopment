import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { getPortalClient, checkServiceSubscription, getServiceByCategory } from '@/lib/portal-client';
import ServicePaywall from '@/components/portal/ServicePaywall';

export default async function EmailLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) redirect('/portal/login');

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) redirect('/portal/dashboard');

  const subscription = await checkServiceSubscription(client.id, 'email');
  if (!subscription) {
    const service = await getServiceByCategory('email');
    if (service) {
      return (
        <ServicePaywall
          serviceName={service.name}
          serviceDescription={service.description}
          price={service.price}
          billingCycle={service.billingCycle ?? 'monthly'}
          features={(service.features ?? []) as string[]}
          serviceId={service.id}
          icon="email"
        />
      );
    }
    return (
      <div className="max-w-lg mx-auto mt-8 text-center space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
          <span className="material-icons text-3xl text-primary">email</span>
        </div>
        <h1 className="text-2xl font-bold text-foreground">Subscription Required</h1>
        <p className="text-muted-foreground text-sm">
          Email Marketing requires an active subscription. Contact us to get started.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
