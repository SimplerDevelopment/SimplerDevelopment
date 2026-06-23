import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });

async function cleanup() {
  const { db } = await import('../lib/db');
  const { sql } = await import('drizzle-orm');

  // Delete test pipelines (keep "South Philly Sales" and "Sales Pipeline")
  const result = await db.execute(sql`
    DELETE FROM crm_pipelines 
    WHERE name LIKE 'Test Pipeline%'
    RETURNING id, name
  `);
  console.log(`Deleted ${result.length} test pipelines`);

  // Delete duplicate contacts (keep lowest ID for each email)
  const dupes = await db.execute(sql`
    DELETE FROM crm_contacts 
    WHERE id NOT IN (
      SELECT MIN(id) FROM crm_contacts GROUP BY client_id, email, first_name, last_name
    )
    RETURNING id, first_name, last_name
  `);
  console.log(`Deleted ${dupes.length} duplicate contacts`);

  // Delete duplicate companies (keep lowest ID for each name per client)
  const dupCompanies = await db.execute(sql`
    DELETE FROM crm_companies 
    WHERE id NOT IN (
      SELECT MIN(id) FROM crm_companies GROUP BY client_id, name
    )
    RETURNING id, name
  `);
  console.log(`Deleted ${dupCompanies.length} duplicate companies`);

  // Delete duplicate deals (keep lowest ID for each title per client)
  const dupDeals = await db.execute(sql`
    DELETE FROM crm_deals 
    WHERE id NOT IN (
      SELECT MIN(id) FROM crm_deals GROUP BY client_id, title, pipeline_id
    )
    RETURNING id, title
  `);
  console.log(`Deleted ${dupDeals.length} duplicate deals`);

  // Delete duplicate proposals (keep lowest ID for each title per client)
  const dupProposals = await db.execute(sql`
    DELETE FROM crm_proposals 
    WHERE id NOT IN (
      SELECT MIN(id) FROM crm_proposals GROUP BY client_id, title
    )
    RETURNING id, title
  `);
  console.log(`Deleted ${dupProposals.length} duplicate proposals`);

  // Delete duplicate "Sales Pipeline" (keep one)
  const dupSalesPipelines = await db.execute(sql`
    DELETE FROM crm_pipelines 
    WHERE name = 'Sales Pipeline' 
    AND id NOT IN (
      SELECT MIN(id) FROM crm_pipelines WHERE name = 'Sales Pipeline' GROUP BY client_id
    )
    RETURNING id, name
  `);
  console.log(`Deleted ${dupSalesPipelines.length} duplicate Sales Pipelines`);

  console.log('\nCleanup complete!');
  process.exit(0);
}
cleanup().catch(err => { console.error(err); process.exit(1); });
