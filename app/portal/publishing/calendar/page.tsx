// Publishing Command Center — calendar view (PUB-5).
//
// Server component that resolves the per-client publishing session and hands
// the projectId + clientId to the client-side PublishingCalendar. The actual
// data fetch happens client-side via /api/portal/publishing/calendar so the
// month/week range can be driven by user navigation without a full page
// reload.

import { getPublishingSession } from '@/lib/publishing/active-client';
import PublishingCalendar from '@/components/portal/publishing/PublishingCalendar';

export const dynamic = 'force-dynamic';

export default async function PublishingCalendarPage() {
  const session = await getPublishingSession();
  return (
    <PublishingCalendar
      projectId={session.project.id}
      clientId={session.clientId}
    />
  );
}
