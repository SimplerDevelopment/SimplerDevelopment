import { db } from '@/lib/db';
import { suggestedProjects, clients, SurveyField } from '@/lib/db/schema';
import { eq, isNull, or, and } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { redirect, notFound } from 'next/navigation';
import SuggestedProjectRequestForm from '@/components/portal/SuggestedProjectRequestForm';

// Matches the gradient map in the detail page
const heroGradients: Record<string, string> = {
  website:     'from-blue-600 via-blue-500 to-cyan-500',
  ecommerce:   'from-emerald-600 via-emerald-500 to-teal-400',
  mobile:      'from-violet-600 via-purple-500 to-fuchsia-500',
  maintenance: 'from-amber-500 via-orange-500 to-red-400',
  branding:    'from-rose-500 via-pink-500 to-fuchsia-400',
  development: 'from-slate-700 via-slate-600 to-indigo-600',
  other:       'from-primary via-primary/80 to-primary/60',
};

export default async function SuggestedProjectRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect('/portal/login');

  const { id } = await params;
  const projectId = parseInt(id, 10);
  if (isNaN(projectId)) notFound();

  const userId = parseInt(session.user.id, 10);
  const [client] = await db.select().from(clients).where(eq(clients.userId, userId)).limit(1);
  if (!client) redirect('/portal/dashboard');

  const [item] = await db
    .select()
    .from(suggestedProjects)
    .where(
      and(
        eq(suggestedProjects.id, projectId),
        eq(suggestedProjects.active, true),
        or(
          isNull(suggestedProjects.clientId),
          eq(suggestedProjects.clientId, client.id),
        ),
      ),
    )
    .limit(1);

  if (!item) notFound();

  return (
    <SuggestedProjectRequestForm
      projectId={item.id}
      projectTitle={item.title}
      projectDescription={item.description}
      surveyFields={(item.surveyFields ?? []) as SurveyField[]}
      heroGradient={heroGradients[item.category] ?? heroGradients.other}
    />
  );
}
