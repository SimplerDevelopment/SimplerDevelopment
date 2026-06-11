/**
 * extract-collection.ts
 * Generic extractor for plays / lists / coverage collection pages.
 *
 * Usage:
 *   npx tsx scripts/migrations/propertyradar/extract-collection.ts --type plays
 *   npx tsx scripts/migrations/propertyradar/extract-collection.ts --type lists --limit 10
 *   npx tsx scripts/migrations/propertyradar/extract-collection.ts --type coverage --limit 0  # all
 *
 * Default limit=3 (smoke test). Use --limit 0 for a full run.
 * Writes data/<type>.json (array).
 */

import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";
import { extractPage, ExtractedPage } from "./lib-extract";

const DATA_DIR = path.join(import.meta.dirname, "data");

const CONCURRENCY = 5;
const DELAY_MS = 200;
const DEFAULT_LIMIT = 3;

const TYPE_MAP: Record<string, string> = {
  plays: "urls-plays.txt",
  lists: "urls-lists.txt",
  coverage: "urls-coverage.txt",
};

// ── CLI args ──────────────────────────────────────────────────────────────

function getArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  return idx !== -1 ? process.argv[idx + 1] : undefined;
}

function getType(): string {
  const t = getArg("--type");
  if (!t || !TYPE_MAP[t]) {
    console.error(`--type must be one of: ${Object.keys(TYPE_MAP).join(", ")}`);
    process.exit(1);
  }
  return t;
}

function getLimit(): number {
  const raw = getArg("--limit");
  if (raw !== undefined) {
    const n = parseInt(raw, 10);
    if (!isNaN(n)) return n; // 0 = all
  }
  return DEFAULT_LIMIT;
}

// ── Helpers ───────────────────────────────────────────────────────────────

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

// ── Main ──────────────────────────────────────────────────────────────────

async function main() {
  const type = getType();
  const limit = getLimit();

  const urlsFile = path.join(DATA_DIR, TYPE_MAP[type]);
  const outFile = path.join(DATA_DIR, `${type}.json`);

  const allUrls = await readLines(urlsFile);
  const urls = limit > 0 ? allUrls.slice(0, limit) : allUrls;

  console.log(`\nExtracting ${urls.length} [${type}] pages${limit > 0 ? ` (limit=${limit} of ${allUrls.length})` : " (ALL)"} …\n`);

  const pages: ExtractedPage[] = [];
  let succeeded = 0;
  const failures: string[] = [];

  for (let i = 0; i < urls.length; i += CONCURRENCY) {
    const batch = urls.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(
      batch.map(async (url, j) => {
        const idx = i + j;
        try {
          const page = await extractPage(url);
          console.log(`  [${idx + 1}/${urls.length}] ✓  ${url}  →  ${page.slug}`);
          succeeded++;
          return page;
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`  [${idx + 1}/${urls.length}] ✗  ${url}  —  ${msg}`);
          failures.push(`${url}: ${msg}`);
          return null;
        }
      })
    );
    pages.push(...(batchResults.filter(Boolean) as ExtractedPage[]));
    if (i + CONCURRENCY < urls.length) await sleep(DELAY_MS);
  }

  fs.writeFileSync(outFile, JSON.stringify(pages, null, 2), "utf8");

  console.log(`\n── Summary ──────────────────────────────────────────────`);
  console.log(`  Type      : ${type}`);
  console.log(`  Succeeded : ${succeeded} / ${urls.length}`);
  console.log(`  Failed    : ${failures.length}`);
  failures.forEach((f) => console.error(`    ✗  ${f}`));
  console.log(`  Output    : ${outFile}`);
  console.log(`────────────────────────────────────────────────────────\n`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
