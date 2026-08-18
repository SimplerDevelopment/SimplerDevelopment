/**
 * Public booking route.
 *
 * A thin server shell around the real booking widget (`BookingPageClient` →
 * `BookingFormInline`), for the same reason as `/s/[slug]`: an external reviewer
 * following an approval link must see the REAL page — live availability, real
 * staff, real pricing — with the approval bar overlaid (PUX-060/070), and
 * resolving that credential requires the server.
 *
 * Reservations stay impossible for a reviewer. Every booking write path is
 * refused by the middleware gate while an approval cookie is present, and none
 * of them is shimmed — see the note on PUX-070 about why this surface, alone,
 * does not fabricate a confirmation.
 */

import { db } from '@/lib/db';
import { bookingPages } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { resolveApprovalContext, approvalNoIndexMetadata } from '@/lib/mcp/approval-mode';
import { ApprovalBar } from '@/components/approvals/ApprovalBar';
import { BookingPageClient } from './BookingPageClient';

interface PageProps {
  params: Promise<{ slug: string }>;
}

/**
 * Keeps an approval-mode render out of search results (PUX-079). Public visits
 * are unaffected — this returns nothing at all without an approval cookie, so
 * the page keeps whatever the app's default metadata says.
 */
export async function generateMetadata() {
  return approvalNoIndexMetadata();
}

export default async function PublicBookingPage({ params }: PageProps) {
  const { slug } = await params;

  // Cheap id/owner lookup only — the widget fetches its own content through the
  // public API, which is where inactive-page access is granted.
  const [page] = await db
    .select({ id: bookingPages.id, clientId: bookingPages.clientId, title: bookingPages.title })
    .from(bookingPages)
    .where(eq(bookingPages.slug, slug))
    .limit(1);

  const approval = page ? await resolveApprovalContext('booking_page', page.id) : null;
  // A live link for this page is not proof of tenancy; the owner check is here.
  const viaApproval = !!approval && !!page && approval.clientId === page.clientId;

  return (
    <>
      <BookingPageClient slug={slug} />
      {viaApproval && approval && (
        <ApprovalBar
          entityLabel="Booking page"
          title={page.title}
          summary={approval.summary}
          status={approval.status}
          expiresAt={approval.expiresAt ? approval.expiresAt.toISOString() : null}
          reviewerName={approval.reviewerName}
          reviewedAt={approval.reviewedAt ? approval.reviewedAt.toISOString() : null}
          variant="persistent"
        />
      )}
    </>
  );
}
