/**
 * GET /api/skills/bundle           — serves the client-safe skills tarball.
 * GET /api/skills/bundle.sha256    — served via .sha256 path-segment; use
 *                                    /api/skills/bundle?sum=1 in this route
 *                                    handler since Next can't easily map
 *                                    `.sha256` directly. Installer scripts use
 *                                    the explicit `?sum=1` query param.
 *
 * The bundle is rebuilt on demand from .claude/skills/ each request. That's
 * cheap (a few KB of markdown, ~50ms tar) and means a deploy is the only thing
 * needed to ship a new bundle — no separate build artifact to publish.
 *
 * Public route; no auth. The contents are non-secret (SKILL.md prompts +
 * CLIENT_QUICKSTART.md + SD_DESIGN_PRINCIPLES.md). Internal-only files
 * (RUNBOOK, MORNING_BRIEF, CLIENT_SAFE_MANIFEST itself) are explicitly NOT
 * included — see scripts/build-client-skills-bundle.ts for the source list.
 */

import { createHash } from 'node:crypto';
import { readFileSync, existsSync, statSync, mkdtempSync, readdirSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { NextResponse } from 'next/server';
import { create as tarCreate } from 'tar';

export const runtime = 'nodejs';
// Allow Next's response caching but key on the file-mtime hash so a deploy
// invalidates the cache. We use s-maxage and stale-while-revalidate so the CDN
// serves the previous bundle while the new one is being built.
export const revalidate = 300; // 5 min CDN cache

const REPO_ROOT = process.cwd();
const SKILLS_DIR = resolve(REPO_ROOT, '.claude/skills');

const CLIENT_SAFE_SKILLS = [
  'sd-init',
  'sd-create-page',
  'sd-create-deck',
  'sd-create-email',
  'sd-create-survey',
  'sd-create-booking-page',
  'sd-create-website',
  'sd-build-html-embed',
  'sd-learn',
  'html-render-block',
];

const COMPANION_FILES = ['SD_DESIGN_PRINCIPLES.md', 'CLIENT_QUICKSTART.md'];

// In-memory cache. Key on a hash of the source mtimes; invalidates on any edit.
let cachedBundle: { sourceFingerprint: string; tgz: Buffer; sha256: string } | null = null;

function fingerprintSources(): string {
  const parts: string[] = [];
  for (const skill of CLIENT_SAFE_SKILLS) {
    const dir = resolve(SKILLS_DIR, skill);
    if (!existsSync(dir)) throw new Error(`Skill directory missing: ${skill}`);
    for (const entry of readdirSync(dir)) {
      const file = resolve(dir, entry);
      parts.push(`${skill}/${entry}=${statSync(file).mtimeMs}`);
    }
  }
  for (const file of COMPANION_FILES) {
    const path = resolve(SKILLS_DIR, file);
    if (!existsSync(path)) throw new Error(`Companion missing: ${file}`);
    parts.push(`${file}=${statSync(path).mtimeMs}`);
  }
  return createHash('sha256').update(parts.join('\n')).digest('hex').slice(0, 16);
}

async function buildBundle(): Promise<{ tgz: Buffer; sha256: string }> {
  const stage = mkdtempSync(join(tmpdir(), 'sd-skills-stage-'));
  try {
    for (const skill of CLIENT_SAFE_SKILLS) {
      cpSync(resolve(SKILLS_DIR, skill), resolve(stage, skill), { recursive: true });
    }
    for (const file of COMPANION_FILES) {
      cpSync(resolve(SKILLS_DIR, file), resolve(stage, file));
    }

    const tgzPath = join(stage, 'bundle.tgz');
    // tar everything in stage except the tgz we're about to create.
    // Using node-tar (pure JS) instead of spawnSync('tar'): Vercel's
    // serverless runtime doesn't ship a `tar` binary on PATH, so the
    // spawn approach returns `status null` and the bundle route 500s.
    const ls = readdirSync(stage).filter((e) => e !== 'bundle.tgz');
    await tarCreate({ gzip: true, file: tgzPath, cwd: stage }, ls);
    const tgz = readFileSync(tgzPath);
    const sha256 = createHash('sha256').update(tgz).digest('hex');
    return { tgz, sha256 };
  } finally {
    try {
      rmSync(stage, { recursive: true, force: true });
    } catch {
      /* best-effort cleanup */
    }
  }
}

async function getBundle(): Promise<{ tgz: Buffer; sha256: string }> {
  const fp = fingerprintSources();
  if (cachedBundle?.sourceFingerprint === fp) {
    return { tgz: cachedBundle.tgz, sha256: cachedBundle.sha256 };
  }
  const built = await buildBundle();
  cachedBundle = { sourceFingerprint: fp, ...built };
  return built;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const wantsChecksum = url.searchParams.has('sum') || url.pathname.endsWith('.sha256');

  let tgz: Buffer;
  let sha256: string;
  try {
    ({ tgz, sha256 } = await getBundle());
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to build bundle: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 },
    );
  }

  if (wantsChecksum) {
    return new NextResponse(`${sha256}  sd-skills-bundle.tgz\n`, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=86400',
        'X-Bundle-SHA-256': sha256,
      },
    });
  }

  // Conditional GET — installers can pass If-None-Match for cache validation.
  const etag = `"${sha256}"`;
  if (req.headers.get('if-none-match') === etag) {
    return new NextResponse(null, { status: 304, headers: { ETag: etag } });
  }

  return new NextResponse(new Uint8Array(tgz), {
    status: 200,
    headers: {
      'Content-Type': 'application/gzip',
      'Content-Disposition': 'attachment; filename="sd-skills-bundle.tgz"',
      'Content-Length': String(tgz.length),
      'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=86400',
      ETag: etag,
      'X-Bundle-SHA-256': sha256,
    },
  });
}
