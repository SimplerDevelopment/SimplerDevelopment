import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { oauthClients } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getPortalClient, getPortalClients } from '@/lib/portal-client';
import { redirectUriMatches } from '@/lib/oauth/server';
import { DEFAULT_GRANTED_SCOPES, parseRequestedScopes, SUPPORTED_SCOPES } from '@/lib/oauth/scopes';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type SearchParams = Record<string, string | string[] | undefined>;

function pick(p: SearchParams, key: string): string | undefined {
  const v = p[key];
  return Array.isArray(v) ? v[0] : v;
}

function ErrorPage({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="max-w-md mx-auto py-16 px-6">
      <h1 className="text-xl font-semibold mb-3">{title}</h1>
      <p className="text-sm text-muted-foreground">{detail}</p>
    </div>
  );
}

export default async function AuthorizePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const clientId = pick(params, 'client_id');
  const redirectUri = pick(params, 'redirect_uri');
  const responseType = pick(params, 'response_type');
  const state = pick(params, 'state') ?? '';
  const codeChallenge = pick(params, 'code_challenge');
  const codeChallengeMethod = pick(params, 'code_challenge_method') ?? 'S256';
  const scopeParam = pick(params, 'scope');
  const resource = pick(params, 'resource');

  // --- Pre-redirect validation. Anything that fails here renders an error
  // page rather than redirecting, because we cannot trust the redirect_uri.
  if (!clientId) return <ErrorPage title="Missing client_id" detail="The OAuth request is missing the client_id parameter." />;
  if (!redirectUri) return <ErrorPage title="Missing redirect_uri" detail="The OAuth request is missing the redirect_uri parameter." />;

  const [oauthClient] = await db.select().from(oauthClients).where(eq(oauthClients.clientId, clientId)).limit(1);
  if (!oauthClient) return <ErrorPage title="Unknown client" detail="No OAuth client is registered with that client_id." />;
  if (!redirectUriMatches(oauthClient.redirectUris, redirectUri)) {
    return <ErrorPage title="Invalid redirect_uri" detail="The redirect_uri does not match any URI registered for this client." />;
  }

  // --- Post-redirect validation. From here, errors go back to the client via
  // the redirect_uri per RFC 6749 §4.1.2.1.
  const errorRedirect = (error: string, description?: string) => {
    const url = new URL(redirectUri);
    url.searchParams.set('error', error);
    if (description) url.searchParams.set('error_description', description);
    if (state) url.searchParams.set('state', state);
    redirect(url.toString());
  };

  if (responseType !== 'code') errorRedirect('unsupported_response_type', 'response_type must be "code"');
  if (!codeChallenge) errorRedirect('invalid_request', 'code_challenge is required (PKCE)');
  if (codeChallengeMethod !== 'S256') errorRedirect('invalid_request', 'code_challenge_method must be S256');

  // --- Auth gate: require portal session, bounce through /portal/login.
  const session = await auth();
  if (!session?.user?.id) {
    const hdrs = await headers();
    const proto = hdrs.get('x-forwarded-proto') ?? 'https';
    const host = hdrs.get('x-forwarded-host') ?? hdrs.get('host') ?? '';
    const callback = new URL(`${proto}://${host}/oauth/authorize`);
    for (const [k, v] of Object.entries(params)) {
      if (typeof v === 'string') callback.searchParams.set(k, v);
    }
    const login = new URL('/portal/login', `${proto}://${host}`);
    login.searchParams.set('callbackUrl', callback.pathname + callback.search);
    redirect(login.toString());
  }

  const userId = parseInt(session.user!.id!, 10);
  const allClients = await getPortalClients(userId);
  if (allClients.length === 0) {
    return <ErrorPage title="No portal access" detail="Your account is not associated with any client portal." />;
  }
  const activeClient = await getPortalClient(userId);
  if (!activeClient) return <ErrorPage title="No portal access" detail="Could not resolve an active client for your account." />;

  // --- Decide which scopes to present. If the client asked for `*`, show a
  // single "Full access" toggle. Otherwise show only the requested scopes
  // intersected with what we support; if none match, fall back to defaults.
  const requested = parseRequestedScopes(scopeParam);
  const wantsAll = (scopeParam ?? '').split(/\s+/).includes('*');
  let scopeOptions: string[];
  if (wantsAll) {
    scopeOptions = ['*'];
  } else if (requested.length > 0) {
    scopeOptions = requested;
  } else {
    scopeOptions = DEFAULT_GRANTED_SCOPES;
  }

  // Scope labels for the consent UI.
  const scopeLabels: Record<string, string> = {
    '*': 'Full access — everything below plus any future tools',
    'profile:read': 'Read profile and account info',
    'profile:write': 'Update profile and account info',
    'projects:read': 'Read projects, sprints, and Kanban boards',
    'projects:write': 'Create and update projects, sprints, Kanban',
    'tickets:read': 'Read support tickets',
    'tickets:write': 'Create and reply to support tickets',
    'crm:read': 'Read contacts, companies, deals, pipelines',
    'crm:write': 'Create and update CRM records',
    'sites:read': 'Read website settings, posts, navigation',
    'sites:write': 'Create and edit posts, pages, site settings',
    'media:read': 'Read media library',
    'media:write': 'Upload and delete media',
    'email:read': 'Read email lists, campaigns, subscribers',
    'email:write': 'Create and send email campaigns',
    'decks:read': 'Read presentation decks',
    'decks:write': 'Create and update presentation decks',
    'surveys:read': 'Read surveys and responses',
    'surveys:write': 'Create and update surveys',
    'bookings:read': 'Read booking pages and bookings',
    'bookings:write': 'Manage bookings',
    'automations:read': 'Read automation workflows',
    'automations:write': 'Create and toggle automations',
    'team:read': 'Read team members',
    'team:write': 'Update team member roles',
    'integrations:read': 'Read integration connections',
    'integrations:write': 'Manage integrations',
    'services:read': 'Read services and proposals',
    'services:write': 'Manage services and proposals',
    'billing:read': 'Read invoices and billing info',
    'hosting:read': 'Read hosting and deployment status',
    'ai:read': 'Read AI credits balance',
  };

  return (
    <div className="max-w-lg mx-auto py-12 px-6">
      <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
        <h1 className="text-xl font-semibold mb-2">
          Connect <span className="text-primary">{oauthClient.clientName}</span> to {activeClient.company ?? 'your portal'}?
        </h1>
        <p className="text-sm text-muted-foreground mb-6">
          {oauthClient.clientName} is asking for access to your SimplerDevelopment portal.
          Approve only if you trust this application.
        </p>

        {oauthClient.clientUri && (
          <p className="text-xs text-muted-foreground mb-6">
            Application website:{' '}
            <a href={oauthClient.clientUri} target="_blank" rel="noreferrer" className="underline">
              {oauthClient.clientUri}
            </a>
          </p>
        )}

        <form action="/oauth/authorize/decision" method="POST" className="space-y-4">
          <input type="hidden" name="client_id" value={clientId} />
          <input type="hidden" name="redirect_uri" value={redirectUri} />
          <input type="hidden" name="state" value={state} />
          <input type="hidden" name="code_challenge" value={codeChallenge!} />
          <input type="hidden" name="code_challenge_method" value={codeChallengeMethod} />
          <input type="hidden" name="active_client_id" value={String(activeClient.id)} />
          {resource && <input type="hidden" name="resource" value={resource} />}

          {allClients.length > 1 && (
            <div>
              <label className="block text-sm font-medium mb-1">Which portal?</label>
              <select
                name="active_client_id"
                defaultValue={String(activeClient.id)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              >
                {allClients.map(c => (
                  <option key={c.id} value={String(c.id)}>{c.company ?? `Portal #${c.id}`}</option>
                ))}
              </select>
            </div>
          )}

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium mb-1">Scopes requested</legend>
            {scopeOptions.map(scope => (
              <label key={scope} className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  name="scopes"
                  value={scope}
                  defaultChecked
                  className="mt-1"
                />
                <span>
                  <code className="text-xs bg-muted px-1 py-0.5 rounded">{scope}</code>
                  <span className="ml-2 text-muted-foreground">{scopeLabels[scope] ?? scope}</span>
                </span>
              </label>
            ))}
          </fieldset>

          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              name="decision"
              value="approve"
              className="flex-1 rounded-md bg-primary text-primary-foreground py-2 text-sm font-medium hover:opacity-90"
            >
              Approve
            </button>
            <button
              type="submit"
              name="decision"
              value="deny"
              className="flex-1 rounded-md border border-border py-2 text-sm hover:bg-muted"
            >
              Deny
            </button>
          </div>
        </form>

        <p className="mt-6 text-xs text-muted-foreground">
          Signed in as {session.user!.email}.{' '}
          {SUPPORTED_SCOPES.length} scopes total are available — see{' '}
          <a href="/docs/mcp" className="underline">/docs/mcp</a>.
        </p>
      </div>
    </div>
  );
}
