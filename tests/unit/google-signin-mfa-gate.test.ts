/**
 * AUTH79-012. The credentials branch of the auth config is fail-closed on TOTP.
 * The Google branch resolved a user by Google-verified email and stamped their
 * full role without ever consulting `mfaEnabled` — so any account with 2FA on,
 * including admin, could be signed in with one compromised Google account and
 * neither the portal password nor the 6-digit code.
 *
 * The jwt callback needs the whole NextAuth pipeline to exercise directly, so
 * these guard the two structural properties that make the fix work. Both are
 * things a later refactor could silently undo.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const authSrc = readFileSync(join(process.cwd(), 'lib/auth.ts'), 'utf8');
const serviceSrc = readFileSync(join(process.cwd(), 'lib/signup/service.ts'), 'utf8');

/** The Google branch of the jwt callback, sliced out by its own anchors. */
function googleBranch(): string {
  const start = authSrc.indexOf("if (account?.provider === 'google')");
  expect(start, 'Google branch anchor not found in lib/auth.ts').toBeGreaterThan(-1);
  const end = authSrc.indexOf('if (user) {', start);
  expect(end, 'end anchor not found after the Google branch').toBeGreaterThan(start);
  return authSrc.slice(start, end);
}

describe('Google sign-in cannot bypass the TOTP gate', () => {
  it('the Google branch consults mfaEnabled', () => {
    expect(
      googleBranch().includes('resolved.mfaEnabled'),
      'lib/auth.ts resolves a Google user and never checks mfaEnabled — an ' +
        'account with 2FA enabled can be signed in with neither the portal ' +
        'password nor a TOTP code (AUTH79-012).',
    ).toBe(true);
  });

  // Order is the whole fix. Checking mfaEnabled AFTER stamping the role would
  // leave a token minted for a privileged account on the way to rejecting it.
  it('checks mfaEnabled BEFORE stamping the role onto the token', () => {
    const branch = googleBranch();
    const check = branch.indexOf('resolved.mfaEnabled');
    const stamp = branch.indexOf('token.role = resolved.role');
    expect(check).toBeGreaterThan(-1);
    expect(stamp).toBeGreaterThan(-1);
    expect(
      check < stamp,
      'the mfaEnabled check must precede `token.role = resolved.role`',
    ).toBe(true);
  });

  it('refuses rather than continuing when MFA is enabled', () => {
    const branch = googleBranch();
    const check = branch.indexOf('resolved.mfaEnabled');
    // The branch must return null (rejecting the sign-in) between the check and
    // the role stamp — not merely log and fall through.
    const between = branch.slice(check, branch.indexOf('token.role = resolved.role'));
    expect(between).toContain('return null');
  });
});

describe('findOrCreateGoogleUser supplies mfaEnabled on every path', () => {
  it('declares it in the return type', () => {
    expect(serviceSrc).toContain('mfaEnabled: boolean } | null>');
  });

  // Three return paths — existing-by-googleId, existing-by-email, and a fresh
  // insert. A path that omits it yields `undefined`, which is falsy, which
  // silently reopens the bypass for exactly the users that path serves.
  it('returns it from all three paths', () => {
    const start = serviceSrc.indexOf('export async function findOrCreateGoogleUser');
    expect(start).toBeGreaterThan(-1);
    // Bound the slice by the NEXT top-level export, not by a brace — brace
    // matching on source text is exactly the kind of thing that silently
    // slices too little and makes this assert nothing.
    const nextExport = serviceSrc.indexOf('\nexport ', start + 1);
    const body = serviceSrc.slice(start, nextExport > -1 ? nextExport : undefined);
    const returns = body.split('mfaEnabled:').length - 1;
    expect(
      returns,
      `expected mfaEnabled on the return type plus all 3 return paths and both ` +
        `selects; found ${returns} mentions`,
    ).toBeGreaterThanOrEqual(4);
  });
});
