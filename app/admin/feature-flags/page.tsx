// Admin per-client feature-flags matrix (PUX-135). RSC page — loads the
// matrix directly via the shared lib/admin/feature-flags loader (the same
// one the GET route uses, so page and API can't drift) and hands it to the
// client component for the interactive toggles.

import { redirect } from 'next/navigation';
import { requireStaffSession } from '@/lib/admin/auth';
import { loadFeatureFlagMatrix } from '@/lib/admin/feature-flags';
import { FeatureFlagsMatrix } from './FeatureFlagsMatrix';

export default async function AdminFeatureFlagsPage() {
  const session = await requireStaffSession();
  if (!session) {
    redirect('/portal/login');
  }

  const initial = await loadFeatureFlagMatrix();

  return <FeatureFlagsMatrix initial={initial} />;
}
