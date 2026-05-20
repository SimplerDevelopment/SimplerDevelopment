import { describe, it, expect } from 'vitest';
import {
  roleAtLeast,
  canViewProject,
  canCommentOnProject,
  canEditProject,
  canManageProject,
  ROLE_OPTIONS,
} from '@/lib/portal/project-permissions';

describe('project-permissions — roleAtLeast', () => {
  it('returns false when role is null', () => {
    expect(roleAtLeast(null, 'viewer')).toBe(false);
    expect(roleAtLeast(null, 'owner')).toBe(false);
  });

  it('grants every role at least viewer', () => {
    for (const r of ROLE_OPTIONS) expect(roleAtLeast(r, 'viewer')).toBe(true);
  });

  it('blocks viewer from commenter / editor / owner', () => {
    expect(roleAtLeast('viewer', 'commenter')).toBe(false);
    expect(roleAtLeast('viewer', 'editor')).toBe(false);
    expect(roleAtLeast('viewer', 'owner')).toBe(false);
  });

  it('allows commenter to comment but not edit', () => {
    expect(canCommentOnProject('commenter')).toBe(true);
    expect(canEditProject('commenter')).toBe(false);
    expect(canManageProject('commenter')).toBe(false);
  });

  it('allows editor to comment + edit but not manage', () => {
    expect(canCommentOnProject('editor')).toBe(true);
    expect(canEditProject('editor')).toBe(true);
    expect(canManageProject('editor')).toBe(false);
  });

  it('allows owner to do everything', () => {
    expect(canViewProject('owner')).toBe(true);
    expect(canCommentOnProject('owner')).toBe(true);
    expect(canEditProject('owner')).toBe(true);
    expect(canManageProject('owner')).toBe(true);
  });
});
