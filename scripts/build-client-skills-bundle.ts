#!/usr/bin/env bun
/**
 * Build the client-safe skills bundle for distribution.
 *
 * Reads `.claude/skills/CLIENT_SAFE_MANIFEST.md` to determine which skill
 * directories + companion docs are client-grade, tars them up, and writes:
 *   - dist/sd-skills-bundle.tgz   — the tarball Claude Desktop / Code users
 *                                    extract into ~/.claude/skills/
 *   - dist/sd-skills-bundle.tgz.sha256 — checksum, served alongside so the
 *                                        installer scripts can verify integrity
 *
 * Run via:
 *   bun run scripts/build-client-skills-bundle.ts
 *   bun run skills:bundle
 *
 * The output tarball is meant to extract DIRECTLY into ~/.claude/skills/ —
 * so the top-level entries are <skill-name>/SKILL.md and bare companion files
 * (no wrapping directory). The companion files (SD_DESIGN_PRINCIPLES.md,
 * CLIENT_QUICKSTART.md) land alongside the skill dirs so each SKILL.md's
 * `SD_DESIGN_PRINCIPLES.md` reference resolves correctly relative to either.
 */

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync, cpSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';

const REPO_ROOT = process.cwd();
const SKILLS_DIR = resolve(REPO_ROOT, '.claude/skills');
const DIST_DIR = resolve(REPO_ROOT, 'dist');
const BUNDLE_NAME = 'sd-skills-bundle.tgz';
const STAGE_DIR = resolve(DIST_DIR, '_stage-skills');

// The canonical list of what ships to clients. Mirrors the
// "Client-grade — safe to bundle for portal clients" table in
// .claude/skills/CLIENT_SAFE_MANIFEST.md. Changes here MUST update the
// manifest in the same commit.
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

const COMPANION_FILES = [
  'SD_DESIGN_PRINCIPLES.md', // referenced by every sd-create-* skill
  'CLIENT_QUICKSTART.md',    // the client onboarding doc
];

const INTERNAL_FILES_BLOCKLIST = [
  // Belt-and-suspenders: if anyone accidentally adds these to a client-safe
  // skill's directory, refuse to bundle. CLIENT_SAFE_MANIFEST.md is the source
  // of truth; this is a tripwire.
  'SD_SKILLS_RUNBOOK.md',
  'MORNING_BRIEF.md',
  'CLIENT_SAFE_MANIFEST.md',
  'CHANGELOG.md',
  '.sd/', // never ship a project-local config snapshot
];

function log(msg: string) {
  process.stderr.write(`[build-bundle] ${msg}\n`);
}

function fail(msg: string): never {
  process.stderr.write(`[build-bundle] FATAL: ${msg}\n`);
  process.exit(1);
}

function assertManifestMatches(): void {
  const manifestPath = resolve(SKILLS_DIR, 'CLIENT_SAFE_MANIFEST.md');
  if (!existsSync(manifestPath)) fail(`CLIENT_SAFE_MANIFEST.md not found at ${manifestPath}`);
  const text = readFileSync(manifestPath, 'utf-8');
  const declared = new Set<string>();
  // Match table rows like `| \`sd-init\` | ...`
  for (const m of text.matchAll(/^\|\s*`(sd-[a-z0-9-]+|html-render-block)`/gim)) {
    declared.add(m[1]);
  }
  const inCode = new Set(CLIENT_SAFE_SKILLS);
  const onlyInManifest = [...declared].filter((s) => !inCode.has(s));
  const onlyInCode = [...inCode].filter((s) => !declared.has(s));
  if (onlyInManifest.length > 0 || onlyInCode.length > 0) {
    fail(
      `CLIENT_SAFE_MANIFEST.md is out of sync with this script:\n` +
        (onlyInManifest.length ? `  In manifest only: ${onlyInManifest.join(', ')}\n` : '') +
        (onlyInCode.length ? `  In code only:     ${onlyInCode.join(', ')}\n` : '') +
        `Reconcile before building.`,
    );
  }
}

