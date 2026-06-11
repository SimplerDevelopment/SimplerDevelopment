/**
 * extract-marketing.ts
 * Fetches all PropertyRadar marketing pages and writes per-page JSON files
 * plus a combined marketing.json array.
 *
 * Usage:
 *   npx tsx scripts/migrations/propertyradar/extract-marketing.ts
 *
 * Idempotent — re-running overwrites existing output files.
 */

import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";
import { extractPage } from "./lib-extract";

const DATA_DIR = path.join(import.meta.dirname, "data");
const URLS_FILE = path.join(DATA_DIR, "urls-marketing.txt");
const OUT_DIR = path.join(DATA_DIR, "marketing");

const CONCURRENCY = 5;
const DELAY_MS = 200;

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function readLines(file: string): Promise<string[]> {
  const rl = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
  const lines: string[] = [];
  for await (const line of rl) {
    const trimmed = line.trim();
    if (trimmed) lines.push(trimmed);
  }
  return lines;
}

async function processUrl(url: string, index: number, total: number): Promise<{ ok: boolean; slug: string; error?: string }> {
  try {
    const data = await extractPage(url);
    const outPath = path.join(OUT_DIR, `${data.slug}.json`);
    fs.writeFileSync(outPath, JSON.stringify(data, null, 2), "utf8");
    console.log(`  [${index + 1}/${total}] ✓  ${url}  →  ${data.slug}.json`);
    return { ok: true, slug: data.slug };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`  [${index + 1}/${total}] ✗  ${url}  —  ${msg}`);
    return { ok: false, slug: "", error: msg };
  }
}

async function main() {
  // Ensure output dir
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const urls = await readLines(URLS_FILE);
  console.log(`\nExtracting ${urls.length} marketing pages (concurrency=${CONCURRENCY}, delay=${DELAY_MS}ms)…\n`);

  const results: { url: string; ok: boolean; slug: string; error?: string }[] = [];
  const allPages: unknown[] = [];

  // Process in batches of CONCURRENCY
  for (let i = 0; i < urls.length; i += CONCURRENCY) {
    const batch = urls.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(
      batch.map((url, j) => processUrl(url, i + j, urls.length))
    );

    for (let j = 0; j < batch.length; j++) {
      const r = batchResults[j];
      results.push({ url: batch[j], ...r });
      if (r.ok) {
        const slug = r.slug;
        const filePath = path.join(OUT_DIR, `${slug}.json`);
        try {
          allPages.push(JSON.parse(fs.readFileSync(filePath, "utf8")));
        } catch {
          // file write may have failed above — already logged
        }
      }
    }

    // Polite delay between batches (skip after last batch)
    if (i + CONCURRENCY < urls.length) {
      await sleep(DELAY_MS);
    }
  }

  // Write combined file
  const combinedPath = path.join(DATA_DIR, "marketing.json");
  fs.writeFileSync(combinedPath, JSON.stringify(allPages, null, 2), "utf8");

  // Summary
  const succeeded = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok);

  console.log(`\n── Summary ──────────────────────────────────────────────`);
  console.log(`  Succeeded : ${succeeded} / ${results.length}`);
  console.log(`  Failed    : ${failed.length}`);
  if (failed.length > 0) {
    failed.forEach((f) => console.error(`    ✗  ${f.url}  —  ${f.error}`));
  }
  console.log(`  Output    : ${OUT_DIR}/<slug>.json`);
  console.log(`  Combined  : ${combinedPath}`);
  console.log(`────────────────────────────────────────────────────────\n`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
