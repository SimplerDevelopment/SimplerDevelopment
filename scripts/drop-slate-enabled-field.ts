/**
 * One-off: drop the legacy "Slate Enabled" custom field from the postcaptain
 * CRM. Now redundant with the new "Uses Slate" field. The FK on
 * crm_custom_field_values.custom_field_id has ON DELETE CASCADE, so deleting
 * the field row drops every associated value in one shot.
 *
 * Idempotent — safe to re-run (no-op once field is gone).
 *
 * Usage:
 *   npx tsx scripts/drop-slate-enabled-field.ts [--email …] [--client-id N] [--field-name "Slate Enabled"] [--dry-run]
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });

const args = process.argv.slice(2);
function argVal(name: string, def?: string): string | undefined {
  const idx = args.indexOf(name);
  if (idx === -1) return def;
  return args[idx + 1];
}
const DRY = args.includes('--dry-run');
const EMAIL = argVal('--email', 'postcaptain@simplerdevelopment.com')!;
const CLIENT_ID_ARG = argVal('--client-id');
const FIELD_NAME = argVal('--field-name', 'Slate Enabled')!;

(async () => {
  const { db } = await import('../lib/db');
  const { users, clients, crmCustomFields, crmCustomFieldValues } = await import('../lib/db/schema');
  const { eq, and } = await import('drizzle-orm');

  let clientId: number;
  if (CLIENT_ID_ARG) {
    clientId = parseInt(CLIENT_ID_ARG, 10);
  } else {
    const [u] = await db.select({ id: users.id }).from(users).where(eq(users.email, EMAIL)).limit(1);
    if (!u) { console.error(`No user with email ${EMAIL}`); process.exit(1); }
    const [c] = await db.select({ id: clients.id, company: clients.company }).from(clients).where(eq(clients.userId, u.id)).limit(1);
    if (!c) { console.error(`User ${u.id} has no client`); process.exit(1); }
    clientId = c.id;
    console.log(`Resolved ${EMAIL} → client ${clientId} ("${c.company ?? '—'}")`);
  }

  const [field] = await db
    .select({ id: crmCustomFields.id })
    .from(crmCustomFields)
    .where(
      and(
        eq(crmCustomFields.clientId, clientId),
        eq(crmCustomFields.entityType, 'company'),
        eq(crmCustomFields.fieldName, FIELD_NAME),
      ),
    )
    .limit(1);
  if (!field) {
    console.log(`No custom field named "${FIELD_NAME}" on client ${clientId}. Nothing to do.`);
    process.exit(0);
  }

  const valueRows = await db
    .select({ id: crmCustomFieldValues.id })
    .from(crmCustomFieldValues)
    .where(eq(crmCustomFieldValues.customFieldId, field.id));
  console.log(`Field id=${field.id}  values=${valueRows.length}`);

  if (DRY) {
    console.log(`[dry-run] would delete field id=${field.id} (cascading ${valueRows.length} value rows)`);
    process.exit(0);
  }

  const deleted = await db
    .delete(crmCustomFields)
    .where(eq(crmCustomFields.id, field.id))
    .returning({ id: crmCustomFields.id });
  console.log(`Deleted field id=${field.id} ("${FIELD_NAME}"). ${deleted.length === 1 ? 'OK' : 'Nothing removed?'}`);
  process.exit(0);
})().catch((err) => { console.error(err); process.exit(1); });