function stage(): void {
  if (existsSync(STAGE_DIR)) rmSync(STAGE_DIR, { recursive: true, force: true });
  mkdirSync(STAGE_DIR, { recursive: true });

  for (const skill of CLIENT_SAFE_SKILLS) {
    const src = resolve(SKILLS_DIR, skill);
    if (!existsSync(src)) fail(`Skill directory missing: ${src}`);
    const stat = statSync(src);
    if (!stat.isDirectory()) fail(`Expected directory, got file: ${src}`);
    // Tripwire: scan for internal files inside a client-safe skill dir
    const dirEntries = require('node:fs').readdirSync(src);
    for (const entry of dirEntries) {
      if (INTERNAL_FILES_BLOCKLIST.some((b) => entry === b.replace(/\/$/, ''))) {
        fail(`Internal file "${entry}" leaked into client-safe skill ${skill}. Remove before bundling.`);
      }
    }
    cpSync(src, resolve(STAGE_DIR, skill), { recursive: true });
    log(`+ ${skill}/`);
  }

  for (const file of COMPANION_FILES) {
    const src = resolve(SKILLS_DIR, file);
    if (!existsSync(src)) fail(`Companion file missing: ${src}`);
    cpSync(src, resolve(STAGE_DIR, file));
    log(`+ ${file}`);
  }

  // Drop a manifest into the bundle so installed clients can verify what they got.
  const bundleManifest = {
    version: 1,
    builtAt: new Date().toISOString(),
    builtFrom: 'simplerdevelopment2026',
    skills: CLIENT_SAFE_SKILLS,
    companions: COMPANION_FILES,
    install: {
      mac: 'Download install-sd-skills.command from /api/skills/install/mac',
      windows: 'Download install-sd-skills.bat from /api/skills/install/windows',
      manual: 'Extract this tarball into ~/.claude/skills/ (macOS/Linux) or %USERPROFILE%\\.claude\\skills\\ (Windows)',
    },
  };
  writeFileSync(resolve(STAGE_DIR, 'BUNDLE_MANIFEST.json'), JSON.stringify(bundleManifest, null, 2));
  log(`+ BUNDLE_MANIFEST.json`);
}

function tarball(): { tgzPath: string; sha256: string; sizeBytes: number } {
  mkdirSync(DIST_DIR, { recursive: true });
  const tgzPath = resolve(DIST_DIR, BUNDLE_NAME);
  if (existsSync(tgzPath)) rmSync(tgzPath);

  // -C cd into stage dir, tar all top-level entries (skill dirs + companion files)
  const result = spawnSync(
    'tar',
    ['-czf', tgzPath, '-C', STAGE_DIR, '.'],
    { stdio: 'inherit' },
  );
  if (result.status !== 0) fail(`tar exited with status ${result.status}`);

  const buf = readFileSync(tgzPath);
  const sha256 = createHash('sha256').update(buf).digest('hex');
  writeFileSync(`${tgzPath}.sha256`, `${sha256}  ${BUNDLE_NAME}\n`);

  return { tgzPath, sha256, sizeBytes: buf.length };
}

function main() {
  log('Validating CLIENT_SAFE_MANIFEST.md is in sync...');
  assertManifestMatches();

  log(`Staging ${CLIENT_SAFE_SKILLS.length} skills + ${COMPANION_FILES.length} companion files...`);
  stage();

  log('Creating tarball...');
  const { tgzPath, sha256, sizeBytes } = tarball();

  log('');
  log(`✓ Bundle written: ${tgzPath}`);
  log(`  Size: ${(sizeBytes / 1024).toFixed(1)} KB`);
  log(`  SHA-256: ${sha256}`);
  log('');
  log('Next: commit the bundle OR serve it from /api/skills/bundle.');
}

main();
