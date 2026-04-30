import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local' });

const PROD_INDICATORS = ['tramway.proxy.rlwy.net:43167'];

const WEBSITE_ID = 142;
const BACKUP_PATH = '.migration-backup/20260421-200249/retain-data.sql';
const POST_ID_IN_BACKUP = 296;

const SEO_TITLE = 'CY Strategies | Marketing Strategy Built for Clarity and Scale';
const SEO_DESCRIPTION =
  'I design marketing strategies that connect audience, message, channels, and measurement into a system that grows with your business. 16+ years enterprise marketing experience.';

function extractContentFromBackup(filePath: string, postId: number): string {
  const sql = fs.readFileSync(filePath, 'utf-8');
  const needle = `VALUES (${postId}, 'Home', 'home', NULL, '`;
  const start = sql.indexOf(needle);
  if (start < 0) {
    throw new Error(`Backup row for post id ${postId} not found in ${filePath}`);
  }

  let i = start + needle.length;
  let content = '';
  while (i < sql.length) {
    const ch = sql[i];
    if (ch === "'") {
      if (sql[i + 1] === "'") {
        content += "'";
        i += 2;
      } else {
        break;
      }
    } else {
      content += ch;
      i += 1;
    }
  }
  if (i >= sql.length) throw new Error('Unterminated content string in backup');

  JSON.parse(content);
  return content;
}

async function restore() {
  const absBackup = path.join(process.cwd(), BACKUP_PATH);
  const content = extractContentFromBackup(absBackup, POST_ID_IN_BACKUP);
  const parsed = JSON.parse(content) as { blocks: Array<{ id: string; type: string }> };

  console.log(`Backup: ${absBackup}`);
  console.log(`Content size: ${content.length} bytes`);
  console.log(`Top-level blocks: ${parsed.blocks.length}`);
  console.log(`  ${parsed.blocks.map((b) => `${b.id} (${b.type})`).join('\n  ')}`);

  if (process.env.DRY_RUN === '1') {
    console.log('\n=== DRY RUN — no DB changes ===');
    process.exit(0);
  }

  const dbUrl = process.env.DATABASE_URL || '';
  if (!dbUrl) {
    console.error('DATABASE_URL is not set — refusing to run.');
    process.exit(1);
  }
  const masked = dbUrl.replace(/:\/\/[^@]+@/, '://***@');
  const hitProd =
    PROD_INDICATORS.some((p) => dbUrl.includes(p)) ||
    process.env.RAILWAY_ENVIRONMENT_NAME === 'production';
  if (hitProd && process.env.ALLOW_PROD !== '1') {
    console.error(`\nDATABASE_URL → ${masked}`);
    console.error('Refusing to write to production. Re-run with ALLOW_PROD=1 if intentional.');
    process.exit(1);
  }
  console.log(`\nDATABASE_URL: ${masked}${hitProd ? ' (PRODUCTION — ALLOW_PROD=1 active)' : ''}`);

  const { db } = await import('../../../lib/db');
  const { posts } = await import('../../../lib/db/schema');
  const { eq, and } = await import('drizzle-orm');

  const existing = await db
    .select()
    .from(posts)
    .where(and(eq(posts.websiteId, WEBSITE_ID), eq(posts.slug, 'home')))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(posts)
      .set({
        content,
        title: 'Home',
        seoTitle: SEO_TITLE,
        seoDescription: SEO_DESCRIPTION,
        published: true,
        updatedAt: new Date(),
      })
      .where(eq(posts.id, existing[0].id));
    console.log(`Home page UPDATED — post id ${existing[0].id} (website_id=${WEBSITE_ID})`);
  } else {
    const [page] = await db
      .insert(posts)
      .values({
        title: 'Home',
        slug: 'home',
        postType: 'page',
        content,
        published: true,
        websiteId: WEBSITE_ID,
        seoTitle: SEO_TITLE,
        seoDescription: SEO_DESCRIPTION,
      })
      .returning();
    console.log(`Home page CREATED — post id ${page.id} (website_id=${WEBSITE_ID})`);
  }

  console.log('\n=== HOME PAGE RESTORE COMPLETE ===');
  process.exit(0);
}

restore().catch((err) => {
  console.error(err);
  process.exit(1);
});
