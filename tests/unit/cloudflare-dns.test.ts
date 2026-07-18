// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createCnameRecord,
  deleteDnsRecord,
  listDnsRecords,
  updateCnameRecord,
} from '@/lib/cloudflare-dns';

const CF_API = 'https://api.cloudflare.com/client/v4';

function makeResponse(opts: {
  ok?: boolean;
  status?: number;
  json?: unknown;
  text?: string;
}): Response {
  const ok = opts.ok ?? true;
  const status = opts.status ?? (ok ? 200 : 500);
  return {
    ok,
    status,
    async json() {
      return opts.json;
    },
    async text() {
      return opts.text ?? '';
    },
  } as unknown as Response;
}

describe('lib/cloudflare-dns', () => {
  const originalToken = process.env.CLOUDFLARE_API_TOKEN;
  const originalZone = process.env.CLOUDFLARE_ZONE_ID;

  beforeEach(() => {
    process.env.CLOUDFLARE_API_TOKEN = 'test-token';
    process.env.CLOUDFLARE_ZONE_ID = 'test-zone';
  });

  afterEach(() => {
    if (originalToken === undefined) delete process.env.CLOUDFLARE_API_TOKEN;
    else process.env.CLOUDFLARE_API_TOKEN = originalToken;
    if (originalZone === undefined) delete process.env.CLOUDFLARE_ZONE_ID;
    else process.env.CLOUDFLARE_ZONE_ID = originalZone;
    vi.restoreAllMocks();
  });

  describe('createCnameRecord', () => {
    it('POSTs the expected payload and returns the new record id', async () => {
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(
          makeResponse({ ok: true, json: { result: { id: 'rec_abc' } } }),
        );

      const result = await createCnameRecord('acme-main', 'cname.vercel-dns.com');

      expect(result).toEqual({ id: 'rec_abc' });
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${CF_API}/zones/test-zone/dns_records`);
      expect(init.method).toBe('POST');
      expect(init.headers).toEqual({
        Authorization: 'Bearer test-token',
        'Content-Type': 'application/json',
      });
      const body = JSON.parse(init.body as string);
      expect(body).toEqual({
        type: 'CNAME',
        name: 'acme-main',
        content: 'cname.vercel-dns.com',
        ttl: 1,
        proxied: false,
      });
    });

    it('throws with status + body when Cloudflare returns a non-ok response', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        makeResponse({ ok: false, status: 400, text: '{"err":"bad"}' }),
      );

      await expect(createCnameRecord('x', 'y')).rejects.toThrow(
        /Cloudflare createCnameRecord failed \(400\): \{"err":"bad"\}/,
      );
    });

    it('throws if CLOUDFLARE_API_TOKEN is missing', async () => {
      delete process.env.CLOUDFLARE_API_TOKEN;
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      await expect(createCnameRecord('x', 'y')).rejects.toThrow(
        'Missing CLOUDFLARE_API_TOKEN',
      );
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('throws if CLOUDFLARE_ZONE_ID is missing', async () => {
      delete process.env.CLOUDFLARE_ZONE_ID;
      const fetchSpy = vi.spyOn(globalThis, 'fetch');
      await expect(createCnameRecord('x', 'y')).rejects.toThrow(
        'Missing CLOUDFLARE_ZONE_ID',
      );
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  describe('updateCnameRecord', () => {
    it('PATCHes the record with new content and resolves on success', async () => {
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(makeResponse({ ok: true, json: {} }));

      await expect(
        updateCnameRecord('rec_123', 'new.example.com'),
      ).resolves.toBeUndefined();

      const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${CF_API}/zones/test-zone/dns_records/rec_123`);
      expect(init.method).toBe('PATCH');
      expect(init.headers).toEqual({
        Authorization: 'Bearer test-token',
        'Content-Type': 'application/json',
      });
      expect(JSON.parse(init.body as string)).toEqual({ content: 'new.example.com' });
    });

    it('throws when Cloudflare returns a non-ok response', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        makeResponse({ ok: false, status: 404, text: 'not found' }),
      );

      await expect(updateCnameRecord('rec_xx', 'foo')).rejects.toThrow(
        /Cloudflare updateCnameRecord failed \(404\): not found/,
      );
    });

    it('throws if CLOUDFLARE_API_TOKEN is missing', async () => {
      delete process.env.CLOUDFLARE_API_TOKEN;
      await expect(updateCnameRecord('rec', 'foo')).rejects.toThrow(
        'Missing CLOUDFLARE_API_TOKEN',
      );
    });

    it('throws if CLOUDFLARE_ZONE_ID is missing', async () => {
      delete process.env.CLOUDFLARE_ZONE_ID;
      await expect(updateCnameRecord('rec', 'foo')).rejects.toThrow(
        'Missing CLOUDFLARE_ZONE_ID',
      );
    });
  });

  describe('deleteDnsRecord', () => {
    it('issues a DELETE and resolves on success', async () => {
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(makeResponse({ ok: true, json: {} }));

      await expect(deleteDnsRecord('rec_del')).resolves.toBeUndefined();

      const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`${CF_API}/zones/test-zone/dns_records/rec_del`);
      expect(init.method).toBe('DELETE');
      expect(init.headers).toEqual({
        Authorization: 'Bearer test-token',
        'Content-Type': 'application/json',
      });
      expect(init.body).toBeUndefined();
    });

    it('throws with status + body when Cloudflare returns a non-ok response', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        makeResponse({ ok: false, status: 403, text: 'forbidden' }),
      );

      await expect(deleteDnsRecord('rec_del')).rejects.toThrow(
        /Cloudflare deleteDnsRecord failed \(403\): forbidden/,
      );
    });

    it('throws if CLOUDFLARE_API_TOKEN is missing', async () => {
      delete process.env.CLOUDFLARE_API_TOKEN;
      await expect(deleteDnsRecord('rec')).rejects.toThrow(
        'Missing CLOUDFLARE_API_TOKEN',
      );
    });

    it('throws if CLOUDFLARE_ZONE_ID is missing', async () => {
      delete process.env.CLOUDFLARE_ZONE_ID;
      await expect(deleteDnsRecord('rec')).rejects.toThrow('Missing CLOUDFLARE_ZONE_ID');
    });
  });

  describe('listDnsRecords', () => {
    it('GETs with the correct query string and maps the results', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        makeResponse({
          ok: true,
          json: {
            result: [
              {
                id: 'r1',
                type: 'CNAME',
                name: 'acme-main.simplerdevelopment.com',
                content: 'cname.vercel-dns.com',
                extra: 'ignored',
              },
              {
                id: 'r2',
                type: 'CNAME',
                name: 'acme-main.simplerdevelopment.com',
                content: 'other.vercel-dns.com',
              },
            ],
          },
        }),
      );

      const result = await listDnsRecords('acme-main');

      expect(result).toEqual([
        {
          id: 'r1',
          type: 'CNAME',
          name: 'acme-main.simplerdevelopment.com',
          content: 'cname.vercel-dns.com',
        },
        {
          id: 'r2',
          type: 'CNAME',
          name: 'acme-main.simplerdevelopment.com',
          content: 'other.vercel-dns.com',
        },
      ]);

      const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(
        `${CF_API}/zones/test-zone/dns_records?name=acme-main.simplerdevelopment.com&type=CNAME`,
      );
      expect(init.method).toBeUndefined();
      expect(init.headers).toEqual({
        Authorization: 'Bearer test-token',
        'Content-Type': 'application/json',
      });
    });

    it('returns an empty array when Cloudflare omits the result field', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        makeResponse({ ok: true, json: {} }),
      );

      await expect(listDnsRecords('nothing')).resolves.toEqual([]);
    });

    it('returns an empty array when Cloudflare returns result: null', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        makeResponse({ ok: true, json: { result: null } }),
      );

      await expect(listDnsRecords('nothing')).resolves.toEqual([]);
    });

    it('throws with status + body when Cloudflare returns a non-ok response', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
        makeResponse({ ok: false, status: 500, text: 'boom' }),
      );

      await expect(listDnsRecords('acme-main')).rejects.toThrow(
        /Cloudflare listDnsRecords failed \(500\): boom/,
      );
    });

    it('throws if CLOUDFLARE_API_TOKEN is missing', async () => {
      delete process.env.CLOUDFLARE_API_TOKEN;
      await expect(listDnsRecords('x')).rejects.toThrow('Missing CLOUDFLARE_API_TOKEN');
    });

    it('throws if CLOUDFLARE_ZONE_ID is missing', async () => {
      delete process.env.CLOUDFLARE_ZONE_ID;
      await expect(listDnsRecords('x')).rejects.toThrow('Missing CLOUDFLARE_ZONE_ID');
    });
  });
});
