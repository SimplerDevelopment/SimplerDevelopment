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

  // The wizard renders its own full-bleed split-screen shell; `PortalLayoutClient`
  // strips the portal sidebar/topbar for `/portal/onboarding` (see isOnboarding).
  return <OnboardingWizard initialState={state} />;
}
