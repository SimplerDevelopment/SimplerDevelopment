import Link from 'next/link';
import { db } from '@/lib/db';
import { portalApiKeys } from '@/lib/db/schema';
import { eq, and, isNull, desc } from 'drizzle-orm';

const BRAIN_SCOPES = ['brain:read', 'brain:write', 'brain:approve'];

function hasBrainScope(scopes: string[]): boolean {
  if (scopes.includes('*') || scopes.includes('brain:*')) return true;
  return BRAIN_SCOPES.some((s) => scopes.includes(s));
}

export default async function AiConnectWidget({
  clientId,
}: {
  clientId: number;
  userId: number;
}) {
  // Fetch active (non-revoked) portal API keys for this tenant only
  const keys = await db
    .select({
      id: portalApiKeys.id,
      name: portalApiKeys.name,
      keyPreview: portalApiKeys.keyPreview,
      scopes: portalApiKeys.scopes,
      lastUsedAt: portalApiKeys.lastUsedAt,
    })
    .from(portalApiKeys)
    .where(
      and(
        eq(portalApiKeys.clientId, clientId),
        eq(portalApiKeys.active, true),
        isNull(portalApiKeys.revokedAt),
      ),
    )
    .orderBy(desc(portalApiKeys.lastUsedAt))
    .limit(5);

  const brainKeys = keys.filter((k) => hasBrainScope(k.scopes ?? []));
  const isConnected = brainKeys.length > 0;
  const lastUsed = brainKeys.find((k) => k.lastUsedAt)?.lastUsedAt ?? null;

  return (
    <div>
      <div className="mb-3 flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <span
            className={`material-icons text-base ${
              isConnected
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-muted-foreground'
            }`}
          >
            {isConnected ? 'check_circle' : 'cancel'}
          </span>
          <span
            className={`text-sm font-medium ${
              isConnected
                ? 'text-emerald-700 dark:text-emerald-300'
                : 'text-muted-foreground'
            }`}
          >
            {isConnected ? 'Connected' : 'Not connected'}
          </span>
        </div>
        {isConnected && (
          <span className="text-sm text-muted-foreground">
            {brainKeys.length} key{brainKeys.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {isConnected ? (
        <>
          <ul className="space-y-2">
            {brainKeys.slice(0, 3).map((k) => (
              <li key={k.id}>
                <Link
                  href="/portal/brain/connect"
                  className="flex items-start justify-between gap-2 hover:bg-accent p-2 rounded-lg transition-colors"
                >
                  <div className="min-w-0 flex items-start gap-2">
                    <span className="material-icons text-base text-muted-foreground shrink-0 mt-0.5">
                      vpn_key
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{k.name}</p>
                      <p className="text-xs text-muted-foreground font-mono">{k.keyPreview}</p>
                    </div>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {k.lastUsedAt
                      ? new Date(k.lastUsedAt).toLocaleDateString()
                      : 'Never used'}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {lastUsed && (
            <p className="text-xs text-muted-foreground px-2 mt-2">
              Last active: {new Date(lastUsed).toLocaleString()}
            </p>
          )}
        </>
      ) : (
        <div className="py-2 space-y-3">
          <p className="text-sm text-muted-foreground">
            Connect Claude, ChatGPT and other AI clients to your portal via the Brain MCP server.
          </p>
          <ul className="space-y-1.5">
            <li>
              <Link
                href="/portal/brain/connect"
                className="flex items-center gap-2 text-sm text-primary hover:underline"
              >
                <span className="material-icons text-base">power</span>
                Connect Claude Desktop
              </Link>
            </li>
            <li>
              <Link
                href="/portal/settings/api-keys"
                className="flex items-center gap-2 text-sm text-primary hover:underline"
              >
                <span className="material-icons text-base">vpn_key</span>
                Manage API keys
              </Link>
            </li>
            <li>
              <Link
                href="/portal/brain"
                className="flex items-center gap-2 text-sm text-primary hover:underline"
              >
                <span className="material-icons text-base">psychology</span>
                Open Brain
              </Link>
            </li>
          </ul>
        </div>
      )}

      <div className="mt-3 pt-3 border-t border-border">
        <Link
          href="/portal/brain/connect"
          className="text-xs text-primary hover:underline flex items-center gap-1"
        >
          <span className="material-icons text-sm">arrow_forward</span>
          Manage AI connections
        </Link>
      </div>
    </div>
  );
}
