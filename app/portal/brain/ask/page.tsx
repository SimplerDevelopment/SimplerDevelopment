'use client';

import Link from 'next/link';
import { useState, useCallback, useMemo } from 'react';

type EntityType =
  | 'meeting'
  | 'note'
  | 'task'
  | 'relationship'
  | 'company'
  | 'contact'
  | 'deal'
  | 'post';

interface BrainSearchHit {
  type: EntityType;
  id: number;
  title: string;
  snippet: string;
  score: number;
  status?: string;
  occurredAt?: string;
  contextName?: string;
  url: string;
}

interface BrainSearchResult {
  query: string;
  total: number;
  hits: BrainSearchHit[];
}

const TYPE_META: Record<EntityType, { label: string; icon: string; tone: string }> = {
  meeting:      { label: 'Meeting',      icon: 'forum',          tone: 'text-blue-600 dark:text-blue-400' },
  note:         { label: 'Knowledge',    icon: 'sticky_note_2',  tone: 'text-amber-600 dark:text-amber-400' },
  task:         { label: 'Task',         icon: 'task_alt',       tone: 'text-foreground' },
  relationship: { label: 'Relationship', icon: 'group_work',     tone: 'text-cyan-600 dark:text-cyan-400' },
  company:      { label: 'Company',      icon: 'business',       tone: 'text-emerald-600 dark:text-emerald-400' },
  contact:      { label: 'Contact',      icon: 'person',         tone: 'text-rose-600 dark:text-rose-400' },
  deal:         { label: 'Deal',         icon: 'handshake',      tone: 'text-violet-600 dark:text-violet-400' },
  post:         { label: 'Page',         icon: 'web',            tone: 'text-sky-600 dark:text-sky-400' },
};

const FILTERS: { id: EntityType | 'all'; label: string }[] = [
  { id: 'all',          label: 'All' },
  { id: 'note',         label: 'Knowledge' },
  { id: 'meeting',      label: 'Meetings' },
  { id: 'company',      label: 'Companies' },
  { id: 'contact',      label: 'Contacts' },
  { id: 'deal',         label: 'Deals' },
  { id: 'task',         label: 'Tasks' },
  { id: 'relationship', label: 'Relationships' },
  { id: 'post',         label: 'Pages' },
];

