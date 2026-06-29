/**
 * Brain dashboard page — server component. Renders the dashboard widgets as
 * cached, Suspense-streamed RSCs (see components/portal/brain-dashboard).
 * The enable-flow (for clients who haven't turned brain on yet) is a small
 * client island; everything else is server-rendered.
 *
 * Previously this page was `'use client'` and fetched settings + dashboard
 * data from API routes after hydration. That created a triple round-trip
 * waterfall (settings → dashboard → automations) before the user saw
 * anything useful. The cached `getDashboardSummary` + streaming Suspense
 * pattern means the shell + skeletons render immediately, and each tile
 * pops in independently as its data resolves.
 */
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';
import { getBrainProfile } from '@/lib/brain/profiles';
import { getIndustryTemplate } from '@/lib/brain/industry-templates';
import { isBrainEntitled } from '@/lib/brain/entitlement';
import { BrainDashboardWidgetsServer } from '@/components/portal/brain-dashboard';
import { EnableBrainButton } from './EnableBrainButton';
import { RelatedModulesStrip } from '@/components/portal/billing/RelatedModulesStrip';
import { PortalPageHeader } from '@/components/portal/PortalPageHeader';
import { pBtnGhost } from '@/components/portal/portal-ui';

export default async function BrainDashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/portal/login');

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) {
    return (
      <div className="max-w-4xl mx-auto py-12">
        <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 text-sm text-destructive">
          <div className="flex items-center gap-2 font-medium mb-1">
            <span className="material-icons text-base">error_outline</span>
            Couldn&apos;t load Company Brain
          </div>
          <p>No client profile found for this user.</p>
        </div>
      </div>
    );
  }

  // Service-level entitlement check. requireBrainEntitlement runs again in
  // every API route; this is just an early UX gate so the shell doesn't
  // render the dashboard chrome behind a 402.
  const entitled = await isBrainEntitled(client.id);
  if (!entitled) {
    return (
      <div className="max-w-3xl mx-auto py-12">
        <div className="bg-card border border-border rounded-lg p-8 text-center">
          <span className="material-icons text-5xl text-primary mb-3 block">psychology</span>
          <h1 className="text-2xl font-bold text-foreground mb-2">Company Brain</h1>
          <p className="text-sm text-muted-foreground max-w-xl mx-auto mb-6">
            Company Brain isn&apos;t included on your current plan. Upgrade or start a trial to
            enable it.
          </p>
          <Link
            href="/portal/services"
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <span className="material-icons text-base">storefront</span>
            View services
          </Link>
        </div>
      </div>
    );
  }

  const profile = await getBrainProfile(client.id);

  if (!profile?.enabled) {
    return (
      <div className="max-w-3xl mx-auto py-12">
        <div className="bg-card border border-border rounded-lg p-8 text-center">
          <span className="material-icons text-5xl text-primary mb-3 block">psychology</span>
          <h1 className="text-2xl font-bold text-foreground mb-2">Company Brain</h1>
          <p className="text-sm text-muted-foreground max-w-xl mx-auto mb-6">
            A structured operating layer for your business. Capture communications, decisions, commitments,
            and tasks into a secure, AI-queryable command center. AI proposes — you approve.
          </p>
          <div className="grid sm:grid-cols-3 gap-3 max-w-2xl mx-auto mb-8">
            <FeatureBullet icon="forum" title="Notes → tasks">
              Paste a transcript or forward an email. AI extracts decisions, commitments, and follow-ups for your review.
            </FeatureBullet>
            <FeatureBullet icon="reviews" title="Human approval">
              Nothing is written to your records until a human approves it. Every approval is audited.
            </FeatureBullet>
            <FeatureBullet icon="search" title="Ask anything">
              Search across communications, decisions, and follow-ups with citations back to source records.
            </FeatureBullet>
          </div>
          <EnableBrainButton />
          <p className="text-xs text-muted-foreground mt-3">
            You can configure industry template, modules, and confidentiality after enabling.
          </p>
        </div>
      </div>
    );
  }

  const template = getIndustryTemplate(profile.industryTemplate ?? 'generic');

  return (
    <div className="max-w-5xl mx-auto py-8 space-y-6">
      <PortalPageHeader
        eyebrow="Knowledge"
        title={
          <span className="flex items-center gap-2">
            <span className="material-icons text-primary">psychology</span>
            {profile.name}
          </span>
        }
        subtitle={`${template?.label ?? 'Generic'} template · Confidentiality default: ${profile.defaultConfidentiality}`}
        actions={
          <Link
            href="/portal/brain/settings"
            className={pBtnGhost}
          >
            <span className="material-icons text-base">settings</span>
            Settings
          </Link>
        }
      />

      <BrainDashboardWidgetsServer clientId={client.id} />
      <RelatedModulesStrip currentDomain="brain" />
    </div>
  );
}

function FeatureBullet({
  icon,
  title,
  children,
}: {
  icon: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="text-left bg-muted/30 border border-border rounded-md p-3">
      <div className="flex items-center gap-1.5 text-sm font-medium text-foreground mb-1">
        <span className="material-icons text-base text-primary">{icon}</span>
        {title}
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">{children}</p>
    </div>
  );
}
