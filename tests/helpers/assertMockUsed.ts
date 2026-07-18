import { expect } from 'vitest';
import type { Mock } from 'vitest';

/**
 * Fail loudly if a mock the test relies on was never invoked.
 *
 * A route test that mocks `@/lib/auth` keeps passing after the route is
 * refactored to `@/lib/portal-auth` — the stale mock just gets 0 invocations
 * and the route runs unmocked/unguarded, green for the wrong reasons. Assert
 * the guard mock was actually called so an import swap surfaces as a failure.
 *
 * Promoted from the guardrail-distillation report (2026-06-24, candidate #6).
 *
 * @example
 *   await POST(req);
 *   assertMockUsed(authorizePortalMock, 'authorizePortal');
 */
export function assertMockUsed(mock: Mock, name: string): void {
  expect(
    mock,
    `${name} mock was never called — a refactor may have swapped the import it stands in for, leaving this test guarding nothing`,
  ).toHaveBeenCalled();
}
