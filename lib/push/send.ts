/**
 * Expo push sender for approval-needed notifications (P0.4 increment 4a).
 *
 * Looks up the active device tokens for a set of recipient users and pushes
 * an "Approval needed" notification carrying the pending-change id, so the
 * mobile app can deep-link / action it (Approve / Reject) from the lock screen.
 *
 * The Expo Push API (`exp.host/--/api/v2/push/send`) needs no auth — the
 * ExponentPushToken IS the credential. Fire-and-forget from the staging path;
 * never block the tool response. Dead tokens (DeviceNotRegistered) are reaped.
 */

import { and, eq, inArray, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { devicePushTokens } from '@/lib/db/schema';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const BATCH = 100; // Expo accepts up to 100 messages per request.

interface ExpoTicket {
  status?: 'ok' | 'error';
  details?: { error?: string };
}

export async function sendApprovalPush(opts: {
  clientId: number;
  userIds: number[];
  pendingId: number;
  summary: string;
}): Promise<void> {
  if (opts.userIds.length === 0) return;

  const rows = await db
    .select({ id: devicePushTokens.id, token: devicePushTokens.token })
    .from(devicePushTokens)
    .where(
      and(
        eq(devicePushTokens.clientId, opts.clientId),
        inArray(devicePushTokens.userId, opts.userIds),
        isNull(devicePushTokens.revokedAt),
      ),
    );
  if (rows.length === 0) return;

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const messages = batch.map((r) => ({
      to: r.token,
      title: 'Approval needed',
      body: opts.summary,
      sound: 'default',
      categoryId: 'mcp_approval', // mobile registers Approve/Reject actions on this
      data: { kind: 'mcp_approval', pendingId: opts.pendingId },
    }));

    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(messages),
      });
      const json = (await res.json().catch(() => null)) as { data?: ExpoTicket[] } | null;
      const tickets = json?.data ?? [];

      // Reap tokens Expo reports as permanently unreachable.
      const dead: number[] = [];
      tickets.forEach((t, idx) => {
        if (t?.status === 'error' && t?.details?.error === 'DeviceNotRegistered') {
          const row = batch[idx];
          if (row) dead.push(row.id);
        }
      });
      if (dead.length > 0) {
        await db
          .update(devicePushTokens)
          .set({ revokedAt: new Date() })
          .where(inArray(devicePushTokens.id, dead));
      }
    } catch (err) {
      console.warn('[push] Expo send failed:', err);
    }
  }
}
