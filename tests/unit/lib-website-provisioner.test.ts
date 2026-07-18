// @vitest-environment node
/**
 * Unit tests for lib/website-provisioner.ts — provisionWebsite + changeSubdomain.
 *
 * All external dependencies (db, GitHub, Vercel, Cloudflare DNS) are mocked.
 * The DB mock uses the chainable select-queue pattern from batch-33h.
 * setTimeout is fake-timed so the 2s retry delay runs instantly.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// drizzle-orm operators — inert stubs
// ---------------------------------------------------------------------------
vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args }),
}));

// ---------------------------------------------------------------------------
// schema proxy — makes any table property access return a stable object
// ---------------------------------------------------------------------------
vi.mock('@/lib/db/schema', () => {
  const wrap = (name: string) =>
    new Proxy(
      { __table: name },
      {
        get(_t, prop: string) {
          if (prop === '__table') return name;
          if (prop === 'then' || prop === '__esModule' || prop === 'default') return undefined;
          return { __col: prop, __table: name };
        },
      },
    );
  return new Proxy(
    {
      clientWebsites: wrap('clientWebsites'),
      websiteEnvironments: wrap('websiteEnvironments'),
    },
    {
      has: (t, p) => p in t,
      get: (t, p: string) => {
        if (p in t) return t[p as keyof typeof t];
        if (p === 'then' || p === '__esModule' || p === 'default' || typeof p !== 'string')
          return undefined;
        return wrap(p);
      },
    },
  );
});

// ---------------------------------------------------------------------------
// DB mock — select-queue + captured writes
// ---------------------------------------------------------------------------

interface UpdateCall {
  table: string;
  patch: Record<string, unknown>;
  filter: unknown;
}
interface InsertCall {
  table: string;
  values: unknown;
}
interface SelectCall {
  table: string;
}

let selectQueue: Array<Array<Record<string, unknown>>> = [];
const updateCalls: UpdateCall[] = [];
const insertCalls: InsertCall[] = [];
const selectCalls: SelectCall[] = [];

function shiftSelect(): Array<Record<string, unknown>> {
  return selectQueue.shift() ?? [];
}

vi.mock('@/lib/db', () => {
  function buildSelect() {
    let resolved: Promise<Array<Record<string, unknown>>> | null = null;
    const materialize = () => {
      if (!resolved) resolved = Promise.resolve(shiftSelect());
      return resolved;
    };
    const chain: Record<string, unknown> = {};
    for (const m of ['from', 'where', 'leftJoin', 'innerJoin', 'orderBy', 'limit', 'offset']) {
      chain[m] = (..._args: unknown[]) => {
        if (m === 'from') selectCalls.push({ table: String(_args[0]?.__table ?? '?') });
        return chain;
      };
    }
    chain.then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
      materialize().then(onF, onR);
    return chain;
  }

  function buildUpdate(table: { __table: string }) {
    return {
      set(patch: Record<string, unknown>) {
        return {
          where(filter: unknown) {
            updateCalls.push({ table: table.__table, patch, filter });
            return {
              then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
                return Promise.resolve(undefined).then(onF, onR);
              },
            };
          },
        };
      },
    };
  }

  function buildInsert(table: { __table: string }) {
    return {
      values(values: unknown) {
        insertCalls.push({ table: table.__table, values });
        return {
          then(onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) {
            return Promise.resolve(undefined).then(onF, onR);
          },
        };
      },
    };
  }

  return {
    db: {
      select: () => buildSelect(),
      update: (table: { __table: string }) => buildUpdate(table),
      insert: (table: { __table: string }) => buildInsert(table),
    },
  };
});

// ---------------------------------------------------------------------------
// GitHub mock
// ---------------------------------------------------------------------------
const isRepoNameAvailableMock = vi.fn();
const createRepoFromTemplateMock = vi.fn();
vi.mock('@/lib/github', () => ({
  isRepoNameAvailable: (...args: unknown[]) => isRepoNameAvailableMock(...args),
  createRepoFromTemplate: (...args: unknown[]) => createRepoFromTemplateMock(...args),
}));

// ---------------------------------------------------------------------------
// Vercel mock
// ---------------------------------------------------------------------------
const createProjectMock = vi.fn();
const addDomainMock = vi.fn();
const removeDomainMock = vi.fn();
const getDomainConfigMock = vi.fn();
const createDeploymentMock = vi.fn();
const setEnvVarsMock = vi.fn();
vi.mock('@/lib/vercel', () => ({
  createProject: (...args: unknown[]) => createProjectMock(...args),
  addDomain: (...args: unknown[]) => addDomainMock(...args),
  removeDomain: (...args: unknown[]) => removeDomainMock(...args),
  getDomainConfig: (...args: unknown[]) => getDomainConfigMock(...args),
  createDeployment: (...args: unknown[]) => createDeploymentMock(...args),
  setEnvVars: (...args: unknown[]) => setEnvVarsMock(...args),
}));

// ---------------------------------------------------------------------------
// Cloudflare DNS mock
// ---------------------------------------------------------------------------
const createCnameRecordMock = vi.fn();
const updateCnameRecordMock = vi.fn();
const deleteDnsRecordMock = vi.fn();
const listDnsRecordsMock = vi.fn();
vi.mock('@/lib/cloudflare-dns', () => ({
  createCnameRecord: (...args: unknown[]) => createCnameRecordMock(...args),
  updateCnameRecord: (...args: unknown[]) => updateCnameRecordMock(...args),
  deleteDnsRecord: (...args: unknown[]) => deleteDnsRecordMock(...args),
  listDnsRecords: (...args: unknown[]) => listDnsRecordsMock(...args),
}));

// ---------------------------------------------------------------------------
// Import under test (after all mocks are declared)
// ---------------------------------------------------------------------------
const { provisionWebsite, changeSubdomain } = await import('@/lib/website-provisioner');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** A "fresh" site record — no repo, vercel, or logApiKey yet. */
function freshSiteRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 1,
    githubRepoName: null,
    githubRepoUrl: null,
    vercelProjectId: null,
    vercelProjectUrl: null,
    logApiKey: null,
    ...overrides,
  };
}

