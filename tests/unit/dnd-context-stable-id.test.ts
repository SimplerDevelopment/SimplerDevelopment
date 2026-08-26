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

/** Every `<DndContext` occurrence in app/ and components/, with its file. */
function dndContextSites(): { file: string; line: number; text: string }[] {
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
