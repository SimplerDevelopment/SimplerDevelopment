// @vitest-environment node
/**
 * Unit tests for lib/vercel.ts — a thin REST wrapper around the Vercel API.
 *
 * All exported functions read env vars (VERCEL_API_TOKEN, VERCEL_TEAM_ID,
 * PLATFORM_VERCEL_PROJECT_ID) at call time, not at module load, so a single
 * import + per-test env mutation is sufficient.
 *
 * fetch is mocked via vi.spyOn(globalThis, 'fetch') and restored in afterEach.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getPlatformProjectId,
  resolveDomainProjectId,
  createProject,
  addDomain,
  getDomainConfig,
  removeDomain,
  createDeployment,
  setEnvVars,
  getDeploymentEvents,
  verifyDomain,
  getDeployments,
} from '@/lib/vercel';

const ORIGINAL_TOKEN = process.env.VERCEL_API_TOKEN;
const ORIGINAL_TEAM_ID = process.env.VERCEL_TEAM_ID;
const ORIGINAL_PLATFORM_ID = process.env.PLATFORM_VERCEL_PROJECT_ID;

let fetchSpy: ReturnType<typeof vi.spyOn>;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function textResponse(text: string, status = 500): Response {
  return new Response(text, { status, headers: { 'content-type': 'text/plain' } });
}

beforeEach(() => {
  process.env.VERCEL_API_TOKEN = 'tok-test';
  process.env.VERCEL_TEAM_ID = 'team_test';
  process.env.PLATFORM_VERCEL_PROJECT_ID = 'prj_platform';
  fetchSpy = vi.spyOn(globalThis, 'fetch');
});

afterEach(() => {
  fetchSpy.mockRestore();
  if (ORIGINAL_TOKEN === undefined) delete process.env.VERCEL_API_TOKEN;
  else process.env.VERCEL_API_TOKEN = ORIGINAL_TOKEN;
  if (ORIGINAL_TEAM_ID === undefined) delete process.env.VERCEL_TEAM_ID;
  else process.env.VERCEL_TEAM_ID = ORIGINAL_TEAM_ID;
  if (ORIGINAL_PLATFORM_ID === undefined) delete process.env.PLATFORM_VERCEL_PROJECT_ID;
  else process.env.PLATFORM_VERCEL_PROJECT_ID = ORIGINAL_PLATFORM_ID;
});

describe('getPlatformProjectId', () => {
  it('returns the configured platform project id', () => {
    expect(getPlatformProjectId()).toBe('prj_platform');
  });

  it('throws when PLATFORM_VERCEL_PROJECT_ID is missing', () => {
    delete process.env.PLATFORM_VERCEL_PROJECT_ID;
    expect(() => getPlatformProjectId()).toThrow(/PLATFORM_VERCEL_PROJECT_ID/);
  });
});

describe('resolveDomainProjectId', () => {
  it('returns the dedicated project id when provided', () => {
    expect(resolveDomainProjectId('prj_dedicated')).toBe('prj_dedicated');
  });

  it('falls back to the platform project id for null', () => {
    expect(resolveDomainProjectId(null)).toBe('prj_platform');
  });

  it('falls back to the platform project id for undefined', () => {
    expect(resolveDomainProjectId(undefined)).toBe('prj_platform');
  });

  it('falls back to the platform project id for empty string', () => {
    expect(resolveDomainProjectId('')).toBe('prj_platform');
  });
});

describe('headers / auth (indirect)', () => {
  it('throws when VERCEL_API_TOKEN is missing on any API call', async () => {
    delete process.env.VERCEL_API_TOKEN;
    await expect(createProject('foo', 'a/b')).rejects.toThrow(/VERCEL_API_TOKEN/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('createProject', () => {
  it('POSTs to /v10/projects with team query and returns id + url', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ id: 'prj_new' }));
    const result = await createProject('my-site', 'org/repo');
    expect(result).toEqual({
      id: 'prj_new',
      url: 'https://vercel.com/team/my-site',
    });
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://api.vercel.com/v10/projects?teamId=team_test');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer tok-test',
      'Content-Type': 'application/json',
    });
    expect(JSON.parse(init.body)).toEqual({
      name: 'my-site',
      framework: 'nextjs',
      gitRepository: { type: 'github', repo: 'org/repo' },
    });
  });

  it('uses dashboard segment in URL when no team id is set', async () => {
    delete process.env.VERCEL_TEAM_ID;
    fetchSpy.mockResolvedValueOnce(jsonResponse({ id: 'prj_x' }));
    const result = await createProject('solo-site', 'org/repo');
    expect(result.url).toBe('https://vercel.com/dashboard/solo-site');
    const [url] = fetchSpy.mock.calls[0];
    // No teamId query string when team id is unset
    expect(url).toBe('https://api.vercel.com/v10/projects');
  });

  it('throws with status + body when Vercel rejects', async () => {
    fetchSpy.mockResolvedValueOnce(textResponse('bad name', 400));
    await expect(createProject('bad!', 'org/repo')).rejects.toThrow(
      /createProject failed \(400\): bad name/,
    );
  });
});

describe('addDomain', () => {
  it('POSTs to project domains endpoint and returns apex/verified', async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse({ apexName: 'example.com', verified: true }),
    );
    const result = await addDomain('prj_1', 'www.example.com');
    expect(result).toEqual({ apexName: 'example.com', verified: true });
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://api.vercel.com/v10/projects/prj_1/domains?teamId=team_test');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ name: 'www.example.com' });
  });

  it('defaults apexName to the input domain when missing in response', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({}));
    const result = await addDomain('prj_1', 'example.com');
    expect(result).toEqual({ apexName: 'example.com', verified: false });
  });

  it('treats 409 (already added) as a non-error', async () => {
    fetchSpy.mockResolvedValueOnce(textResponse('already exists', 409));
    const result = await addDomain('prj_1', 'example.com');
    expect(result).toEqual({ apexName: 'example.com', verified: false });
  });

  it('throws on non-409 errors', async () => {
    fetchSpy.mockResolvedValueOnce(textResponse('forbidden', 403));
    await expect(addDomain('prj_1', 'example.com')).rejects.toThrow(
      /addDomain failed \(403\): forbidden/,
    );
  });
});

describe('getDomainConfig', () => {
  it('returns cnames from the API response', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ cnames: ['custom.vercel-dns.com'] }));
    const result = await getDomainConfig('example.com');
    expect(result).toEqual({ cnames: ['custom.vercel-dns.com'] });
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://api.vercel.com/v6/domains/example.com/config?teamId=team_test');
    expect(init?.method).toBeUndefined();
  });

  it('falls back to default cname when api response has empty cnames', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ cnames: [] }));
    const result = await getDomainConfig('example.com');
    expect(result).toEqual({ cnames: ['cname.vercel-dns.com'] });
  });

  it('falls back to default cname when cnames is missing entirely', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({}));
    const result = await getDomainConfig('example.com');
    expect(result).toEqual({ cnames: ['cname.vercel-dns.com'] });
  });

  it('returns default cname when the API errors', async () => {
    fetchSpy.mockResolvedValueOnce(textResponse('not found', 404));
    const result = await getDomainConfig('missing.com');
    expect(result).toEqual({ cnames: ['cname.vercel-dns.com'] });
  });
});

describe('removeDomain', () => {
  it('DELETEs and resolves on success', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await expect(removeDomain('prj_1', 'example.com')).resolves.toBeUndefined();
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe(
      'https://api.vercel.com/v10/projects/prj_1/domains/example.com?teamId=team_test',
    );
    expect(init.method).toBe('DELETE');
  });

  it('throws on non-OK response', async () => {
    fetchSpy.mockResolvedValueOnce(textResponse('nope', 500));
    await expect(removeDomain('prj_1', 'example.com')).rejects.toThrow(
      /removeDomain failed \(500\): nope/,
    );
  });
});

describe('createDeployment', () => {
  it('POSTs with default ref=main and returns deployment id', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ id: 'dpl_1' }));
    const result = await createDeployment('prj_1', 'org/repo');
    expect(result).toEqual({ id: 'dpl_1' });
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://api.vercel.com/v13/deployments?teamId=team_test');
    expect(JSON.parse(init.body)).toEqual({
      name: 'prj_1',
      project: 'prj_1',
      gitSource: { type: 'github', repo: 'org/repo', ref: 'main' },
    });
  });

  it('passes through a custom ref', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({ id: 'dpl_2' }));
    await createDeployment('prj_1', 'org/repo', 'staging');
    const [, init] = fetchSpy.mock.calls[0];
    expect(JSON.parse(init.body).gitSource.ref).toBe('staging');
  });

  it('throws on API error', async () => {
    fetchSpy.mockResolvedValueOnce(textResponse('boom', 502));
    await expect(createDeployment('prj_1', 'org/repo')).rejects.toThrow(
      /createDeployment failed \(502\): boom/,
    );
  });
});

describe('setEnvVars', () => {
  it('POSTs each env var with default targets', async () => {
    fetchSpy.mockResolvedValue(jsonResponse({}));
    await setEnvVars('prj_1', [
      { key: 'FOO', value: 'foo-val' },
      { key: 'BAR', value: 'bar-val', target: ['production'] },
    ]);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const [url1, init1] = fetchSpy.mock.calls[0];
    expect(url1).toBe('https://api.vercel.com/v10/projects/prj_1/env?teamId=team_test');
    expect(JSON.parse(init1.body)).toEqual({
      key: 'FOO',
      value: 'foo-val',
      type: 'plain',
      target: ['production', 'preview', 'development'],
    });
    const [, init2] = fetchSpy.mock.calls[1];
    expect(JSON.parse(init2.body).target).toEqual(['production']);
  });

  it('swallows 409 (already exists) errors', async () => {
    fetchSpy.mockResolvedValueOnce(textResponse('exists', 409));
    await expect(
      setEnvVars('prj_1', [{ key: 'FOO', value: 'v' }]),
    ).resolves.toBeUndefined();
  });

  it('throws on non-409 errors', async () => {
    fetchSpy.mockResolvedValueOnce(textResponse('boom', 500));
    await expect(
      setEnvVars('prj_1', [{ key: 'FOO', value: 'v' }]),
    ).rejects.toThrow(/setEnvVar FOO failed \(500\): boom/);
  });

  it('no-ops on empty var list', async () => {
    await expect(setEnvVars('prj_1', [])).resolves.toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('getDeploymentEvents', () => {
  it('maps events with string text and number created', async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse([
        { type: 'stdout', text: 'hello', created: 1700000000 },
        { type: 'stderr', payload: { text: 'oops' }, created: 1700000001 },
      ]),
    );
    const events = await getDeploymentEvents('dpl_1');
    expect(events).toEqual([
      { type: 'stdout', text: 'hello', created: 1700000000 },
      { type: 'stderr', text: 'oops', created: 1700000001 },
    ]);
    const [url] = fetchSpy.mock.calls[0];
    expect(url).toBe(
      'https://api.vercel.com/v3/deployments/dpl_1/events?teamId=team_test',
    );
  });

  it('uses default type/text/created when fields are missing', async () => {
    const before = Date.now();
    fetchSpy.mockResolvedValueOnce(jsonResponse([{}]));
    const events = await getDeploymentEvents('dpl_1');
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('stdout');
    expect(events[0].text).toBe('');
    expect(events[0].created).toBeGreaterThanOrEqual(before);
  });

  it('returns [] when API returns null/empty', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(null));
    const events = await getDeploymentEvents('dpl_1');
    expect(events).toEqual([]);
  });

  it('omits teamId from query when env var is unset', async () => {
    delete process.env.VERCEL_TEAM_ID;
    fetchSpy.mockResolvedValueOnce(jsonResponse([]));
    await getDeploymentEvents('dpl_1');
    const [url] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://api.vercel.com/v3/deployments/dpl_1/events?');
  });

  it('throws on API error', async () => {
    fetchSpy.mockResolvedValueOnce(textResponse('nope', 500));
    await expect(getDeploymentEvents('dpl_1')).rejects.toThrow(
      /getDeploymentEvents failed \(500\): nope/,
    );
  });
});

describe('verifyDomain', () => {
  it('aggregates DNS records from config + verification', async () => {
    fetchSpy
      .mockResolvedValueOnce(
        jsonResponse({
          misconfigured: false,
          cnames: ['cname.vercel-dns.com'],
          aValues: ['76.76.21.21'],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          verified: true,
          verification: [
            { type: 'TXT', domain: 'example.com', value: 'vc-domain-verify=abc' },
          ],
        }),
      );

    const result = await verifyDomain('prj_1', 'example.com');
    expect(result.verified).toBe(true);
    expect(result.misconfigured).toBe(false);
    expect(result.dnsRecords).toEqual([
      { type: 'CNAME', host: 'example.com', value: 'cname.vercel-dns.com' },
      { type: 'A', host: 'example.com', value: '76.76.21.21' },
      {
        type: 'TXT',
        host: 'example.com',
        value: 'vc-domain-verify=abc',
        expected: 'vc-domain-verify=abc',
      },
    ]);
  });

  it('treats config-not-ok as misconfigured and returns no dns records', async () => {
    fetchSpy
      .mockResolvedValueOnce(textResponse('not found', 404))
      .mockResolvedValueOnce(jsonResponse({ verified: false }));
    const result = await verifyDomain('prj_1', 'missing.com');
    expect(result.verified).toBe(false);
    expect(result.misconfigured).toBe(true);
    expect(result.dnsRecords).toEqual([]);
  });

  it('returns early when verify endpoint reports 404', async () => {
    fetchSpy
      .mockResolvedValueOnce(jsonResponse({ misconfigured: false }))
      .mockResolvedValueOnce(textResponse('not found', 404));
    const result = await verifyDomain('prj_1', 'example.com');
    expect(result).toEqual({
      verified: false,
      misconfigured: true,
      dnsRecords: [],
      error: 'Domain not found on this project',
    });
  });

  it('handles missing optional fields without throwing', async () => {
    fetchSpy
      .mockResolvedValueOnce(jsonResponse({}))
      .mockResolvedValueOnce(jsonResponse({}));
    const result = await verifyDomain('prj_1', 'example.com');
    expect(result.verified).toBe(false);
    // misconfigured defaults to true when missing
    expect(result.misconfigured).toBe(true);
    expect(result.dnsRecords).toEqual([]);
  });

  it('does not propagate errors from non-404 verify failures (falls through)', async () => {
    fetchSpy
      .mockResolvedValueOnce(jsonResponse({ misconfigured: false }))
      .mockResolvedValueOnce(textResponse('internal', 500));
    const result = await verifyDomain('prj_1', 'example.com');
    expect(result.verified).toBe(false);
    expect(result.misconfigured).toBe(false);
    expect(result.dnsRecords).toEqual([]);
  });
});

describe('getDeployments', () => {
  it('returns mapped deployments with default limit=5', async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse({
        deployments: [
          {
            uid: 'dpl_1',
            url: 'foo.vercel.app',
            state: 'READY',
            createdAt: 1700000000,
            meta: { githubCommitMessage: 'init', githubCommitRef: 'main' },
          },
        ],
      }),
    );
    const result = await getDeployments('prj_1');
    expect(result).toEqual([
      {
        id: 'dpl_1',
        url: 'https://foo.vercel.app',
        state: 'READY',
        createdAt: 1700000000,
        meta: { githubCommitMessage: 'init', githubCommitRef: 'main' },
      },
    ]);
    const [url] = fetchSpy.mock.calls[0];
    expect(url).toContain('projectId=prj_1');
    expect(url).toContain('limit=5');
    expect(url).toContain('teamId=team_test');
    expect(url).toMatch(/^https:\/\/api\.vercel\.com\/v6\/deployments\?/);
  });

  it('falls back to readyState/created when state/createdAt are missing', async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse({
        deployments: [
          { uid: 'dpl_2', url: 'bar.vercel.app', readyState: 'BUILDING', created: 1700000123 },
        ],
      }),
    );
    const result = await getDeployments('prj_1', 3);
    expect(result[0].state).toBe('BUILDING');
    expect(result[0].createdAt).toBe(1700000123);
    const [url] = fetchSpy.mock.calls[0];
    expect(url).toContain('limit=3');
  });

  it('returns [] when deployments key is missing', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse({}));
    const result = await getDeployments('prj_1');
    expect(result).toEqual([]);
  });

  it('omits teamId from query when env var is unset', async () => {
    delete process.env.VERCEL_TEAM_ID;
    fetchSpy.mockResolvedValueOnce(jsonResponse({ deployments: [] }));
    await getDeployments('prj_1');
    const [url] = fetchSpy.mock.calls[0];
    expect(url).not.toContain('teamId=');
  });

  it('throws on API error', async () => {
    fetchSpy.mockResolvedValueOnce(textResponse('boom', 500));
    await expect(getDeployments('prj_1')).rejects.toThrow(
      /getDeployments failed \(500\): boom/,
    );
  });
});
