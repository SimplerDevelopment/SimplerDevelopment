import { describe, it, expect } from 'vitest';
import { groupScopes } from '@/lib/mcp/scope-groups';

const groups = [
  { label: 'Content', scopes: [{ value: 'sites:read' }, { value: 'sites:write' }] },
  { label: 'Company Brain', scopes: [{ value: 'brain:read' }, { value: 'brain:approve' }] },
];
describe('groupScopes (PUX-214)', () => {
  it('groups a key\'s scopes by the picker\'s own groups, unknowns last', () => {
    expect(groupScopes(groups, ['brain:read', 'sites:read', 'legacy:thing'])).toEqual([
      ['Content', ['sites:read']], ['Company Brain', ['brain:read']], ['Other', ['legacy:thing']],
    ]);
    expect(groupScopes(groups, [])).toEqual([]);
  });
});
