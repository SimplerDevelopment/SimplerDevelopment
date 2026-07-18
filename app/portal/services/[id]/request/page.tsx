import { db } from '@/lib/db';
import { services, SurveyField } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { redirect, notFound } from 'next/navigation';
import ServiceRequestForm from '@/components/portal/ServiceRequestForm';

export default async function ServiceRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect('/portal/login');

  const { id } = await params;
  const serviceId = parseInt(id, 10);
  if (isNaN(serviceId)) notFound();

  const [svc] = await db.select().from(services).where(eq(services.id, serviceId)).limit(1);
  if (!svc || !svc.active) notFound();

  return (
    <ServiceRequestForm
      serviceId={svc.id}
      serviceName={svc.name}
      serviceDescription={svc.description}
      surveyFields={(svc.surveyFields ?? []) as SurveyField[]}
    />
  );
}
