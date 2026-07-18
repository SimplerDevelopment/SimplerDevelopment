import { db } from '@/lib/db';
import { automationRules } from '@/lib/db/schema';
import { eq, and, count, desc } from 'drizzle-orm';
import Link from 'next/link';

export default async function AutomationsWidget({
  clientId,
}: {
  clientId: number;
  userId: number;
}) {
  const [countResult, recent] = await Promise.all([
    db
      .select({ count: count() })
      .from(automationRules)
      .where(and(eq(automationRules.clientId, clientId), eq(automationRules.enabled, true))),
    db
      .select({
        id: automationRules.id,
        name: automationRules.name,
        enabled: automationRules.enabled,
        executionCount: automationRules.executionCount,
        lastExecutedAt: automationRules.lastExecutedAt,
      })
      .from(automationRules)
      .where(eq(automationRules.clientId, clientId))
      .orderBy(desc(automationRules.updatedAt))
      .limit(3),
  ]);

  const enabledCount = countResult[0]?.count ?? 0;

  return (
    <div>
      <div className="mb-3">
        <span className="font-display text-2xl font-extrabold tracking-[-0.02em] text-foreground">{enabledCount}</span>
        <span className="ml-2 text-sm text-muted-foreground">
          active automation{enabledCount !== 1 ? 's' : ''}
        </span>
      </div>
      {recent.length === 0 ? (
        <p className="text-sm text-muted-foreground py-2 text-center">
          No automations yet.{' '}
          <Link href="/portal/brain/automations" className="text-primary hover:underline">
            Create one
          </Link>
        </p>
      ) : (
        <ul className="space-y-2">
          {recent.map((rule) => (
            <li key={rule.id}>
              <Link
                href="/portal/brain/automations"
                className="flex items-center justify-between gap-2 hover:bg-accent p-2 rounded-lg transition-colors"
              >
                <div className="min-w-0 flex items-center gap-2">
                  <span
                    className={`shrink-0 w-2 h-2 rounded-full ${
                      rule.enabled ? 'bg-green-500' : 'bg-muted-foreground'
                    }`}
                  />
                  <p className="text-sm font-medium text-foreground truncate">{rule.name}</p>
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {rule.executionCount} run{rule.executionCount !== 1 ? 's' : ''}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 pt-3 border-t border-border">
        <Link
          href="/portal/brain/automations"
          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
        >
          <span className="material-icons text-sm">bolt</span>
          Manage automations
        </Link>
      </div>
    </div>
  );
}
