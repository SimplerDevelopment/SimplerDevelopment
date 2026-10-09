// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const results: unknown[][] = [];
const wheres: unknown[] = [];
vi.mock('@/lib/db', () => {
  const chain = () => {
    const q: Record<string, unknown> = {};
    for (const m of ['select', 'from', 'where', 'limit']) q[m] = (arg: unknown) => { if (m === 'where') wheres.push(arg); return q; };
    q.then = (res: (v: unknown) => void) => res(results.shift() ?? []);
    return q;
  };
  return { db: { select: () => chain() } };
});
let role = 'client';
vi.mock('@/lib/auth', () => ({ auth: vi.fn(async () => ({ user: { id: '7', role } })) }));

import { GET } from '@/app/api/portal/invoices/[id]/pdf/route';

const invoice = { id: 42, number: 'INV-042', status: 'sent', createdAt: '2026-08-01', dueDate: '2026-08-15', paidAt: null, subtotal: 10000, tax: 0, total: 10000, notes: null };
beforeEach(() => { results.length = 0; wheres.length = 0; role = 'client'; });

describe('GET /api/portal/invoices/[id]/pdf (PUX-192)', () => {
  it('404s when the invoice is not the client\'s', async () => {
    results.push([{ id: 104 }], []);
    const res = await GET(new Request('http://x'), { params: Promise.resolve({ id: '42' }) });
    expect(res.status).toBe(404);
    expect(wheres).toHaveLength(2); // client lookup, then invoice scoped by client
  });
  it('streams a PDF for a scoped invoice', async () => {
    results.push([{ id: 104 }], [invoice], [{ id: 1, description: 'Design', quantity: 1, unitPrice: 10000, total: 10000 }]);
    const res = await GET(new Request('http://x'), { params: Promise.resolve({ id: '42' }) });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/pdf');
    expect(res.headers.get('content-disposition')).toContain('INV-042.pdf');
    const head = Buffer.from(await res.arrayBuffer()).subarray(0, 4).toString();
    expect(head).toBe('%PDF');
  });
});
