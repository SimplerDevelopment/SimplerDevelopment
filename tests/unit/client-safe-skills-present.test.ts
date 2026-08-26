/**
 * `/api/skills/bundle` is a PUBLIC, unauthenticated route that rebuilds a
 * tarball from `.claude/skills/` on every request. `fingerprintSources()`
 * throws on the FIRST missing entry, before any tar work — so one absent skill
 * directory takes the whole endpoint to a 500.
 *
 * That is exactly what happened: commit c699b4289 carried the platform source
 * but not `.claude/skills/*`, and the endpoint returned 500 on every request
 * for weeks. `/install` hands clients a `curl -fsSL … | tar -xz` command, and
 * `curl -f` exits silently on a 500, so the failure was invisible from both
 * ends. Nothing tested it. PUX-112.
 *
 * This is that test. It is a filesystem check rather than an HTTP one because
 * the failure mode is "the files aren't in the repo" — which no amount of
 * route-level mocking would catch.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const SKILLS_DIR = resolve(process.cwd(), '.claude/skills');

/** Mirrors CLIENT_SAFE_SKILLS in app/api/skills/bundle/route.ts. */
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

/** Mirrors COMPANION_FILES in the same route. */
const COMPANION_FILES = ['SD_DESIGN_PRINCIPLES.md', 'CLIENT_QUICKSTART.md'];

describe('/api/skills/bundle has everything it needs to build', () => {
  it.each(CLIENT_SAFE_SKILLS)('%s exists with a SKILL.md', (skill) => {
    const dir = join(SKILLS_DIR, skill);
    expect(existsSync(dir), `.claude/skills/${skill}/ is missing — the public /api/skills/bundle route throws on the first absent skill, so this 500s the whole endpoint`).toBe(true);
    expect(existsSync(join(dir, 'SKILL.md')), `${skill}/SKILL.md is missing`).toBe(true);
  });

  it.each(COMPANION_FILES)('%s exists', (file) => {
    expect(
      existsSync(join(SKILLS_DIR, file)),
      `.claude/skills/${file} is missing — the route copies companions unconditionally and throws if one is absent`,
    ).toBe(true);
  });

  // The build script reads this and refuses to bundle if it disagrees with the
  // route's hard-coded array. Keeping it present is what makes that check able
  // to run at all.
  it('CLIENT_SAFE_MANIFEST.md exists and names every allowlisted skill', () => {
    const manifest = join(SKILLS_DIR, 'CLIENT_SAFE_MANIFEST.md');
    expect(existsSync(manifest), 'CLIENT_SAFE_MANIFEST.md is missing — scripts/build-client-skills-bundle.ts hard-fails without it').toBe(true);
    const src = readFileSync(manifest, 'utf8');
    for (const skill of CLIENT_SAFE_SKILLS) {
      expect(src, `manifest does not mention ${skill}`).toContain(skill);
    }
  });

  // If the route's list grows and this one doesn't, the new skill ships
  // untested and can 500 production the same way.
  it('this test mirrors the route: same skills, same companions', () => {
    const routeSrc = readFileSync(
      resolve(process.cwd(), 'app/api/skills/bundle/route.ts'),
      'utf8',
    );
    for (const skill of CLIENT_SAFE_SKILLS) {
      expect(routeSrc, `route no longer lists ${skill}`).toContain(`'${skill}'`);
    }
    for (const file of COMPANION_FILES) {
      expect(routeSrc, `route no longer lists ${file}`).toContain(`'${file}'`);
    }
    // Count entries inside the CLIENT_SAFE_SKILLS array literal only. A
    // file-wide regex also matches things like the mkdtemp prefix
    // 'sd-skills-stage-', which is how the first version of this assertion
    // reported 11 skills where there are 10.
    const arrStart = routeSrc.indexOf('const CLIENT_SAFE_SKILLS = [');
    expect(arrStart, 'CLIENT_SAFE_SKILLS array not found in the route').toBeGreaterThan(-1);
    const arr = routeSrc.slice(arrStart, routeSrc.indexOf('];', arrStart));
    const routeCount = (arr.match(/'[^']+'/g) ?? []).length;
    expect(
      routeCount,
      `the route's CLIENT_SAFE_SKILLS has ${routeCount} entries but this test checks ` +
        `${CLIENT_SAFE_SKILLS.length} — add the new one here too, or it ships untested ` +
        `and can 500 the public endpoint`,
    ).toBe(CLIENT_SAFE_SKILLS.length);
  });
});
