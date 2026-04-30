import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local' });

const PROD_INDICATORS = ['tramway.proxy.rlwy.net:43167'];
const TARGET_EMAIL = 'info@danielpcoyle.com';
const POSTCAPTAIN_OWNER_EMAIL = 'postcaptain@simplerdevelopment.com';
const ROLE = process.env.ROLE || 'member';

async function run() {
  const dbUrl = process.env.DATABASE_URL || '';
  if (!dbUrl) {
    console.error('DATABASE_URL is not set — refusing to run.');
    process.exit(1);
  }
  const masked = dbUrl.replace(/:\/\/[^@]+@/, '://***@');
  const hitProd =
    PROD_INDICATORS.some((p) => dbUrl.includes(p)) ||
    process.env.RAILWAY_ENVIRONMENT_NAME === 'production';

  const { db } = await import('../../../lib/db');
  const { users, clients, clientMembers } = await import('../../../lib/db/schema');
  const { eq, and } = await import('drizzle-orm');

  const [targetUser] = await db.select().from(users).where(eq(users.email, TARGET_EMAIL)).limit(1);
  if (!targetUser) throw new Error(`User not found: ${TARGET_EMAIL}`);

  const [ownerUser] = await db
    .select()
    .from(users)
    .where(eq(users.email, POSTCAPTAIN_OWNER_EMAIL))
    .limit(1);
  if (!ownerUser) throw new Error(`Postcaptain owner user not found: ${POSTCAPTAIN_OWNER_EMAIL}`);

  const [postcaptainClient] = await db
    .select()
    .from(clients)
    .where(eq(clients.userId, ownerUser.id))
    .limit(1);
  if (!postcaptainClient) {
    throw new Error(`No clients row owned by ${POSTCAPTAIN_OWNER_EMAIL} (user_id=${ownerUser.id})`);
  }

  console.log(`DATABASE_URL: ${masked}${hitProd ? ' (PRODUCTION)' : ''}`);
  console.log(`Target user:  id=${targetUser.id} email=${targetUser.email}`);
  console.log(
    `Postcaptain:  client_id=${postcaptainClient.id} owner=${ownerUser.email} (user_id=${ownerUser.id})`,
  );

  const [existing] = await db
    .select()
    .from(clientMembers)
    .where(
      and(
        eq(clientMembers.clientId, postcaptainClient.id),
        eq(clientMembers.userId, targetUser.id),
      ),
    )
    .limit(1);

  if (existing && existing.role === ROLE) {
    console.log(
      `Already a member with desired role: client_members.id=${existing.id}, role=${existing.role}. Nothing to do.`,
    );
    process.exit(0);
  }

  if (process.env.DRY_RUN === '1') {
    if (existing) {
      console.log(
        `\nDRY RUN — would UPDATE client_members.id=${existing.id} role: '${existing.role}' → '${ROLE}'`,
      );
    } else {
      console.log(
        `\nDRY RUN — would INSERT client_members (client_id=${postcaptainClient.id}, user_id=${targetUser.id}, role='${ROLE}')`,
      );
    }
    process.exit(0);
  }

  if (hitProd && process.env.ALLOW_PROD !== '1') {
    console.error('Refusing to write to production. Re-run with ALLOW_PROD=1 if intentional.');
    process.exit(1);
  }

  if (existing) {
    const [updated] = await db
      .update(clientMembers)
      .set({ role: ROLE })
      .where(eq(clientMembers.id, existing.id))
      .returning();
    console.log(
      `Updated client_members.id=${updated.id} role: '${existing.role}' → '${updated.role}'`,
    );
    process.exit(0);
  }

  const [inserted] = await db
    .insert(clientMembers)
    .values({
      clientId: postcaptainClient.id,
      userId: targetUser.id,
      role: ROLE,
      invitedBy: ownerUser.id,
    })
    .returning();

  console.log(
    `Inserted client_members.id=${inserted.id} (client_id=${inserted.clientId}, user_id=${inserted.userId}, role=${inserted.role})`,
  );
  process.exit(0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
