import { createHmac, timingSafeEqual } from 'crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { kanbanCards, kanbanCardWatchers, kanbanCardComments, projects, users } from '@/lib/db/schema';
import { resend } from './email/index';

const BASE_URL = process.env.NEXTAUTH_URL || 'https://simplerdevelopment.com';
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'portal@simplerdevelopment.com';

/**
 * Activity types that should email watchers. Noisy events (label toggle,
 * priority flip, etc.) are intentionally excluded.
 */
const NOTIFIED_EVENTS = new Set<string>([
  'card.commented',
  'card.assignee_added',
  'card.due_date_changed',
  'card.sprint_changed',
  'card.column_changed',
  'card.dependency_added',
]);

export function isEmailNotifiedEvent(event: string): boolean {
  return NOTIFIED_EVENTS.has(event);
}

function unsubscribeSecret(): string {
  return process.env.NOTIFY_UNSUBSCRIBE_SECRET || process.env.NEXTAUTH_SECRET || 'dev-unsubscribe-secret';
}

export function signUnsubscribe(cardId: number, userId: number): string {
  return createHmac('sha256', unsubscribeSecret())
    .update(`${cardId}:${userId}`)
    .digest('hex')
    .slice(0, 32);
}

export function verifyUnsubscribe(cardId: number, userId: number, token: string): boolean {
  try {
    const expected = signUnsubscribe(cardId, userId);
    const a = Buffer.from(expected, 'hex');
    const b = Buffer.from(token, 'hex');
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function escape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function verb(event: string, payload: Record<string, unknown>): string {
  switch (event) {
    case 'card.commented':        return 'commented on';
    case 'card.assignee_added':   return `assigned ${payload.name ?? 'someone'} to`;
    case 'card.due_date_changed': return payload.to ? 'changed the due date on' : 'cleared the due date on';
    case 'card.sprint_changed':   return payload.to ? 'moved to a sprint' : 'removed from the sprint';
    case 'card.column_changed':   return 'moved';
    case 'card.dependency_added': return `added a blocker to`;
    default:                      return 'updated';
  }
}

/**
 * Fire-and-forget: email watchers about an event. Skips the actor.
 * Also emails @mentioned users who aren't already watchers (for card.commented).
 */
export function notifyCardEvent(
  cardId: number,
  event: string,
  actorId: number | null,
  payload: Record<string, unknown>,
): void {
  if (!NOTIFIED_EVENTS.has(event)) return;

  (async () => {
    try {
      const [card] = await db.select().from(kanbanCards).where(eq(kanbanCards.id, cardId)).limit(1);
      if (!card) return;

      const [project] = await db.select().from(projects).where(eq(projects.id, card.projectId)).limit(1);
      if (!project) return;

      const key = project.projectKey && card.number != null ? `${project.projectKey}-${card.number}` : `#${cardId}`;

      // Target user ids: watchers + mentioned (on comments), minus the actor
      const targetIds = new Set<number>();
      const watcherRows = await db
        .select({ userId: kanbanCardWatchers.userId })
        .from(kanbanCardWatchers)
        .where(eq(kanbanCardWatchers.cardId, cardId));
      for (const w of watcherRows) targetIds.add(w.userId);

      if (event === 'card.commented' && typeof payload.commentId === 'number') {
        const [comment] = await db.select().from(kanbanCardComments)
          .where(eq(kanbanCardComments.id, payload.commentId as number)).limit(1);
        if (comment?.mentions) for (const uid of comment.mentions as number[]) targetIds.add(uid);
      }

      if (actorId != null) targetIds.delete(actorId);
      if (targetIds.size === 0) return;

      // Resolve email addresses
      const recipients = await db
        .select({ id: users.id, name: users.name, email: users.email })
        .from(users)
        .where(inArray(users.id, [...targetIds]));

      const actorName = actorId
        ? (await db.select({ name: users.name }).from(users).where(eq(users.id, actorId)).limit(1))[0]?.name ?? 'Someone'
        : 'Someone';

      const cardUrl = `${BASE_URL}/portal/projects/${card.projectId}?card=${cardId}`;
      const verbText = verb(event, payload);
      const subject = `[${key}] ${actorName} ${verbText} "${card.title}"`;

      for (const r of recipients) {
        if (!r.email) continue;
        const unsubToken = signUnsubscribe(cardId, r.id);
        const unsubUrl = `${BASE_URL}/api/portal/cards/${cardId}/unsubscribe?u=${r.id}&t=${unsubToken}`;

        const commentBody = event === 'card.commented' && typeof payload.commentId === 'number'
          ? (await db.select().from(kanbanCardComments).where(eq(kanbanCardComments.id, payload.commentId as number)).limit(1))[0]?.body
          : null;

        const html = `
          <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:600px;margin:0 auto;background:#ffffff;color:#0f172a;">
            <div style="padding:32px 28px;border-bottom:1px solid #e2e8f0;">
              <p style="margin:0 0 8px;font-size:12px;color:#64748b;letter-spacing:0.5px;text-transform:uppercase;">${escape(project.name)}</p>
              <p style="margin:0 0 4px;font-size:12px;font-family:monospace;color:#64748b;">${escape(key)}</p>
              <h1 style="margin:0;font-size:18px;font-weight:600;line-height:1.3;">${escape(card.title)}</h1>
            </div>
            <div style="padding:24px 28px;">
              <p style="margin:0 0 16px;font-size:15px;line-height:1.5;">
                <strong>${escape(actorName)}</strong> ${escape(verbText)} this card.
              </p>
              ${commentBody ? `<blockquote style="margin:0 0 16px;padding:12px 16px;background:#f8fafc;border-left:3px solid #6366f1;border-radius:4px;font-size:14px;color:#334155;white-space:pre-wrap;">${escape(commentBody.slice(0, 2000))}</blockquote>` : ''}
              <p style="margin:16px 0 0;">
                <a href="${cardUrl}" style="display:inline-block;padding:10px 20px;background:#6366f1;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:500;font-size:14px;">View card</a>
              </p>
            </div>
            <div style="padding:16px 28px;border-top:1px solid #e2e8f0;font-size:12px;color:#94a3b8;">
              You're receiving this because you're watching this card.
              <a href="${unsubUrl}" style="color:#6366f1;">Stop watching</a>.
            </div>
          </div>
        `;

        resend.emails.send({
          from: FROM_EMAIL,
          to: r.email,
          subject,
          html,
          text: `${actorName} ${verbText} ${key}: ${card.title}\n\n${commentBody ? commentBody + '\n\n' : ''}${cardUrl}\n\nStop watching: ${unsubUrl}`,
        }).catch(err => console.error('[notifyCardEvent send]', err));
      }
    } catch (err) {
      console.error('[notifyCardEvent]', err);
    }
  })();
}

// Used by the unsubscribe endpoint to drop a watcher
export async function unwatch(cardId: number, userId: number): Promise<void> {
  await db.delete(kanbanCardWatchers)
    .where(and(eq(kanbanCardWatchers.cardId, cardId), eq(kanbanCardWatchers.userId, userId)));
}

