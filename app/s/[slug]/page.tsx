/**
 * Public survey route.
 *
 * A thin server shell around the real form (`SurveyPageClient` →
 * `SurveyFormInline`). It exists as a server component for one reason: an
 * external reviewer following an approval link must see the REAL survey — every
 * `showIf` branch, page jump, conditional option and scoring rule live — with
 * the approval bar overlaid (PUX-060/068). Resolving that credential requires
 * the server, and the form itself must stay a client component.
 *
 * Ordinary visitors are unaffected: no cookie, no bar, and `GET /api/surveys/
 * <slug>` still applies its normal active-only rules.
 */

import { db } from '@/lib/db';
import { surveys } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { resolveApprovalContext } from '@/lib/mcp/approval-mode';
import { ApprovalBar } from '@/components/approvals/ApprovalBar';
import { SurveyPageClient } from './SurveyPageClient';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function PublicSurveyPage({ params }: PageProps) {
  const { slug } = await params;

  // Cheap id/owner lookup only — the form fetches its own content through the
  // public API, which is where draft access is granted.
  const [survey] = await db
    .select({ id: surveys.id, clientId: surveys.clientId, title: surveys.title })
    .from(surveys)
    .where(eq(surveys.slug, slug))
    .limit(1);

  const approval = survey ? await resolveApprovalContext('survey', survey.id) : null;
  // A live link for this survey is not proof of tenancy; the owner check is here.
  const viaApproval = !!approval && !!survey && approval.clientId === survey.clientId;

  return (
    <>
      <SurveyPageClient />
      {viaApproval && approval && (
        // persistent, not auto-hide: a survey scrolls rather than being a fixed
        // stage, so hiding buys no fidelity — and always-visible draft chrome is
        // what keeps the reviewer oriented when the thank-you screen tells them
        // a response was recorded that deliberately was not (PUX-067).
        <ApprovalBar
          entityLabel="Survey"
          title={survey.title}
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
