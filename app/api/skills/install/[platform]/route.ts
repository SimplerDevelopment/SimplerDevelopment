/**
 * GET /api/skills/install/mac     → serves the macOS .command installer
 * GET /api/skills/install/windows → serves the Windows .bat installer
 *
 * Source files live in scripts/installers/. The route reads them at request
 * time and serves with download headers + a long CDN cache (these change
 * infrequently — when they do, deploy invalidates the cache).
 *
 * Public route, no auth. Installer scripts are open-source by design — they
 * just download the bundle from /api/skills/bundle.
 */

import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const revalidate = 3600; // 1 hr

const INSTALLER_DIR = resolve(process.cwd(), 'scripts/installers');

const INSTALLERS = {
  mac: {
    file: 'install-sd-skills.command',
    contentType: 'application/octet-stream',
    downloadName: 'install-sd-skills.command',
  },
  windows: {
    file: 'install-sd-skills.bat',
    contentType: 'application/octet-stream',
    downloadName: 'install-sd-skills.bat',
  },
} as const;

type Platform = keyof typeof INSTALLERS;

function isPlatform(s: string): s is Platform {
  return s === 'mac' || s === 'windows';
}

export async function GET(_req: Request, ctx: { params: Promise<{ platform: string }> }) {
  const { platform } = await ctx.params;
  if (!isPlatform(platform)) {
    return NextResponse.json(
      { error: `Unknown platform: ${platform}. Known: mac, windows.` },
      { status: 404 },
    );
  }

  const info = INSTALLERS[platform];
  const filePath = resolve(INSTALLER_DIR, info.file);
  if (!existsSync(filePath)) {
    return NextResponse.json({ error: 'Installer file not found on server' }, { status: 500 });
  }

  const buf = readFileSync(filePath);
  const stat = statSync(filePath);

  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      'Content-Type': info.contentType,
      'Content-Disposition': `attachment; filename="${info.downloadName}"`,
      'Content-Length': String(buf.length),
      'Last-Modified': stat.mtime.toUTCString(),
      'Cache-Control': 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}
