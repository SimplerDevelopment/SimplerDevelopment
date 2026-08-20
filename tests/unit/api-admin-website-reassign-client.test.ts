// @vitest-environment node
/**
 * Guard + validation paths for the admin website reassign-client endpoint.
 * The transactional move itself is exercised by the tenancy integration gate;
 * these tests pin the auth wall and the exactly-one-mode body contract.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const authMock = vi.fn();
vi.mock('@/lib/auth', () => ({ auth: () => authMock() }));

const selectMock = vi.fn();
vi.mock('@/lib/db', () => ({
  db: {
    select: (...args: unknown[]) => selectMock(...args),
    transaction: vi.fn(),
  },
}));

import { POST } from '@/app/api/admin/portal/websites/[id]/reassign-client/route';

function makeReq(body: unknown) {
  return new Request('http://localhost/api/admin/portal/websites/416/reassign-client', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}
const params = { params: Promise.resolve({ id: '416' }) };

beforeEach(() => {
  authMock.mockReset();
  selectMock.mockReset();
});

describe('POST /api/admin/portal/websites/[id]/reassign-client', () => {
  it('401s without a session', async () => {
    authMock.mockResolvedValue(null);
    const res = await POST(makeReq({ targetClientId: 1 }), params);
    expect(res.status).toBe(401);
    expect(authMock).toHaveBeenCalled();
  });

  it('401s for non-staff roles', async () => {
    authMock.mockResolvedValue({ user: { id: 5, role: 'client' } });
    const res = await POST(makeReq({ targetClientId: 1 }), params);
    expect(res.status).toBe(401);
  });

  it('400s when neither mode is provided', async () => {
    authMock.mockResolvedValue({ user: { id: 1, role: 'admin' } });
    const res = await POST(makeReq({}), params);
    expect(res.status).toBe(400);
  });

  it('400s when both modes are provided', async () => {
    authMock.mockResolvedValue({ user: { id: 1, role: 'admin' } });
    const res = await POST(
      makeReq({ targetClientId: 2, createClient: { company: 'X', ownerUserId: 1 } }),
      params
    );
    expect(res.status).toBe(400);
    // Body-contract rejection must happen before any data access.
    expect(selectMock).not.toHaveBeenCalled();
  });
});
