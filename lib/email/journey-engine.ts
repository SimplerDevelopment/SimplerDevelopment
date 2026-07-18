/**
 * Email Journey Engine — enrollment helpers.
 *
 * Kept intentionally pure-ish (no side-effects beyond DB inserts) so that
 * unit tests can inject a mock `db` or simply call the exported helpers
 * against a test database without standing up the full Next.js server.
 *
 * Key decisions:
 *  - Re-enrollment is NOT allowed. `enrollSubscriber` uses onConflictDoNothing
 *    on the unique (journey_id, subscriber_id) index — a second call for the
 *    same pair is a no-op and returns null.
 *  - `onEmailSubscriberJoined` scans active journeys with triggerType =
 *    'list_join' whose triggerConfig.listId matches the subscriber's list.
 *    It is designed to be called from the subscriber-add route; kept here so
 *    the automation event-bus can also forward 'email.subscriber.joined' events.
 */

import { db } from '@/lib/db';
import {
  emailJourneys,
  emailJourneyEnrollments,
  emailSubscribers,
} from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';

/**
 * Enroll a single subscriber into a journey.
 *
 * Returns the new enrollment row if inserted, or null if the subscriber is
 * already enrolled (unique-index conflict — no re-enrollment).
 */
export async function enrollSubscriber(
  journeyId: number,
  subscriberId: number,
  clientId: number,
): Promise<typeof emailJourneyEnrollments.$inferSelect | null> {
  const rows = await db
    .insert(emailJourneyEnrollments)
    .values({
      journeyId,
      subscriberId,
      clientId,
      status: 'active',
      currentStepOrder: 0,
      nextRunAt: new Date(),
      enrolledAt: new Date(),
    })
    .onConflictDoNothing()
    .returning();

  return rows[0] ?? null;
}

/**
 * Enroll a subscriber into all active list_join journeys for their list.
 *
 * Intended to be called whenever a subscriber is added to a list — either
 * from the portal route or from the public signup form (Phase 3). Safe to
 * call concurrently; the unique index prevents duplicates.
 *
 * @param subscriberId - the newly-added subscriber
 * @param listId       - the list they joined
 * @param clientId     - tenant scope
 */
export async function onEmailSubscriberJoined(
  subscriberId: number,
  listId: number,
  clientId: number,
): Promise<void> {
  // Find all active journeys for this client that trigger on list_join for
  // this particular list. triggerConfig is a JSON column; we cast and check
  // in application code to keep the DB query simple.
  const journeys = await db
    .select({
      id: emailJourneys.id,
      triggerConfig: emailJourneys.triggerConfig,
    })
    .from(emailJourneys)
    .where(
      and(
        eq(emailJourneys.clientId, clientId),
        eq(emailJourneys.status, 'active'),
        eq(emailJourneys.triggerType, 'list_join'),
      ),
    );

  for (const journey of journeys) {
    const cfg = journey.triggerConfig as { listId?: number } | null;
    if (!cfg || cfg.listId !== listId) continue;
    // Fire-and-forget per enrollment; errors do not abort the loop.
    try {
      await enrollSubscriber(journey.id, subscriberId, clientId);
    } catch {
      // Non-fatal — the next journey still gets processed.
    }
  }
}

/**
 * Look up the subscriber's listId so callers who only have a subscriberId can
 * invoke onEmailSubscriberJoined.
 */
export async function getSubscriberListId(subscriberId: number): Promise<number | null> {
  const [row] = await db
    .select({ listId: emailSubscribers.listId })
    .from(emailSubscribers)
    .where(eq(emailSubscribers.id, subscriberId))
    .limit(1);
  return row?.listId ?? null;
}
