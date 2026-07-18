// Registered mobile device push tokens (Expo). One row per device; the token
// is the credential. Used to fan out approval-needed pushes to a client's
// owners/admins (see lib/push/send.ts, hooked into stageOrApply).

import { pgTable, serial, varchar, timestamp, integer, index } from 'drizzle-orm/pg-core';
import { users } from './auth';
import { clients } from './sites';

export const devicePushTokens = pgTable(
  'device_push_tokens',
  {
    id: serial('id').primaryKey(),
    clientId: integer('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // The ExponentPushToken[...] string. Unique so re-registering rebinds.
    token: varchar('token', { length: 256 }).notNull().unique(),
    platform: varchar('platform', { length: 16 }), // 'ios' | 'android'
    createdAt: timestamp('created_at').notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at').notNull().defaultNow(),
    // Set when revoked (sign-out) or reaped (DeviceNotRegistered receipt).
    revokedAt: timestamp('revoked_at'),
  },
  (t) => ({
    clientUserIdx: index('device_push_tokens_client_user_idx').on(t.clientId, t.userId),
  }),
);
