/**
 * Seed the default "Today" daily-note template for the Post Captain client
 * (clientId=100). Idempotent: if a template named "Today" already exists for
 * that client, the script reports it and exits without modifying anything.
 *
 * Run: `bun scripts/migrations/postcaptain/seed-daily-template.ts`
 */
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const CLIENT_ID = 100;
const TEMPLATE_NAME = 'Today';

const BODY = `# {{today.long}}

## Top of mind

-

## Recent meetings (last 7 days)
{{recent_meetings}}

## Open tasks
{{open_tasks}}

## Notes
`;

async function main() {
  const { db } = await import('../../../lib/db');
  const { brainNoteTemplates } = await import('../../../lib/db/schema');
  const { and, eq } = await import('drizzle-orm');

  const [existing] = await db.select().from(brainNoteTemplates)
    .where(and(
      eq(brainNoteTemplates.clientId, CLIENT_ID),
      eq(brainNoteTemplates.name, TEMPLATE_NAME),
    ))
    .limit(1);

  if (existing) {
    console.log(`Template "${TEMPLATE_NAME}" already exists for client ${CLIENT_ID} (id=${existing.id}). Skipping.`);
    process.exit(0);
  }

  const [created] = await db.insert(brainNoteTemplates).values({
    clientId: CLIENT_ID,
    name: TEMPLATE_NAME,
    body: BODY,
    trigger: 'daily',
    variables: ['today.long', 'recent_meetings', 'open_tasks'],
    defaultTags: ['daily', 'brief'],
    enabled: true,
  }).returning();

  console.log(`Created template "${TEMPLATE_NAME}" id=${created.id} for client ${CLIENT_ID}.`);
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
