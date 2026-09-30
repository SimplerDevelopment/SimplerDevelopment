/**
 * scripts/check-portal-role-gates — the AUTH79-020 ratchet's decision logic.
 *
 * What must hold: a new ungated route fails; the baseline only shrinks, which takes two checks: an
 * entry that has since been gated/exempted/deleted fails, and an entry that origin/main's baseline
 * does not already carry fails (otherwise a new route could fail and then be absorbed by
 * regenerating the baseline in the same PR); a gated mutating handler that never names an action
 * above 'read' fails unless its export line carries the read-ok marker; and a gate that is only
 * MENTIONED in a comment is not a gate.
 */
import { describe, it, expect } from 'vitest';
import { evaluateRoleGates, namesActionAboveRead, EXEMPT } from '@/scripts/check-portal-role-gates';

const P = 'app/api/portal/widgets/route.ts';
const ungatedSrc = `export async function GET() { return null }`;
const gatedWriteSrc = `
import { gatePortalRole } from '@/lib/portal-auth';
export async function POST() {
  const denied = await gatePortalRole(parseInt(session.user.id, 10), client, 'write');
}`;
const gatedReadMutatingSrc = `
export async function POST() {
  const r = await authorizePortal({ action: 'read', requireService: 'email' });
}`;

const run = (routes: { path: string; source: string }[], baseline: string[] = [], exempt: Record<string, string> = {}) =>
  evaluateRoleGates({ routes, baseline, exempt });

describe('evaluateRoleGates', () => {
  it('(a) fails a new ungated route that is not in the baseline', () => {
    const { violations } = run([{ path: P, source: ungatedSrc }]);
    expect(violations).toHaveLength(1);
    expect(violations[0].kind).toBe('new-ungated');
    expect(violations[0].message).toContain('new portal route ships without a role gate');
    expect(violations[0].message).toContain('gatePortalRole/authorizePortal');
  });

  it('passes an ungated route that is pinned in the baseline, and reports it', () => {
    const { violations, ungated } = run([{ path: P, source: ungatedSrc }], [P]);
    expect(violations).toEqual([]);
    expect(ungated).toEqual([P]);
  });

  it('passes a gated route and an exempt route without a baseline entry', () => {
    const exemptPath = 'app/api/portal/me/route.ts';
    const { violations } = run(
      [
        { path: P, source: gatedWriteSrc },
        { path: exemptPath, source: ungatedSrc },
      ],
      [],
      { [exemptPath]: 'caller-own data' },
    );
    expect(violations).toEqual([]);
  });

  it('(b) fails a baseline entry that is now gated, exempt, or deleted — the list only shrinks', () => {
    const gated = run([{ path: P, source: gatedWriteSrc }], [P]);
    expect(gated.violations.map((v) => v.kind)).toEqual(['stale-baseline']);
    expect(gated.violations[0].message).toContain('is now gated');
    expect(gated.violations[0].message).toContain('the list only shrinks');

    const exempt = run([{ path: P, source: ungatedSrc }], [P], { [P]: 'reason' });
    expect(exempt.violations[0].message).toContain('is now exempt');

    const deleted = run([], [P]);
    expect(deleted.violations[0].message).toContain('is deleted');
  });

  it('(d) fails a baseline entry that origin/main does not already carry — the baseline cannot grow', () => {
    const routes = [{ path: P, source: ungatedSrc }];
    const grew = evaluateRoleGates({ routes, baseline: [P], exempt: {}, mainBaseline: [] });
    expect(grew.violations.map((v) => v.kind)).toEqual(['baseline-grew']);
    expect(grew.violations[0].message).toContain('can only shrink');

    // same route already on main: fine, and an entry main has that we dropped is just shrinkage
    expect(evaluateRoleGates({ routes, baseline: [P], exempt: {}, mainBaseline: [P, 'app/api/portal/old/route.ts'] }).violations).toEqual([]);
  });

  it('(d) is skipped when main has no baseline yet (the PR that introduces it)', () => {
    const routes = [{ path: P, source: ungatedSrc }];
    expect(evaluateRoleGates({ routes, baseline: [P], exempt: {}, mainBaseline: null }).violations).toEqual([]);
    expect(evaluateRoleGates({ routes, baseline: [P], exempt: {} }).violations).toEqual([]);
  });

  it("(c) fails a gated file whose mutating handler only ever names 'read'", () => {
    const { violations } = run([{ path: P, source: gatedReadMutatingSrc }]);
    expect(violations).toHaveLength(1);
    expect(violations[0].kind).toBe('gated-no-action');
    expect(violations[0].message).toContain('POST');
  });

  it('(c) accepts the read-ok marker on the export line, but not elsewhere', () => {
    const marked = `
export async function POST() { // role-gate: read-ok caller's own push token
  const r = await authorizePortal({ action: 'read' });
}`;
    expect(run([{ path: P, source: marked }]).violations).toEqual([]);

    const markerOnWrongLine = `
export async function POST() {
  // role-gate: read-ok not on the export line
  const r = await authorizePortal({ action: 'read' });
}`;
    expect(run([{ path: P, source: markerOnWrongLine }]).violations).toHaveLength(1);
  });

  it("(c) does not apply to a GET-only gated file at 'read'", () => {
    const src = `export async function GET() { await authorizePortal({ action: 'read' }); }`;
    expect(run([{ path: P, source: src }]).violations).toEqual([]);
  });

  it('a gate named only in a comment is not a gate', () => {
    const src = `// TODO call authorizePortal({ action: 'write' }) here\nexport async function POST() {}`;
    const { violations } = run([{ path: P, source: src }]);
    expect(violations.map((v) => v.kind)).toEqual(['new-ungated']);
  });
});

describe('namesActionAboveRead', () => {
  it('reads the action off authorizePortal / authorizePortalSite options', () => {
    expect(namesActionAboveRead(`authorizePortal({ action: 'write' })`)).toBe(true);
    expect(namesActionAboveRead(`authorizePortalSite({ siteId: 1, action: 'admin', observeRole: true })`)).toBe(true);
    expect(namesActionAboveRead(`authorizePortal({ action: 'read', requireService: 'email' })`)).toBe(false);
    expect(namesActionAboveRead(`authorizePortal()`)).toBe(false);
  });

  it('treats a dynamic action (chosen elsewhere, e.g. per voice tool) as deliberate', () => {
    expect(namesActionAboveRead(`authorizePortal({ action: tool.action })`)).toBe(true);
  });

  it('reads the third argument of gatePortalRole, even when an earlier argument contains commas', () => {
    expect(namesActionAboveRead(`gatePortalRole(parseInt(session.user.id, 10), client, 'write')`)).toBe(true);
    expect(namesActionAboveRead(`gatePortalRole(userId, client, 'read')`)).toBe(false);
    expect(namesActionAboveRead(`gatePortalRole(userId, client, action)`)).toBe(true);
  });
});

describe('EXEMPT', () => {
  it('gives every exemption a real reason', () => {
    for (const [path, reason] of Object.entries(EXEMPT)) {
      expect(path).toMatch(/^app\/api\/portal\/.+\/route\.ts$/);
      expect(reason.length).toBeGreaterThan(20);
    }
  });
});
