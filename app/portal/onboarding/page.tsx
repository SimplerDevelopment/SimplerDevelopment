import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { getPortalClient } from '@/lib/portal-client';
import { loadOnboarding } from '@/lib/onboarding/service';
import OnboardingWizard from '@/components/portal/onboarding/OnboardingWizard';

export const dynamic = 'force-dynamic';

export default async function OnboardingPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/portal/login?callbackUrl=/portal/onboarding');

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  const state = await loadOnboarding(userId, client?.id ?? null);

  return (
    <div className="min-h-[calc(100vh-4rem)] -mx-4 -my-6 sm:-mx-6 sm:-my-8 bg-gradient-to-br from-background via-background to-primary/5">
      <OnboardingWizard initialState={state} />
    </div>
  );
}
