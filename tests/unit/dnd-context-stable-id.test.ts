/**
 * dnd-kit derives its `aria-describedby` ids from a module-level counter. Server
 * and client increment that counter independently, so without an explicit `id`
 * on DndContext the two disagree and React logs a hydration mismatch — one per
 * sortable item, on every load of the affected screen (QAD-033 reported it per
 * block in the Layers panel).
 *
 * Passing a stable `id` makes dnd-kit use it instead of the counter, which is
 * the documented fix. Two call sites already did this (WidgetBoard,
 * SlideList); the other ten did not, which is why the warning kept resurfacing
 * as separate bug reports from different screens.
 *
 * This guard is deliberately a source scan rather than a render test: the
 * defect is "somebody added a DndContext and forgot", and that is visible in
 * the source but invisible in any single component's test.
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/** Pure-Node fallback for machines without a `grep` binary (e.g. Windows
 *  dev boxes without Git Bash on PATH). Produces the same
 *  `{ file, line, text }` shape as the grep fast path, with forward-slash
 *  relative paths so assertions stay platform-stable. */
function dndContextSitesFallback(): { file: string; line: number; text: string }[] {
  const out: { file: string; line: number; text: string }[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) { walk(full); continue; }
      if (!entry.endsWith('.tsx')) continue;
      const lines = readFileSync(full, 'utf8').split('\n');
      lines.forEach((text, i) => {
        if (text.includes('<DndContext')) {
          out.push({ file: relative(process.cwd(), full).split(sep).join('/'), line: i + 1, text });
        }
      });
    }
  };
  walk(join(process.cwd(), 'components'));
  walk(join(process.cwd(), 'app'));
  return out;
}

/** Every `<DndContext` occurrence in app/ and components/, with its file. */
function dndContextSites(): { file: string; line: number; text: string }[] {
  try {
    const out = execFileSync(
      'grep',
      ['-rn', '--include=*.tsx', '<DndContext', 'components', 'app'],
      { cwd: process.cwd(), encoding: 'utf8' },
    );
    return out
      .split('\n')
      .filter(Boolean)
      .map((l) => {
        const [file, line, ...rest] = l.split(':');
        return { file, line: Number(line), text: rest.join(':') };
      });
  } catch (err) {
    // ENOENT = no grep binary on this machine (Windows without Git Bash on
    // PATH). Fall back to the pure-Node scan so the guard still runs instead
    // of failing the whole suite on environment grounds.
    if (err instanceof Error && 'code' in err && (err as { code?: string }).code === 'ENOENT') {
      return dndContextSitesFallback();
    }
    throw err;
  }
}

describe('every DndContext carries a stable id (QAD-033)', () => {
  const sites = dndContextSites();

  it('finds the DndContext call sites it is meant to guard', () => {
    // Fail loudly rather than pass vacuously if the scan stops matching.
    expect(sites.length).toBeGreaterThanOrEqual(10);
  });

  it.each(sites.map((s) => [`${s.file}:${s.line}`, s] as const))(
    '%s passes an explicit id',
    (_label, site) => {
      expect(
        /<DndContext\s+id=/.test(site.text),
        `${site.file}:${site.line} renders <DndContext> without an \`id\` prop. ` +
          `dnd-kit will fall back to a module-level counter whose value differs ` +
          `between server and client, producing a React hydration mismatch for ` +
          `every sortable child. Add a stable id, e.g. <DndContext id="my-board">.`,
      ).toBe(true);
    },
  );
});
