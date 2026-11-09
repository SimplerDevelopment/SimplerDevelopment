import { describe, it, expect } from 'vitest';
import { recordFromPath, noteLinkFor } from '@/lib/brain/record-from-path';

describe('recordFromPath (PUX-199)', () => {
  it('reads the record off real portal routes only', () => {
    expect(recordFromPath('/portal/crm/contacts/12')).toEqual({ kind: 'contact', id: 12, label: 'this contact' });
    expect(recordFromPath('/portal/websites/3/posts/77/edit')?.kind).toBe('page');
    expect(recordFromPath('/portal/brain/knowledge/5')?.kind).toBe('note');
    expect(recordFromPath('/portal/brain/notes/5')).toBeNull(); // dead route
    expect(recordFromPath('/portal/dashboard')).toBeNull();
    expect(noteLinkFor(recordFromPath('/portal/crm/deals/9'))).toEqual({ dealId: 9 });
    expect(noteLinkFor(null)).toEqual({});
  });
});
