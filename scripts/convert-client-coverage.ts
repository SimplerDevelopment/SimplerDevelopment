/**
 * Translates Playwright's `page.coverage.stopJSCoverage()` output
 * (an array of `{ url, scriptId, source, functions: [{ functionName, ranges, isBlockCoverage }] }`)
 * into the V8 `ProfileCoverage` format c8 understands, so client-side JS
 * coverage can be merged with server-side coverage in the combined report.
 *
 * Input:  coverage/.v8-client/<pid>-<ts>-<title>.json  (array of entries)
 * Output: coverage/.v8-merged/coverage-<n>.json        (ProfileCoverage)
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const CLIENT_DIR = 'coverage/.v8-client';
const SERVER_DIR = 'coverage/.v8-server';
const MERGED_DIR = 'coverage/.v8-merged';

interface PwCoverageEntry {
  url: string;
  scriptId?: string;
  source?: string;
  functions: Array<{
    functionName: string;
    ranges: Array<{ startOffset: number; endOffset: number; count: number }>;
    isBlockCoverage: boolean;
  }>;
}

interface V8ProfileCoverage {
  result: Array<{
    scriptId: string;
    url: string;
    functions: PwCoverageEntry['functions'];
  }>;
  timestamp: number;
  'source-map-cache'?: Record<string, { lineLengths: number[]; data?: unknown }>;
}

function translate(entries: PwCoverageEntry[]): V8ProfileCoverage {
  const result = entries
    .filter(e => {
      try {
        const url = new URL(e.url);
        // Drop external CDN / extension URLs and Next's HMR/static chunks from node_modules we don't care about
        if (!/^https?:$/.test(url.protocol)) return false;
        if (url.pathname.startsWith('/__nextjs')) return false;
        return true;
      } catch {
        return false;
      }
    })
    .map((e, i) => ({
      scriptId: e.scriptId ?? String(i + 1),
      url: e.url,
      functions: e.functions,
    }));

  return { result, timestamp: Date.now() };
}

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

function main() {
  ensureDir(MERGED_DIR);

  // 1) Copy server-side coverage files through as-is (they're already V8 format)
  if (fs.existsSync(SERVER_DIR)) {
    for (const file of fs.readdirSync(SERVER_DIR)) {
      if (file.endsWith('.json')) {
        fs.copyFileSync(path.join(SERVER_DIR, file), path.join(MERGED_DIR, `server-${file}`));
      }
    }
  }

  // 2) Translate client-side coverage files
  if (!fs.existsSync(CLIENT_DIR)) {
    console.log('no client coverage dir; server-only merge');
    return;
  }

  const files = fs.readdirSync(CLIENT_DIR).filter(f => f.endsWith('.json'));
  let written = 0;
  for (const file of files) {
    const full = path.join(CLIENT_DIR, file);
    try {
      const raw = JSON.parse(fs.readFileSync(full, 'utf8')) as { result: PwCoverageEntry[] };
      if (!Array.isArray(raw.result) || raw.result.length === 0) continue;
      const translated = translate(raw.result);
      if (translated.result.length === 0) continue;
      fs.writeFileSync(
        path.join(MERGED_DIR, `client-${written}-${file}`),
        JSON.stringify(translated),
      );
      written++;
    } catch (err) {
      console.warn(`skipping ${file}: ${(err as Error).message}`);
    }
  }
  console.log(`merged ${written} client coverage file(s) into ${MERGED_DIR}`);
}

main();
