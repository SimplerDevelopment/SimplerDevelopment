import type { db } from '@/lib/db';
import type { crmContacts, chatConversations } from '@/lib/db/schema';
import type { ContactRef, ConversationRef } from './types';
export type RepoDb = Pick<typeof db, 'select' | 'insert' | 'update'>;
export function parseWebchatExternalId(external: string): number | null {
  const m = /^webchat:(\d+)$/.exec(external);
  return m ? Number.parseInt(m[1], 10) : null;
}


export function toContactRef(row: typeof crmContacts.$inferSelect): ContactRef {
  return {
    id: row.id,
    clientId: row.clientId,
    firstName: row.firstName,
    lastName: row.lastName,
    email: row.email,
    phone: row.phone,
  };
}

export function toConversationRef(row: typeof chatConversations.$inferSelect): ConversationRef {
  return {
    id: row.id,
    clientId: row.clientId,
    status: row.status,
    aiMode: row.aiMode,
    externalConversationId: row.externalConversationId,
  };
}
