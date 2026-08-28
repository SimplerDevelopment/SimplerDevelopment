import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { surveys, surveyResponses } from '@/lib/db/schema';
import { eq, desc, inArray, max } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import { hasServiceAccess } from '@/lib/portal-auth';
import { hasFlag } from '@/lib/feature-flags';
import LockedRoom from '@/components/portal/LockedRoom';
import Link from 'next/link';
import { RelatedModulesStrip } from '@/components/portal/billing/RelatedModulesStrip';
import { PortalPageHeader } from '@/components/portal/PortalPageHeader';
import DomainGetStarted from '@/components/portal/onboarding/DomainGetStarted';
import { pBtnPrimary, pCard, sBtn, sBtnGhost } from '@/components/portal/portal-ui';
import { EmptyState } from '@/components/portal/EmptyState';
import SurveysStudioTable from '@/components/portal/surveys/SurveysStudioTable';

const statusColors: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  active: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  closed: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

export default async function SurveysListPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/portal/login');

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) redirect('/portal/dashboard');

  const entitled = await hasServiceAccess(client.id, 'surveys');
  if (!entitled) {
    // PUX-146 (design doc screen 06): under the redesign the room sells itself
    // where it would live, instead of bouncing to the catalog. Flag off = the
    // redirect, as before.
    if (hasFlag(client, 'portal-redesign')) return <LockedRoom domainKey="surveys" clientId={client.id} />;
    redirect('/portal/services');
  }

  const list = await db
    .select()
    .from(surveys)
    .where(eq(surveys.clientId, client.id))
    .orderBy(desc(surveys.updatedAt));

  // PUX-178 (design doc screen 37): under the redesign the list is a table with a Last response column and a
  // real CRM link per row. Flag off is today's cards, untouched below.
  if (hasFlag(client, 'portal-redesign')) {
    // One scoped rollup: the newest response per survey (ids are already this tenant's).
    const ids = list.map((s) => s.id);
    const lastBydSurvey = ids.length === 0 ? [] : await db
      .select({ surveyId: surveyResponses.surveyId, last: max(surveyResponses.createdAt) })
      .from(surveyResponses)
      .where(inArray(surveyResponses.surveyId, ids))
      .groupBy(surveyResponses.surveyId);
    const lastMap = new Map(lastBydSurvey.map((r) => [r.surveyId, r.last ? new Date(r.last).toISOString() : null]));
    const rows = list.map((sv) => ({
      id: sv.id, title: sv.title, status: sv.status, responseCount: sv.responseCount ?? 0,
      questionCount: Array.isArray(sv.fields) ? sv.fields.length : 0,
      linkedType: sv.linkedType ?? null, linkedId: sv.linkedId ?? null,
      lastResponseAt: lastMap.get(sv.id) ?? null,
    }));
    const active = list.filter((sv) => sv.status === 'active').length;
    const responses = rows.reduce((n, r) => n + r.responseCount, 0);
    return (
      <div className="max-w-5xl mx-auto py-6 px-4 space-y-4">
        <PortalPageHeader
          eyebrow="Grow · Reach"
          title="Surveys"
          subtitle={`${list.length} ${list.length === 1 ? 'survey' : 'surveys'} · ${active} active · ${responses} ${responses === 1 ? 'response' : 'responses'}`}
          actions={
            <div className="flex items-center gap-2">
              {/* Templates live in /new's choose step — the ghost lands there too. */}
              <Link href="/portal/surveys/new" className={sBtnGhost}><span className="material-icons text-base">dashboard_customize</span>From a template</Link>
              <Link href="/portal/surveys/new" className={sBtn}><span className="material-icons text-base">add</span>New survey</Link>
            </div>
          }
          className="mb-0 pb-3"
        />
        <DomainGetStarted domainKey="surveys" />
        {rows.length === 0 ? (
          <EmptyState
            title="No surveys yet."
            body="Ask after every booking, qualify a lead, or take a pulse — responses land on the contact's Activity tab."
            cta={{ label: 'New survey', icon: 'add', href: '/portal/surveys/new', ghost: true }}
            ghostLabel="A survey"
          />
        ) : (
          <SurveysStudioTable rows={rows} />
        )}
        <RelatedModulesStrip currentDomain="surveys" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <PortalPageHeader
        eyebrow="Forms"
        title="Surveys"
        subtitle="Create surveys and collect responses from customers, leads, and visitors"
        actions={
          <Link
            href="/portal/surveys/new"
            className={pBtnPrimary}
          >
            <span className="material-icons text-lg">add</span>
            New Survey
          </Link>
        }
      />

      <DomainGetStarted domainKey="surveys" />

      {/* Quick Stats */}
      {list.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className={`${pCard} p-4`}>
            <p className="font-display text-2xl font-extrabold tracking-[-0.02em] text-foreground">{list.length}</p>
            <p className="text-xs text-muted-foreground">Total Surveys</p>
          </div>
          <div className={`${pCard} p-4`}>
            <p className="font-display text-2xl font-extrabold tracking-[-0.02em] text-foreground">{list.filter(s => s.status === 'active').length}</p>
            <p className="text-xs text-muted-foreground">Active</p>
          </div>
          <div className={`${pCard} p-4`}>
            <p className="font-display text-2xl font-extrabold tracking-[-0.02em] text-foreground">{list.reduce((sum, s) => sum + (s.responseCount || 0), 0)}</p>
            <p className="text-xs text-muted-foreground">Total Responses</p>
          </div>
          <div className={`${pCard} p-4`}>
            <p className="font-display text-2xl font-extrabold tracking-[-0.02em] text-foreground">{list.filter(s => s.linkedType).length}</p>
            <p className="text-xs text-muted-foreground">Integrated</p>
          </div>
        </div>
      )}

      {/* Survey List */}
      {list.length === 0 ? (
        <div className={`${pCard} p-10 text-center space-y-4`}>
          <span className="material-icons text-5xl text-muted-foreground/50">poll</span>
          <h2 className="text-lg font-display font-extrabold tracking-[-0.01em] text-foreground">No surveys yet</h2>
          <p className="text-muted-foreground text-sm max-w-md mx-auto">
            Create your first survey to collect feedback, run polls, or gather information
            from customers and leads. Surveys can be shared via link, embedded on websites,
            or sent through email campaigns.
          </p>
          <Link
            href="/portal/surveys/new"
            className={pBtnPrimary}
          >
            <span className="material-icons text-lg">add_circle</span>
            Create Your First Survey
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {list.map((survey) => (
            <Link
              key={survey.id}
              href={`/portal/surveys/${survey.id}`}
              className={`${pCard} p-5 hover:border-primary/50 hover:shadow-sm transition-all group flex items-center gap-4`}
            >
              <span
                className="material-icons text-2xl shrink-0"
                style={{ color: survey.color || '#2563eb' }}
              >
                poll
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors truncate">
                    {survey.title}
                  </h3>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${statusColors[survey.status] || statusColors.draft}`}>
                    {survey.status}
                  </span>
                  {survey.linkedType && (
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 shrink-0">
                      {survey.linkedType.replace('_', ' ')}
                    </span>
                  )}
                </div>
                {survey.description && (
                  <p className="text-sm text-muted-foreground line-clamp-1">{survey.description}</p>
                )}
                <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <span className="material-icons text-sm">format_list_numbered</span>
                    {(survey.fields as unknown[])?.length || 0} questions
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="material-icons text-sm">people</span>
                    {survey.responseCount} responses
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="material-icons text-sm">link</span>
                    /s/{survey.slug}
                  </span>
                </div>
              </div>
              <span className="material-icons text-muted-foreground group-hover:text-primary transition-colors">
                chevron_right
              </span>
            </Link>
          ))}
        </div>
      )}

      {/* Integration Tips */}
      <div className={`${pCard} p-4 flex items-start gap-3`}>
        <span className="material-icons text-primary mt-0.5">tips_and_updates</span>
        <div className="text-sm text-muted-foreground">
          <p className="font-display font-extrabold tracking-[-0.01em] text-foreground">Integration Tips</p>
          <p>
            Surveys can be linked to email campaigns, CRM deals, proposals, pitch decks, booking pages, and websites.
            Share the public link, embed on any page, or attach to an email campaign for maximum reach.
          </p>
        </div>
      </div>
      <RelatedModulesStrip currentDomain="surveys" />
    </div>
  );
}
