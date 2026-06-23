/**
 * Regression test for the CRM search tool drift.
 *
 * Both `crm_companies_search` and `crm_contacts_search` previously errored on
 * every query because Drizzle's `db.select().from(table)` expanded to every
 * column declared in the TS schema, while the live DB had fewer columns
 * (pg 42703 "column X does not exist"). The handlers now use raw `SELECT *`
 * and surface real pg errors via a dbErrorEnvelope helper.
 *
 * This spec hits each handler with a one-character query, a multi-word query,
 * and an empty query and asserts the response is a JSON array (possibly empty)
 * with no isError flag — the exact shape the failure mode would violate.
 */
import { test, expect } from './setup/fixtures';
import { runCleanups, createTestApiKey, McpTestClient } from './setup/helpers';

test.describe('CRM search handlers survive Drizzle/DB column drift @mcp @crm', () => {
  let cleanups: Array<() => Promise<void>> = [];

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  for (const tool of ['crm_companies_search', 'crm_contacts_search'] as const) {
    test(`${tool} returns an array for single-char, multi-word, and empty queries`, async ({ clientApi }) => {
      const { keyRecord, cleanup } = await createTestApiKey(clientApi, { scopes: ['crm:read'] });
      cleanups.push(cleanup);

      const mcp = await new McpTestClient(keyRecord.key).init();
      cleanups.push(() => mcp.dispose());

      for (const query of ['a', 'slate captain', '']) {
        const args: Record<string, unknown> = { limit: 5 };
        if (query) args.query = query;
        const res = await mcp.callTool(tool, args);

        // If the handler still threw, the helper returns isError + a JSON
        // body with pgMessage/drizzleMessage. Fail with that so the test
        // output includes the root cause.
        if (res.isError) {
          throw new Error(
            `${tool}({ query: "${query}" }) returned isError — payload: ${res.text ?? '(empty)'}`
          );
        }

        expect(res.status).toBe(200);
        expect(Array.isArray(res.data)).toBe(true);
      }
    });
  }
});
