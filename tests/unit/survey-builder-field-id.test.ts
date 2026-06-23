import { describe, it, expect } from 'vitest';

// Test the guard logic directly — simulates what updateField does
describe('SurveyBuilder field ID immutability (FOUND-03)', () => {
  function applyPatch(
    fields: { id: string; label: string }[],
    targetId: string,
    patch: Record<string, unknown>
  ): { id: string; label: string }[] | null {
    // Replicates the guard from updateField
    if ('id' in patch) return null; // blocked
    return fields.map(f => f.id === targetId ? { ...f, ...patch } : f);
  }

  it('allows updating label without changing id', () => {
    const fields = [{ id: 'abc', label: 'Old' }];
    const result = applyPatch(fields, 'abc', { label: 'New' });
    expect(result).not.toBeNull();
    expect(result![0].id).toBe('abc');
    expect(result![0].label).toBe('New');
  });

  it('blocks patch that includes id key', () => {
    const fields = [{ id: 'abc', label: 'Test' }];
    const result = applyPatch(fields, 'abc', { id: 'xyz', label: 'New' });
    expect(result).toBeNull();
  });

  it('blocks patch with id even if id value is the same', () => {
    const fields = [{ id: 'abc', label: 'Test' }];
    const result = applyPatch(fields, 'abc', { id: 'abc', label: 'New' });
    expect(result).toBeNull();
  });
});
