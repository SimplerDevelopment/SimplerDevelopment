/**
 * Restore postcaptain customCss / customJs from a backup file produced by
 * consolidate-custom-code.ts. Use only if the consolidation needs to be
 * rolled back (visual regression, broken styling, etc.).
 *
 * Run:
 *   bun -r dotenv/config scripts/migrations/postcaptain/_restore-from-backup.ts dotenv_config_path=.env.local <backup-path>
 */
import 'dotenv/config';
import { db } from '@/lib/db';
import { clientWebsites, postTypes, posts } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { readFileSync } from 'node:fs';

interface Backup {
  site: { id: number; customCss: string | null; customJs: string | null };
  types: { id: number; slug: string; customCss: string | null; customJs: string | null }[];
  posts: { id: number; postType: string; slug: string; customCss: string | null; customJs: string | null }[];
}

async function main() {
  const path = process.argv.slice(2).find(a => !a.startsWith('--') && !a.includes('dotenv_config_path'));
  if (!path) throw new Error('Usage: _restore-from-backup.ts <backup-path>');
  const backup = JSON.parse(readFileSync(path, 'utf8')) as Backup;
  console.log(`Restoring site ${backup.site.id}, ${backup.types.length} types, ${backup.posts.length} posts from ${path}`);

  await db.transaction(async (tx) => {
    await tx.update(clientWebsites)
      .set({ customCss: backup.site.customCss, customJs: backup.site.customJs, updatedAt: new Date() })
      .where(eq(clientWebsites.id, backup.site.id));
    for (const t of backup.types) {
      await tx.update(postTypes)
        .set({ customCss: t.customCss, customJs: t.customJs, updatedAt: new Date() })
        .where(eq(postTypes.id, t.id));
    }
    for (const p of backup.posts) {
      await tx.update(posts)
        .set({ customCss: p.customCss, customJs: p.customJs, updatedAt: new Date() })
        .where(eq(posts.id, p.id));
    }
  });
  console.log('Restored.');
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
