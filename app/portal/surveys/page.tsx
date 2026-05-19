import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { surveys } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';
import { getPortalClient } from '@/lib/portal-client';
import Link from 'next/link';

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

  const list = await db
    .select()
    .from(surveys)
    .where(eq(surveys.clientId, client.id))
    .orderBy(desc(surveys.updatedAt));

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Surveys</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Create surveys and collect responses from customers, leads, and visitors
          </p>
        </div>
        <Link
          href="/portal/surveys/new"
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <span className="material-icons text-lg">add</span>
          New Survey
        </Link>
      </div>

      {/* Quick Stats */}
      {list.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-2xl font-bold text-foreground">{list.length}</p>
            <p className="text-xs text-muted-foreground">Total Surveys</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-2xl font-bold text-foreground">{list.filter(s => s.status === 'active').length}</p>
            <p className="text-xs text-muted-foreground">Active</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-2xl font-bold text-foreground">{list.reduce((sum, s) => sum + (s.responseCount || 0), 0)}</p>
            <p className="text-xs text-muted-foreground">Total Responses</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-2xl font-bold text-foreground">{list.filter(s => s.linkedType).length}</p>
            <p className="text-xs text-muted-foreground">Integrated</p>
          </div>
        </div>
      )}

      {/* Survey List */}
      {list.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-10 text-center space-y-4">
          <span className="material-icons text-5xl text-muted-foreground/50">poll</span>
          <h2 className="text-lg font-semibold text-foreground">No surveys yet</h2>
          <p className="text-muted-foreground text-sm max-w-md mx-auto">
            Create your first survey to collect feedback, run polls, or gather information
            from customers and leads. Surveys can be shared via link, embedded on websites,
            or sent through email campaigns.
          </p>
          <Link
            href="/portal/surveys/new"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
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
              className="bg-card border border-border rounded-xl p-5 hover:border-primary/50 hover:shadow-sm transition-all group flex items-center gap-4"
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
      <div className="bg-card border border-border rounded-xl p-4 flex items-start gap-3">
        <span className="material-icons text-primary mt-0.5">tips_and_updates</span>
        <div className="text-sm text-muted-foreground">
          <p className="font-medium text-foreground">Integration Tips</p>
          <p>
            Surveys can be linked to email campaigns, CRM deals, proposals, pitch decks, booking pages, and websites.
            Share the public link, embed on any page, or attach to an email campaign for maximum reach.
          </p>
        </div>
      </div>
    </div>
  );
}
