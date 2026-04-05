import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });

async function setup() {
  const { db } = await import('../../../lib/db');
  const { clients, users, crmPipelines, crmPipelineStages } = await import('../../../lib/db/schema');
  const { eq } = await import('drizzle-orm');

  const email = 'cystrategies@simplerdevelopment.com';

  // Find the Cy Strategies client
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user) {
    console.error('CY Strategies user not found. Run setup-client.ts first.');
    process.exit(1);
  }

  const [client] = await db.select().from(clients).where(eq(clients.userId, user.id)).limit(1);
  if (!client) {
    console.error('CY Strategies client not found. Run setup-client.ts first.');
    process.exit(1);
  }

  console.log(`Found client: ID ${client.id} (${client.company})`);

  // Check if pipeline already exists
  const existingPipelines = await db
    .select()
    .from(crmPipelines)
    .where(eq(crmPipelines.clientId, client.id));

  if (existingPipelines.length > 0) {
    console.log(`Pipeline already exists: ${existingPipelines.map(p => `${p.id} (${p.name})`).join(', ')}`);
    process.exit(0);
  }

  // Create the main sales pipeline for a marketing consulting firm
  const [pipeline] = await db
    .insert(crmPipelines)
    .values({
      clientId: client.id,
      name: 'Consulting Sales',
      isDefault: true,
    })
    .returning();

  console.log(`Pipeline created: ID ${pipeline.id} (${pipeline.name})`);

  // Stages tailored for marketing consulting:
  // Discovery -> Needs Assessment -> Proposal Sent -> Under Review -> Closed Won / Closed Lost
  const stages = [
    { name: 'Discovery',        color: '#94a3b8', sortOrder: 0, probability: 10 },
    { name: 'Needs Assessment', color: '#3b82f6', sortOrder: 1, probability: 25 },
    { name: 'Proposal Sent',    color: '#8b5cf6', sortOrder: 2, probability: 50 },
    { name: 'Under Review',     color: '#f59e0b', sortOrder: 3, probability: 75 },
    { name: 'Closed Won',       color: '#22c55e', sortOrder: 4, probability: 100 },
    { name: 'Closed Lost',      color: '#ef4444', sortOrder: 5, probability: 0 },
  ];

  const createdStages = await db
    .insert(crmPipelineStages)
    .values(
      stages.map((s) => ({
        pipelineId: pipeline.id,
        name: s.name,
        color: s.color,
        sortOrder: s.sortOrder,
        probability: s.probability,
      }))
    )
    .returning();

  console.log('\nStages created:');
  for (const stage of createdStages) {
    console.log(`  ${stage.sortOrder}. ${stage.name} (${stage.color}, ${stage.probability}%)`);
  }

  console.log('\n=== PIPELINE SETUP COMPLETE ===');
  console.log(JSON.stringify({ clientId: client.id, pipelineId: pipeline.id, stageCount: createdStages.length }));

  process.exit(0);
}

setup().catch((err) => {
  console.error(err);
  process.exit(1);
});
