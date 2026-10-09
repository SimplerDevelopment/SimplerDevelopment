'use client';

/**
 * PUX-165 (design doc screen 24): the Review queue as a real room-level page.
 * Same data and handlers as the Tasks page's Review tab — ReviewTab is shared
 * — with the studio rules applied: first pending row gets the teal Approve,
 * the rest stay ghost. Studio-only: app/portal/brain/review/page.tsx keeps the
 * redirect to /portal/brain/tasks?tab=review when the flag is off.
 */

import { PortalPageHeader } from '@/components/portal/PortalPageHeader';
import ReviewTab from '@/components/brain/review/ReviewTab';

const noop = () => {};

export default function ReviewQueuePage() {
  return (
    <div className="max-w-5xl mx-auto py-6 px-4 space-y-4">
      <PortalPageHeader
        eyebrow="Brain · Set up"
        title={<span className="flex items-center gap-2"><span className="material-icons text-primary">rate_review</span>Review queue</span>}
        subtitle="What the Brain extracted from your calls and forms, ready for your approval."
        className="mb-0 pb-3"
      />
      {/* The Tasks page uses onPendingChange to badge its tab; this page has no tab to badge. */}
      <ReviewTab onPendingChange={noop} studio />
    </div>
  );
}
