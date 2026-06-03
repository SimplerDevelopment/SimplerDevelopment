/**
 * Server-rendered "Active automations" + "Recent automation runs" tile pair.
 * Was previously a two-fetch waterfall in the client component. Now resolves
 * server-side and streams in via Suspense. Each row's interactive bits are
 * just Next Link tags — no React state needed, so no `'use client'` boundary.
 */
import Link from 'next/link';
import { db } from '@/lib/db';
import { automationRules, automationLogs } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';

interface Props {
  clientId: number;
}

export async function BrainAutomationsTile({ clientId }: Props) {
  const [rules, logs] = await Promise.all([
    db
      .select()
      .from(automationRules)
      .where(eq(automationRules.clientId, clientId))
      .orderBy(desc(automationRules.createdAt)),
    db
      .select()
      .from(automationLogs)
      .where(eq(automationLogs.clientId, clientId))
      .orderBy(desc(automationLogs.createdAt))
      .limit(5),
  ]);

  const activeRules = rules.filter((r) => r.enabled);
  // Build a lookup so we can render the rule name on each log row — the log
  // table doesn't carry the name and the prior client widget was rendering
  // `undefined`. This matches the user's intent without changing the schema.
  const ruleNameById = new Map(rules.map((r) => [r.id, r.name]));

  return (
    <div className="grid md:grid-cols-2 gap-4">
      <div className="bg-card border border-border rounded-lg p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <span className="material-icons text-base text-amber-500">bolt</span>
            Active automations ({activeRules.length})
          </h2>
          <Link
            href="/portal/brain/automations"
            className="text-xs text-primary hover:underline inline-flex items-center gap-0.5"
          >
            <span className="material-icons text-sm">add</span>
            New
          </Link>
        </div>
        {activeRules.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No active automations.{' '}
            <Link href="/portal/brain/automations" className="text-primary hover:underline">
              Install a template
            </Link>{' '}
            or build one with AI.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {activeRules.slice(0, 5).map((r) => (
              <li key={r.id} className="py-2">
                <Link
                  href="/portal/brain/automations"
                  className="flex items-center justify-between hover:text-primary gap-2"
                >
                  <span className="text-sm text-foreground truncate flex-1 min-w-0">{r.name}</span>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {r.executionCount > 0 ? `${r.executionCount} runs` : 'never run'}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="bg-card border border-border rounded-lg p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <span className="material-icons text-base text-muted-foreground">history</span>
            Recent automation runs
          </h2>
          <Link href="/portal/brain/automations" className="text-xs text-primary hover:underline">
            View all
          </Link>
        </div>
        {logs.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No runs yet. Logs will appear here once an automation fires.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {logs.map((log) => {
              const ruleName = ruleNameById.get(log.ruleId) ?? 'Deleted automation';
              return (
                <li key={log.id} className="py-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span
                        className={`material-icons text-sm shrink-0 ${
                          log.status === 'success'
                            ? 'text-green-500'
                            : log.status === 'partial'
                              ? 'text-amber-500'
                              : 'text-red-500'
                        }`}
                      >
                        {log.status === 'success'
                          ? 'check_circle'
                          : log.status === 'partial'
                            ? 'warning'
                            : 'error'}
                      </span>
                      <span className="text-sm text-foreground truncate">{ruleName}</span>
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {new Date(log.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  {log.errorMessage && (
                    <p className="text-xs text-red-500 truncate mt-0.5 ml-6">{log.errorMessage}</p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