/** Sets default happy-path returns for all external mocks. */
function setupHappyPath() {
  // First select returns site state; second returns empty environments list
  selectQueue.push([freshSiteRecord()], []);

  isRepoNameAvailableMock.mockResolvedValue(true);
  createRepoFromTemplateMock.mockResolvedValue({
    fullName: 'SimplerDevelopment/acme',
    htmlUrl: 'https://github.com/SimplerDevelopment/acme',
  });
  createProjectMock.mockResolvedValue({ id: 'vercel-id-1', url: 'https://acme.vercel.app' });
  setEnvVarsMock.mockResolvedValue(undefined);
  addDomainMock.mockResolvedValue(undefined);
  getDomainConfigMock.mockResolvedValue({ cnames: ['acme.vercel-dns.com'] });
  listDnsRecordsMock.mockResolvedValue([]);
  createCnameRecordMock.mockResolvedValue({ id: 'dns-1' });
  createDeploymentMock.mockResolvedValue(undefined);
}

beforeEach(() => {
  vi.useFakeTimers();
  selectQueue = [];
  updateCalls.length = 0;
  insertCalls.length = 0;
  selectCalls.length = 0;

  isRepoNameAvailableMock.mockReset();
  createRepoFromTemplateMock.mockReset();
  createProjectMock.mockReset();
  addDomainMock.mockReset();
  removeDomainMock.mockReset();
  getDomainConfigMock.mockReset();
  createDeploymentMock.mockReset();
  setEnvVarsMock.mockReset();
  createCnameRecordMock.mockReset();
  updateCnameRecordMock.mockReset();
  deleteDnsRecordMock.mockReset();
  listDnsRecordsMock.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

// Helper: advance all fake timers (handles the 2s retry sleep)
async function runAllTimers() {
  await vi.runAllTimersAsync();
}

// ---------------------------------------------------------------------------
// provisionWebsite
// ---------------------------------------------------------------------------

describe('provisionWebsite', () => {
  describe('happy path — full fresh provision', () => {
    it('marks site as provisioning at the start', async () => {
      setupHappyPath();
      const p = provisionWebsite(1, 'acme', 'Acme Corp');
      await runAllTimers();
      await p;
      const firstUpdate = updateCalls[0];
      expect(firstUpdate.patch.deploymentStatus).toBe('provisioning');
      expect(firstUpdate.patch.provisionError).toBeNull();
    });

    it('creates a GitHub repo when githubRepoName is null', async () => {
      setupHappyPath();
      const p = provisionWebsite(1, 'acme', 'Acme Corp');
      await runAllTimers();
      await p;
      expect(isRepoNameAvailableMock).toHaveBeenCalledWith('acme');
      expect(createRepoFromTemplateMock).toHaveBeenCalledWith('acme', 'Acme Corp');
    });

    it('persists the repo name + url to DB', async () => {
      setupHappyPath();
      const p = provisionWebsite(1, 'acme', 'Acme Corp');
      await runAllTimers();
      await p;
      const repoUpdate = updateCalls.find((u) => u.patch.githubRepoName !== undefined);
      expect(repoUpdate).toBeDefined();
      expect(repoUpdate?.patch.githubRepoName).toBe('SimplerDevelopment/acme');
      expect(repoUpdate?.patch.githubRepoUrl).toBe('https://github.com/SimplerDevelopment/acme');
    });

    it('creates a Vercel project when vercelProjectId is null', async () => {
      setupHappyPath();
      const p = provisionWebsite(1, 'acme', 'Acme Corp');
      await runAllTimers();
      await p;
      expect(createProjectMock).toHaveBeenCalledWith('acme', 'SimplerDevelopment/acme');
    });

    it('sets Vercel env vars with SITE_ID and CMS_API_URL', async () => {
      setupHappyPath();
      const p = provisionWebsite(1, 'acme', 'Acme Corp');
      await runAllTimers();
      await p;
      expect(setEnvVarsMock).toHaveBeenCalled();
      const [, envVars] = setEnvVarsMock.mock.calls[0] as [string, Array<{ key: string; value: string }>];
      const keys = envVars.map((e) => e.key);
      expect(keys).toContain('SITE_ID');
      expect(keys).toContain('CMS_API_URL');
      expect(keys).toContain('LOG_API_KEY');
      expect(envVars.find((e) => e.key === 'SITE_ID')?.value).toBe('1');
    });

    it('adds the domain to Vercel', async () => {
      setupHappyPath();
      const p = provisionWebsite(1, 'acme', 'Acme Corp');
      await runAllTimers();
      await p;
      expect(addDomainMock).toHaveBeenCalledWith('vercel-id-1', 'acme.simplerdevelopment.com');
    });

    it('creates a Cloudflare CNAME when no existing record', async () => {
      setupHappyPath();
      const p = provisionWebsite(1, 'acme', 'Acme Corp');
      await runAllTimers();
      await p;
      expect(createCnameRecordMock).toHaveBeenCalledWith('acme', 'acme.vercel-dns.com');
    });

    it('inserts both production and staging environments', async () => {
      setupHappyPath();
      const p = provisionWebsite(1, 'acme', 'Acme Corp');
      await runAllTimers();
      await p;
      const envInsert = insertCalls.find((c) => c.table === 'websiteEnvironments');
      expect(envInsert).toBeDefined();
      const vals = envInsert?.values as Array<{ name: string }>;
      expect(vals.some((v) => v.name === 'production')).toBe(true);
      expect(vals.some((v) => v.name === 'staging')).toBe(true);
    });

    it('marks site as active at the end', async () => {
      setupHappyPath();
      const p = provisionWebsite(1, 'acme', 'Acme Corp');
      await runAllTimers();
      await p;
      const lastUpdate = updateCalls[updateCalls.length - 1];
      expect(lastUpdate.patch.deploymentStatus).toBe('active');
      expect(lastUpdate.patch.vercelDomain).toBe('acme.simplerdevelopment.com');
    });

    it('resolves without a return value', async () => {
      setupHappyPath();
      const p = provisionWebsite(1, 'acme', 'Acme Corp');
      await runAllTimers();
      await expect(p).resolves.toBeUndefined();
    });
  });

  describe('idempotency — already-provisioned fields are skipped', () => {
    it('skips GitHub repo creation when githubRepoName is already set', async () => {
      selectQueue.push([freshSiteRecord({ githubRepoName: 'SimplerDevelopment/acme', githubRepoUrl: 'https://g', vercelProjectId: 'v-id', vercelProjectUrl: 'u', logApiKey: 'key' })], []);
      setEnvVarsMock.mockResolvedValue(undefined);
      addDomainMock.mockResolvedValue(undefined);
      getDomainConfigMock.mockResolvedValue({ cnames: ['acme.vercel-dns.com'] });
      listDnsRecordsMock.mockResolvedValue([]);
      createCnameRecordMock.mockResolvedValue({ id: 'd' });
      createDeploymentMock.mockResolvedValue(undefined);

      const p = provisionWebsite(1, 'acme', 'Acme');
      await runAllTimers();
      await p;

      expect(isRepoNameAvailableMock).not.toHaveBeenCalled();
      expect(createRepoFromTemplateMock).not.toHaveBeenCalled();
    });

    it('skips Vercel project creation when vercelProjectId is already set', async () => {
      selectQueue.push([freshSiteRecord({ githubRepoName: 'SimplerDevelopment/acme', githubRepoUrl: 'u', vercelProjectId: 'existing-v', vercelProjectUrl: 'vu', logApiKey: 'key' })], []);
      setEnvVarsMock.mockResolvedValue(undefined);
      addDomainMock.mockResolvedValue(undefined);
      getDomainConfigMock.mockResolvedValue({ cnames: ['acme.vercel-dns.com'] });
      listDnsRecordsMock.mockResolvedValue([]);
      createCnameRecordMock.mockResolvedValue({ id: 'd' });
      createDeploymentMock.mockResolvedValue(undefined);

      const p = provisionWebsite(1, 'acme', 'Acme');
      await runAllTimers();
      await p;

      expect(createProjectMock).not.toHaveBeenCalled();
    });

    it('skips environment insert when environments already exist', async () => {
      selectQueue.push(
        [freshSiteRecord({ githubRepoName: 'SD/a', githubRepoUrl: 'u', vercelProjectId: 'v', vercelProjectUrl: 'vu', logApiKey: 'k' })],
        [{ id: 10, name: 'production' }], // environments already exist
      );
      setEnvVarsMock.mockResolvedValue(undefined);
      addDomainMock.mockResolvedValue(undefined);
      getDomainConfigMock.mockResolvedValue({ cnames: ['t.vercel-dns.com'] });
      listDnsRecordsMock.mockResolvedValue([]);
      createCnameRecordMock.mockResolvedValue({ id: 'd' });
      createDeploymentMock.mockResolvedValue(undefined);

      const p = provisionWebsite(1, 'acme', 'Acme');
      await runAllTimers();
      await p;

      expect(insertCalls.filter((c) => c.table === 'websiteEnvironments')).toHaveLength(0);
    });
  });

  describe('DNS — existing record handling', () => {
    it('updates existing CNAME when content differs from target', async () => {
      setupHappyPath();
      listDnsRecordsMock.mockResolvedValue([{ id: 'dns-old', content: 'old.vercel-dns.com' }]);
      getDomainConfigMock.mockResolvedValue({ cnames: ['new.vercel-dns.com'] });

      const p = provisionWebsite(1, 'acme', 'Acme');
      await runAllTimers();
      await p;

      expect(updateCnameRecordMock).toHaveBeenCalledWith('dns-old', 'new.vercel-dns.com');
      expect(createCnameRecordMock).not.toHaveBeenCalled();
    });

    it('neither creates nor updates when existing record matches the target', async () => {
      setupHappyPath();
      listDnsRecordsMock.mockResolvedValue([{ id: 'dns-same', content: 'acme.vercel-dns.com' }]);
      getDomainConfigMock.mockResolvedValue({ cnames: ['acme.vercel-dns.com'] });

      const p = provisionWebsite(1, 'acme', 'Acme');
      await runAllTimers();
      await p;

      expect(createCnameRecordMock).not.toHaveBeenCalled();
      expect(updateCnameRecordMock).not.toHaveBeenCalled();
    });
  });

  describe('DNS target retry logic', () => {
    it('falls back to generic cname.vercel-dns.com after 3 attempts returning the generic target', async () => {
      setupHappyPath();
      // Always return the generic target so fallback kicks in
      getDomainConfigMock.mockResolvedValue({ cnames: ['cname.vercel-dns.com'] });

      const p = provisionWebsite(1, 'acme', 'Acme');
      await runAllTimers();
      await p;

      expect(getDomainConfigMock).toHaveBeenCalledTimes(3);
      expect(createCnameRecordMock).toHaveBeenCalledWith('acme', 'cname.vercel-dns.com');
    });

    it('stops retrying when a project-specific CNAME is found on attempt 2', async () => {
      setupHappyPath();
      getDomainConfigMock
        .mockResolvedValueOnce({ cnames: ['cname.vercel-dns.com'] }) // attempt 0: generic
        .mockResolvedValueOnce({ cnames: ['specific.vercel-dns.com'] }); // attempt 1: specific

      const p = provisionWebsite(1, 'acme', 'Acme');
      await runAllTimers();
      await p;

      expect(getDomainConfigMock).toHaveBeenCalledTimes(2);
      expect(createCnameRecordMock).toHaveBeenCalledWith('acme', 'specific.vercel-dns.com');
    });
  });

  describe('repo name conflict — reuse existing repo', () => {
    it('uses the fallback name when repo is unavailable', async () => {
      selectQueue.push([freshSiteRecord()], []);
      isRepoNameAvailableMock.mockResolvedValue(false); // name taken
      createProjectMock.mockResolvedValue({ id: 'v', url: 'u' });
      setEnvVarsMock.mockResolvedValue(undefined);
      addDomainMock.mockResolvedValue(undefined);
      getDomainConfigMock.mockResolvedValue({ cnames: ['t.vercel-dns.com'] });
      listDnsRecordsMock.mockResolvedValue([]);
      createCnameRecordMock.mockResolvedValue({ id: 'd' });
      createDeploymentMock.mockResolvedValue(undefined);

      const p = provisionWebsite(1, 'acme', 'Acme');
      await runAllTimers();
      await p;

      expect(createRepoFromTemplateMock).not.toHaveBeenCalled();
      const repoUpdate = updateCalls.find((u) => u.patch.githubRepoName !== undefined);
      expect(repoUpdate?.patch.githubRepoName).toBe('SimplerDevelopment/acme');
    });
  });

  describe('deployment failure — non-fatal', () => {
    it('resolves successfully even when createDeployment throws', async () => {
      setupHappyPath();
      createDeploymentMock.mockRejectedValue(new Error('deploy failed'));

      const p = provisionWebsite(1, 'acme', 'Acme');
      await runAllTimers();
      await expect(p).resolves.toBeUndefined();
    });
  });

  describe('error handling', () => {
    it('marks site as failed and rethrows when a step throws', async () => {
      selectQueue.push([freshSiteRecord()]);
      isRepoNameAvailableMock.mockRejectedValue(new Error('GitHub API error'));

      // Attach the rejection handler BEFORE advancing timers so the promise
      // rejection is never unhandled.
      const p = provisionWebsite(1, 'acme', 'Acme');
      const assertion = expect(p).rejects.toThrow('GitHub API error');
      await runAllTimers();
      await assertion;

      const failedUpdate = updateCalls.find((u) => u.patch.deploymentStatus === 'failed');
      expect(failedUpdate).toBeDefined();
      expect(failedUpdate?.patch.provisionError).toBe('GitHub API error');
    });

    it('records "Unknown provisioning error" for non-Error throws', async () => {
      selectQueue.push([freshSiteRecord()]);
      isRepoNameAvailableMock.mockRejectedValue('string error');

      const p = provisionWebsite(1, 'acme', 'Acme');
      const assertion = expect(p).rejects.toBe('string error');
      await runAllTimers();
      await assertion;

      const failedUpdate = updateCalls.find((u) => u.patch.deploymentStatus === 'failed');
      expect(failedUpdate?.patch.provisionError).toBe('Unknown provisioning error');
    });

    it('generates a logApiKey when missing and stores it', async () => {
      setupHappyPath();
      const p = provisionWebsite(1, 'acme', 'Acme');
      await runAllTimers();
      await p;

      const logKeyUpdate = updateCalls.find((u) => typeof u.patch.logApiKey === 'string');
      expect(logKeyUpdate).toBeDefined();
      expect((logKeyUpdate?.patch.logApiKey as string).length).toBe(64); // 32 bytes hex
    });
  });

  describe('env variable usage', () => {
    const orig = process.env.CMS_API_URL;
    afterEach(() => {
      if (orig === undefined) delete process.env.CMS_API_URL;
      else process.env.CMS_API_URL = orig;
    });

    it('uses CMS_API_URL env var when set', async () => {
      process.env.CMS_API_URL = 'https://cms.example.com';
      setupHappyPath();
      const p = provisionWebsite(1, 'acme', 'Acme');
      await runAllTimers();
      await p;

      const [, envVars] = setEnvVarsMock.mock.calls[0] as [string, Array<{ key: string; value: string }>];
      expect(envVars.find((e) => e.key === 'CMS_API_URL')?.value).toBe('https://cms.example.com');
    });

    it('defaults CMS_API_URL to simplerdevelopment.com when not set', async () => {
      delete process.env.CMS_API_URL;
      setupHappyPath();
      const p = provisionWebsite(1, 'acme', 'Acme');
      await runAllTimers();
      await p;

      const [, envVars] = setEnvVarsMock.mock.calls[0] as [string, Array<{ key: string; value: string }>];
      expect(envVars.find((e) => e.key === 'CMS_API_URL')?.value).toBe('https://simplerdevelopment.com');
    });
  });
});

// ---------------------------------------------------------------------------
// changeSubdomain
// ---------------------------------------------------------------------------

describe('changeSubdomain', () => {
  beforeEach(() => {
    addDomainMock.mockResolvedValue(undefined);
    getDomainConfigMock.mockResolvedValue({ cnames: ['new.vercel-dns.com'] });
    createCnameRecordMock.mockResolvedValue({ id: 'd' });
    removeDomainMock.mockResolvedValue(undefined);
    listDnsRecordsMock.mockResolvedValue([{ id: 'old-r', content: 'old.vercel-dns.com' }]);
    deleteDnsRecordMock.mockResolvedValue(undefined);
    // For DB update at end
    selectQueue.push([]);
  });

  describe('dedicated Vercel project path (vercelProjectId provided)', () => {
    it('adds new domain to Vercel', async () => {
      await changeSubdomain(1, 'old', 'new', 'v-proj-1');
      expect(addDomainMock).toHaveBeenCalledWith('v-proj-1', 'new.simplerdevelopment.com');
    });

    it('fetches DNS target for the new domain', async () => {
      await changeSubdomain(1, 'old', 'new', 'v-proj-1');
      expect(getDomainConfigMock).toHaveBeenCalledWith('new.simplerdevelopment.com');
    });

    it('creates a CNAME for the new subdomain', async () => {
      await changeSubdomain(1, 'old', 'new', 'v-proj-1');
      expect(createCnameRecordMock).toHaveBeenCalledWith('new', 'new.vercel-dns.com');
    });

    it('removes old domain from Vercel', async () => {
      await changeSubdomain(1, 'old', 'new', 'v-proj-1');
      expect(removeDomainMock).toHaveBeenCalledWith('v-proj-1', 'old.simplerdevelopment.com');
    });

    it('falls back to generic cname target when domainConfig.cnames is empty', async () => {
      getDomainConfigMock.mockResolvedValue({ cnames: [] });
      await changeSubdomain(1, 'old', 'new', 'v-proj-1');
      expect(createCnameRecordMock).toHaveBeenCalledWith('new', 'cname.vercel-dns.com');
    });

    it('does not throw when removeDomain fails (non-fatal)', async () => {
      removeDomainMock.mockRejectedValue(new Error('already removed'));
      await expect(changeSubdomain(1, 'old', 'new', 'v-proj-1')).resolves.toBeUndefined();
    });
  });

  describe('shared hosting path (vercelProjectId is null)', () => {
    const origRailway = process.env.RAILWAY_PUBLIC_DOMAIN;
    afterEach(() => {
      if (origRailway === undefined) delete process.env.RAILWAY_PUBLIC_DOMAIN;
      else process.env.RAILWAY_PUBLIC_DOMAIN = origRailway;
    });

    it('creates a CNAME pointing to RAILWAY_PUBLIC_DOMAIN when set', async () => {
      process.env.RAILWAY_PUBLIC_DOMAIN = 'platform.example.com';
      await changeSubdomain(1, 'old', 'new', null);
      expect(createCnameRecordMock).toHaveBeenCalledWith('new', 'platform.example.com');
    });

    it('falls back to simplerdevelopment.com when RAILWAY_PUBLIC_DOMAIN is not set', async () => {
      delete process.env.RAILWAY_PUBLIC_DOMAIN;
      await changeSubdomain(1, 'old', 'new', null);
      expect(createCnameRecordMock).toHaveBeenCalledWith('new', 'simplerdevelopment.com');
    });

    it('does not call addDomain or removeDomain on Vercel', async () => {
      await changeSubdomain(1, 'old', 'new', null);
      expect(addDomainMock).not.toHaveBeenCalled();
      expect(removeDomainMock).not.toHaveBeenCalled();
    });
  });

  describe('old DNS record cleanup', () => {
    it('deletes existing records for the old subdomain', async () => {
      listDnsRecordsMock.mockResolvedValue([
        { id: 'r1', content: 'old1' },
        { id: 'r2', content: 'old2' },
      ]);
      await changeSubdomain(1, 'old', 'new', 'v-proj-1');
      expect(deleteDnsRecordMock).toHaveBeenCalledTimes(2);
      expect(deleteDnsRecordMock).toHaveBeenCalledWith('r1');
      expect(deleteDnsRecordMock).toHaveBeenCalledWith('r2');
    });

    it('does not throw when listDnsRecords fails (non-fatal)', async () => {
      listDnsRecordsMock.mockRejectedValue(new Error('DNS lookup failed'));
      await expect(changeSubdomain(1, 'old', 'new', 'v-proj-1')).resolves.toBeUndefined();
    });

    it('does not call deleteDnsRecord when no old records exist', async () => {
      listDnsRecordsMock.mockResolvedValue([]);
      await changeSubdomain(1, 'old', 'new', 'v-proj-1');
      expect(deleteDnsRecordMock).not.toHaveBeenCalled();
    });
  });

  describe('DB update', () => {
    it('updates subdomain, vercelDomain, and updatedAt in DB', async () => {
      await changeSubdomain(1, 'old', 'new', 'v-proj-1');
      const update = updateCalls[updateCalls.length - 1];
      expect(update.patch.subdomain).toBe('new');
      expect(update.patch.vercelDomain).toBe('new.simplerdevelopment.com');
      expect(update.patch.updatedAt).toBeInstanceOf(Date);
    });
  });
});
