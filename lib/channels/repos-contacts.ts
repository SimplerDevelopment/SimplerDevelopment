import { and, eq } from 'drizzle-orm';
import type { GatewayRepos } from './gateway';
import type { RepoDb } from './repos-types';
import { contactIdentities, crmContacts } from '@/lib/db/schema';
import { toContactRef } from './repos-types';

async function findContactByIdentity(db: RepoDb, ...args: Parameters<GatewayRepos['findContactByIdentity']>): ReturnType<GatewayRepos['findContactByIdentity']> {
  const [clientId, identity] = args;

  const [link] = await db
    .select()
    .from(contactIdentities)
    .where(
      and(
        eq(contactIdentities.clientId, clientId),
        eq(contactIdentities.kind, identity.kind),
        eq(contactIdentities.value, identity.value),
      ),
    )
    .limit(1);
  if (!link) return null;
  const [contact] = await db
    .select()
    .from(crmContacts)
    .where(and(eq(crmContacts.id, link.contactId), eq(crmContacts.clientId, clientId)))
    .limit(1);
  return contact ? toContactRef(contact) : null;

}

async function createContact(db: RepoDb, ...args: Parameters<GatewayRepos['createContact']>): ReturnType<GatewayRepos['createContact']> {
  const [clientId, identity, opts] = args;

  const [created] = await db
    .insert(crmContacts)
    .values({
      clientId,
      firstName: opts?.name ?? 'Visitor',
      source: 'webchat',
      status: 'lead',
      ...(identity.kind === 'email' ? { email: identity.value } : {}),
      ...(identity.kind === 'phone' ? { phone: identity.value } : {}),
    })
    .returning();
  return toContactRef(created);

}

async function linkIdentity(db: RepoDb, ...args: Parameters<GatewayRepos['linkIdentity']>): ReturnType<GatewayRepos['linkIdentity']> {
  const [clientId, contactId, identity] = args;

  await db
    .insert(contactIdentities)
    .values({
      clientId,
      contactId,
      kind: identity.kind,
      value: identity.value,
    })
    .onConflictDoNothing({
      target: [
        contactIdentities.clientId,
        contactIdentities.kind,
        contactIdentities.value,
      ],
    });

}

export function createContactsRepos(db: RepoDb): Pick<GatewayRepos, 'findContactByIdentity' | 'createContact' | 'linkIdentity'> {
  return {
    findContactByIdentity: (...args) => findContactByIdentity(db, ...args),
    createContact: (...args) => createContact(db, ...args),
    linkIdentity: (...args) => linkIdentity(db, ...args),
  };
}
