/**
 * Every mutating query in the email tools must carry its tenant filter in the
 * WHERE clause, not rely solely on a preceding existence check.
 *
 * JUL9-011 flagged the email unlink path as possibly leaking across tenants.
 * It did not — every handler ran a tenant-scoped SELECT first — but nine of the
 * ten mutations then filtered on `id` alone, while a tenth
 * (`email_campaigns_schedule`'s apply closure) already used the double-scoped
 * form. That inconsistency inside one file is drift, not design.
 *
 * It matters most in the `stageOrApply` closures: the existence check runs when
 * the change is STAGED and the mutation runs when it is APPROVED, which can be
 * much later. An unscoped WHERE in that window is a genuine TOCTOU gap, not a
 * hypothetical one.
 *
 * `email_subscribers` has no clientId of its own — tenancy is only reachable
 * via listId -> email_lists.clientId — so those mutations re-assert the listId
 * the tenant-scoped join returned.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = readFileSync(join(process.cwd(), 'lib/mcp/tools/email.ts'), 'utf8');

/** Each `db.update(x)` / `db.delete(x)` paired with the WHERE that follows it. */
function mutations(): { table: string; op: string; where: string; line: number }[] {
  const out: { table: string; op: string; where: string; line: number }[] = [];
  const re = /db\s*\.\s*(update|delete)\(\s*(email\w+)\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(SRC))) {
    const rest = SRC.slice(m.index, m.index + 400);
    const w = rest.indexOf('.where(');
    if (w === -1) continue;
    out.push({
      op: m[1],
      table: m[2],
      where: rest.slice(w, w + 200),
      line: SRC.slice(0, m.index).split('\n').length,
    });
  }
  return out;
}

describe('email tool mutations are tenant-scoped in the WHERE clause', () => {
  const found = mutations();

  it('finds the mutations it is meant to be guarding', () => {
    // If a refactor moves these, the suite must fail loudly rather than pass
    // vacuously over an empty list.
    expect(found.length).toBeGreaterThanOrEqual(8);
  });

  it.each(found.map((f) => [`${f.op} ${f.table} (line ${f.line})`, f] as const))(
    '%s scopes by tenant, not by id alone',
    (_label, f) => {
      expect(
        f.where.includes('and('),
        `${f.op} on ${f.table} at line ${f.line} filters on id alone. Add the tenant ` +
          `predicate: eq(${f.table}.clientId, clientId), or for email_subscribers ` +
          `(which has no clientId) eq(emailSubscribers.listId, <the pre-checked listId>).`,
      ).toBe(true);

      const tenantPredicate =
        f.table === 'emailSubscribers'
          ? /emailSubscribers\.listId/
          : new RegExp(`${f.table}\\.clientId`);
      expect(
        tenantPredicate.test(f.where),
        `${f.op} on ${f.table} at line ${f.line} uses and() but without a tenant ` +
          `predicate — and() alone is not scoping.`,
      ).toBe(true);
    },
  );
});
