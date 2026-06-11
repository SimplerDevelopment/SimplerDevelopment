import { db } from '@/lib/db';
import { chatConversations, chatMessages } from '@/lib/db/schema';
import { eq, and, count, desc, ne, inArray } from 'drizzle-orm';
import Link from 'next/link';

export default async function LiveChatWidget({
  clientId,
}: {
  clientId: number;
  userId: number;
}) {
  const [openCountResult, recent] = await Promise.all([
    db
      .select({ count: count() })
      .from(chatConversations)
      .where(
        and(
          eq(chatConversations.clientId, clientId),
          ne(chatConversations.status, 'closed'),
        ),
      ),
    db
      .select({
        id: chatConversations.id,
        visitorName: chatConversations.visitorName,
        status: chatConversations.status,
        lastMessageAt: chatConversations.lastMessageAt,
      })
      .from(chatConversations)
      .where(eq(chatConversations.clientId, clientId))
      .orderBy(desc(chatConversations.lastMessageAt))
      .limit(3),
  ]);

  const openCount = openCountResult[0]?.count ?? 0;

  // Fetch the last message body for each conversation shown
  const convIds = recent.map((c) => c.id);
  const lastMessages: { conversationId: number; body: string }[] = [];

  if (convIds.length > 0) {
    // Subquery-style: get the most recent message per conversation.
    // Cheap approach: fetch the last message across all 3 convs and dedupe.
    const msgs = await db
      .select({
        conversationId: chatMessages.conversationId,
        body: chatMessages.body,
        occurredAt: chatMessages.occurredAt,
      })
      .from(chatMessages)
      .where(inArray(chatMessages.conversationId, convIds))
      .orderBy(desc(chatMessages.occurredAt))
      .limit(convIds.length * 5); // grab a few per conv to cover all 3

    // Keep only the newest message per conversationId
    const seen = new Set<number>();
    for (const m of msgs) {
      if (!seen.has(m.conversationId)) {
        seen.add(m.conversationId);
        lastMessages.push({ conversationId: m.conversationId, body: m.body });
      }
    }
  }

  const lastMessageMap = new Map(lastMessages.map((m) => [m.conversationId, m.body]));

  return (
    <div>
      <div className="mb-3">
        <span className="text-2xl font-bold text-foreground">{openCount}</span>
        <span className="ml-2 text-sm text-muted-foreground">
          open conversation{openCount !== 1 ? 's' : ''}
        </span>
      </div>
      {recent.length === 0 ? (
        <div className="py-2 text-center">
          <p className="text-sm text-muted-foreground mb-2">No conversations yet.</p>
          <Link
            href="/portal/inbox"
            className="text-sm text-primary hover:underline inline-flex items-center gap-1"
          >
            <span className="material-icons text-base">chat</span>
            View inbox
          </Link>
        </div>
      ) : (
        <ul className="space-y-2">
          {recent.map((c) => {
            const preview = lastMessageMap.get(c.id);
            const truncated = preview ? (preview.length > 60 ? preview.slice(0, 60) + '…' : preview) : null;
            return (
              <li key={c.id}>
                <Link
                  href="/portal/inbox"
                  className="flex items-start justify-between gap-2 hover:bg-accent p-2 rounded-lg transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {c.visitorName ?? 'Visitor'}
                    </p>
                    {truncated && (
                      <p className="text-xs text-muted-foreground truncate">{truncated}</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {new Date(c.lastMessageAt).toLocaleDateString()}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${
                      c.status === 'open'
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                        : c.status === 'assigned'
                          ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                          : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
                    }`}
                  >
                    {c.status}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