export default function AskBrainPage() {
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState('');
  const [filter, setFilter] = useState<EntityType | 'all'>('all');
  const [result, setResult] = useState<BrainSearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  const search = useCallback(async (q: string, types?: EntityType[]) => {
    if (!q.trim()) return;
    setLoading(true);
    setError(null);
    setSearched(true);
    try {
      const params = new URLSearchParams({ q });
      if (types && types.length > 0) params.set('types', types.join(','));
      const r = await fetch(`/api/portal/brain/search?${params.toString()}`);
      const json = await r.json();
      if (!r.ok || !json.success) {
        setError(json.message || 'Search failed.');
        setResult(null);
      } else {
        setResult(json.data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }, []);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setQuery(draft);
    search(draft, filter === 'all' ? undefined : [filter]);
  };

  const onFilterChange = (next: EntityType | 'all') => {
    setFilter(next);
    if (query) search(query, next === 'all' ? undefined : [next]);
  };

  const grouped = useMemo(() => {
    if (!result) return null;
    const out = new Map<EntityType, BrainSearchHit[]>([
      ['note', []], ['meeting', []], ['company', []], ['contact', []],
      ['deal', []], ['task', []], ['relationship', []], ['post', []],
    ]);
    for (const h of result.hits) {
      out.get(h.type)?.push(h);
    }
    return out;
  }, [result]);

  return (
    <div className="max-w-4xl mx-auto py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <span className="material-icons text-primary">travel_explore</span>
          Ask Brain
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Search across everything in your portal — knowledge notes, meetings, CRM companies and contacts, deals, tasks, relationships, and pages. Both keyword and meaning-based matches. For richer conversational queries, connect Brain to Claude Desktop via MCP — see below.
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-3">
        <div className="relative">
          <span className="material-icons absolute left-3 top-2.5 text-muted-foreground pointer-events-none">search</span>
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="What did we decide about pricing? Who owns the Acme follow-up?"
            className="w-full pl-10 pr-4 py-2.5 rounded-md border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            autoFocus
          />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex gap-1">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => onFilterChange(f.id)}
                className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                  filter === f.id
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border text-muted-foreground hover:bg-accent'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <button
            type="submit"
            disabled={loading || !draft.trim()}
            className="ml-auto inline-flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {loading
              ? <><span className="material-icons animate-spin text-base">progress_activity</span>Searching…</>
              : <><span className="material-icons text-base">search</span>Search</>
            }
          </button>
        </div>
      </form>

      {error && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-md p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {!searched && !loading && (
        <McpSetupCard />
      )}

      {result && (
        <div className="space-y-4">
          <div className="text-xs text-muted-foreground">
            {result.total === 0
              ? 'No matches.'
              : `${result.total} ${result.total === 1 ? 'match' : 'matches'} for "${result.query}"`}
          </div>

          {result.hits.length === 0 ? (
            <div className="text-center py-12 bg-card border border-border rounded-lg">
              <span className="material-icons text-4xl text-muted-foreground mb-2 block">search_off</span>
              <p className="text-sm text-muted-foreground">
                Nothing matched. Try different words, or shorter phrases.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {result.hits.map((hit) => (
                <Link
                  key={`${hit.type}-${hit.id}`}
                  href={hit.url}
                  className="block bg-card border border-border rounded-lg p-4 hover:border-primary/50 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <span className={`material-icons mt-0.5 ${TYPE_META[hit.type].tone}`}>{TYPE_META[hit.type].icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-foreground truncate">{hit.title}</span>
                        <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                          {TYPE_META[hit.type].label}
                        </span>
                        {hit.status && (
                          <span className="text-xs text-muted-foreground">{hit.status}</span>
                        )}
                      </div>
                      <p className="text-xs text-foreground mt-1 line-clamp-2">
                        <Highlight text={hit.snippet} query={result.query} />
                      </p>
                      <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
                        {hit.occurredAt && <span>{new Date(hit.occurredAt).toLocaleDateString()}</span>}
                        {hit.contextName && (
                          <span className="inline-flex items-center gap-0.5">
                            <span className="material-icons text-sm">link</span>
                            {hit.contextName}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="material-icons text-muted-foreground self-center">chevron_right</span>
                  </div>
                </Link>
              ))}
            </div>
          )}

          {grouped && (
            <div className="text-xs text-muted-foreground">
              {(['note', 'meeting', 'company', 'contact', 'deal', 'task', 'relationship', 'post'] as EntityType[]).map((t) => {
                const count = grouped.get(t)?.length ?? 0;
                if (count === 0) return null;
                return <span key={t} className="mr-3">{TYPE_META[t].label}s: {count}</span>;
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(${escaped})`, 'ig');
  const parts = text.split(re);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1
          ? <mark key={i} className="bg-amber-300/30 text-foreground rounded-sm px-0.5">{part}</mark>
          : <span key={i}>{part}</span>
      )}
    </>
  );
}

function McpSetupCard() {
  return (
    <div className="bg-card border border-border rounded-lg p-5 space-y-4">
      <div className="flex items-start gap-3">
        <span className="material-icons text-primary text-2xl">auto_awesome</span>
        <div>
          <h2 className="text-base font-semibold text-foreground">Connect Brain to Claude Desktop</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Keyword search above is the lightweight option. The real Ask Brain experience runs through{' '}
            <strong>Model Context Protocol (MCP)</strong> — Claude Desktop talks directly to your Brain over the same
            authenticated channel, with full conversational context, citations, and the ability to <em>act</em> within scoped
            limits (propose tasks, link meetings to relationships, summarize across multiple sources).
          </p>
        </div>
      </div>

      <div className="bg-muted/30 border border-border rounded-md p-4 text-xs space-y-2">
        <p className="font-medium text-foreground">Setup (one-time):</p>
        <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
          <li>
            Generate a portal API key with <code className="bg-background px-1 rounded">brain:read</code>
            {' '}+{' '}<code className="bg-background px-1 rounded">brain:write</code> scopes (and{' '}
            <code className="bg-background px-1 rounded">brain:approve</code> if you want Claude to approve review items).
            See <Link href="/portal/settings" className="text-primary hover:underline">Settings → API keys</Link>.
          </li>
          <li>
            In Claude Desktop, open <code className="bg-background px-1 rounded">~/.claude/claude_desktop_config.json</code>{' '}
            and add the SimplerDevelopment MCP server with your bearer token.
          </li>
          <li>Restart Claude Desktop. Brain tools (<code className="bg-background px-1 rounded">brain_search</code>, <code className="bg-background px-1 rounded">brain_get_relationship</code>, etc.) appear automatically.</li>
        </ol>
      </div>

      <div className="flex items-center justify-between pt-1">
        <Link
          href="/portal/settings"
          className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
        >
          <span className="material-icons text-base">vpn_key</span>
          Manage API keys
        </Link>
        <span className="text-xs text-muted-foreground">
          Tools: brain_search · brain_dashboard_summary · brain_list_relationships · brain_get_relationship · brain_list_meetings · brain_get_meeting · brain_list_tasks · brain_get_task · brain_list_review_items · brain_create_meeting · brain_create_task · brain_propose_task · brain_update_task · brain_link_meeting · brain_create_relationship · brain_approve_review_item · brain_reject_review_item · brain_update_relationship
        </span>
      </div>
    </div>
  );
}
