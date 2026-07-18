/**
 * Playwright client-side V8 coverage fixture.
 *
 * Specified by `tests/TESTING_PLAN.md` §5 ("Playwright E2E (server + client)").
 * Auto-wraps every test that imports from this file with
 * `page.coverage.startJSCoverage()` / `stopJSCoverage()` and writes one JSON
 * blob per test under `coverage/.v8-client/`. Those blobs are later converted
 * to c8's expected V8 ProfileCoverage shape by
 * `scripts/convert-client-coverage.ts` and merged with the server + Vitest
 * coverage into a single combined report.
 *
 * Behavior is gated by `COLLECT_CLIENT_COVERAGE=1` so day-to-day test runs
 * without coverage are unaffected (no perf hit, no extra disk writes).
 *
 * This fixture extends the existing `./fixtures` module so specs only have
 * to swap their import — they keep `clientApi` / `adminApi` / `unauthApi`.
 *
 * TODO(test-infra): migrate the remaining ~80 E2E specs to import
 *   `{ test, expect }` from this file instead of `./fixtures` (or
 *   `@playwright/test`). Current sample migrations:
 *     - tests/e2e/portal-cms-taxonomies.spec.ts
 *     - tests/e2e/portal-automations.spec.ts
 *     - tests/e2e/admin-dashboard.spec.ts
 *   Migration is a mechanical search-and-replace; deferred to a follow-up
 *   so the fixture itself can be validated against a small sample first.
 */
import * as fs from 'fs';
import * as path from 'path';
import { test as base, expect } from './fixtures';

const COVERAGE_DIR = path.join('coverage', '.v8-client');

export const test = base.extend({
  page: async ({ page }, use, testInfo) => {
    const enabled = process.env.COLLECT_CLIENT_COVERAGE === '1';
    if (enabled) {
      await page.coverage.startJSCoverage({ resetOnNavigation: false });
    }
    // Playwright fixture API — `use` here is the test runner's continuation,
    // not React's `use` hook. The lint rule misfires on the lowercase name.
    // eslint-disable-next-line react-hooks/rules-of-hooks
    await use(page);
    if (enabled) {
      const entries = await page.coverage.stopJSCoverage();
      fs.mkdirSync(COVERAGE_DIR, { recursive: true });
      const safe = testInfo.title.replace(/[^\w.-]+/g, '_').slice(0, 80);
      const file = path.join(
        COVERAGE_DIR,
        `${process.pid}-${Date.now()}-${safe}.json`,
      );
      fs.writeFileSync(file, JSON.stringify({ result: entries }));
    }
  },
});

export { expect };
