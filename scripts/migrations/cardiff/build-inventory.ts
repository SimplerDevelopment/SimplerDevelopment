/**
 * Cardiff migration — Build inventory JSON for blog/news/reports
 *
 * Reads URL lists from /tmp and writes inventory-*.json files.
 *
 * Run:  npx tsx scripts/migrations/cardiff/build-inventory.ts
 */

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

function slugFromUrl(url: string, prefix: string): string {
  const path = new URL(url).pathname.replace(/^\/|\/$/g, '');
  // /learn/foo/  → blog-foo  ;  /learn/news/foo/  → news-foo  ;  /learn/reports/foo/  → reports-foo
  const last = path.split('/').pop() || '';
  return `${prefix}-${last}`.slice(0, 255);
}

function build(file: string, prefix: string, outFile: string) {
  const urls = readFileSync(file, 'utf-8').trim().split('\n').filter(Boolean);
  const records = urls
    .filter(u => u && !u.endsWith('/learn/news/') && !u.endsWith('/learn/reports/'))
    .map(url => ({
      url,
      slug: slugFromUrl(url, prefix),
      template: 'simple' as const,
    }));
  writeFileSync(join('scripts/migrations/cardiff', outFile), JSON.stringify(records, null, 2));
  console.log(`✅ ${outFile} → ${records.length} entries`);
}

build('/tmp/blog-urls.txt', 'blog', 'inventory-blog.json');
build('/tmp/news-urls.txt', 'news', 'inventory-news.json');
build('/tmp/reports-urls.txt', 'reports', 'inventory-reports.json');
