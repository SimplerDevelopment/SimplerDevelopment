// @vitest-environment node
/**
 * Unit coverage for lib/github.ts — the GitHub App-authenticated wrapper used
 * to provision client website repos. We mock `octokit` and
 * `@octokit/auth-app` so we never hit the real GitHub REST API.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const createUsingTemplate = vi.fn();
const addCollaborator = vi.fn();
const removeCollaborator = vi.fn();
const reposGet = vi.fn();
const OctokitCtor = vi.fn();

vi.mock('octokit', () => ({
  Octokit: class {
    rest = {
      repos: {
        createUsingTemplate: (...args: unknown[]) => createUsingTemplate(...args),
        addCollaborator: (...args: unknown[]) => addCollaborator(...args),
        removeCollaborator: (...args: unknown[]) => removeCollaborator(...args),
        get: (...args: unknown[]) => reposGet(...args),
      },
    };
    constructor(opts: unknown) {
      OctokitCtor(opts);
    }
  },
}));

const createAppAuthMock = vi.fn();
vi.mock('@octokit/auth-app', () => ({
  createAppAuth: (...args: unknown[]) => createAppAuthMock(...args),
}));

// Import AFTER mocks register so the wrapper picks up our fakes.
import {
  createRepoFromTemplate,
  addCollaborator as libAddCollaborator,
  removeCollaborator as libRemoveCollaborator,
  isRepoNameAvailable,
} from '@/lib/github';

const ORIG_ENV = { ...process.env };

// A real-ish PEM-shaped string, then base64-encoded the way the wrapper expects.
const FAKE_PRIVATE_KEY_PEM = '-----BEGIN RSA PRIVATE KEY-----\nabc\n-----END RSA PRIVATE KEY-----';
const FAKE_PRIVATE_KEY_B64 = Buffer.from(FAKE_PRIVATE_KEY_PEM, 'utf-8').toString('base64');

function setGoodEnv() {
  process.env.GITHUB_APP_ID = '123456';
  process.env.GITHUB_APP_PRIVATE_KEY = FAKE_PRIVATE_KEY_B64;
  process.env.GITHUB_APP_INSTALLATION_ID = '987654';
  delete process.env.GITHUB_TEMPLATE_REPO;
}

beforeEach(() => {
  process.env = { ...ORIG_ENV };
  setGoodEnv();
  createUsingTemplate.mockReset();
  addCollaborator.mockReset();
  removeCollaborator.mockReset();
  reposGet.mockReset();
  OctokitCtor.mockReset();
  createAppAuthMock.mockReset();
});

afterEach(() => {
  process.env = { ...ORIG_ENV };
});

describe('createRepoFromTemplate', () => {
  it('creates a private repo from the default starter template and returns repo metadata', async () => {
    createUsingTemplate.mockResolvedValueOnce({
      data: {
        full_name: 'simplerdevelopment/acme-co',
        html_url: 'https://github.com/simplerdevelopment/acme-co',
        clone_url: 'https://github.com/simplerdevelopment/acme-co.git',
      },
    });

    const result = await createRepoFromTemplate('acme-co', 'ACME website');

    expect(result).toEqual({
      fullName: 'simplerdevelopment/acme-co',
      htmlUrl: 'https://github.com/simplerdevelopment/acme-co',
      cloneUrl: 'https://github.com/simplerdevelopment/acme-co.git',
    });
    expect(createUsingTemplate).toHaveBeenCalledTimes(1);
    expect(createUsingTemplate).toHaveBeenCalledWith({
      template_owner: 'simplerdevelopment',
      template_repo: 'website-starter',
      owner: 'simplerdevelopment',
      name: 'acme-co',
      description: 'ACME website',
      private: true,
      include_all_branches: false,
    });
    // Octokit instantiated with GitHub App auth strategy + decoded private key.
    expect(OctokitCtor).toHaveBeenCalledTimes(1);
    const ctorArg = OctokitCtor.mock.calls[0][0] as {
      authStrategy: unknown;
      auth: { appId: string; privateKey: string; installationId: number };
    };
    expect(ctorArg.auth.appId).toBe('123456');
    expect(ctorArg.auth.installationId).toBe(987654);
    expect(ctorArg.auth.privateKey).toBe(FAKE_PRIVATE_KEY_PEM);
  });

  it('honors GITHUB_TEMPLATE_REPO override', async () => {
    process.env.GITHUB_TEMPLATE_REPO = 'someorg/some-starter';
    createUsingTemplate.mockResolvedValueOnce({
      data: {
        full_name: 'simplerdevelopment/x',
        html_url: 'https://github.com/simplerdevelopment/x',
        clone_url: 'https://github.com/simplerdevelopment/x.git',
      },
    });

    await createRepoFromTemplate('x', 'd');

    expect(createUsingTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        template_owner: 'someorg',
        template_repo: 'some-starter',
      }),
    );
  });

  it('throws when GITHUB_APP_ID is missing', async () => {
    delete process.env.GITHUB_APP_ID;
    await expect(createRepoFromTemplate('foo', 'bar')).rejects.toThrow(
      /Missing GitHub App environment variables/,
    );
    expect(createUsingTemplate).not.toHaveBeenCalled();
  });

  it('throws when GITHUB_APP_PRIVATE_KEY is missing', async () => {
    delete process.env.GITHUB_APP_PRIVATE_KEY;
    await expect(createRepoFromTemplate('foo', 'bar')).rejects.toThrow(
      /Missing GitHub App environment variables/,
    );
  });

  it('throws when GITHUB_APP_INSTALLATION_ID is missing (parses to 0)', async () => {
    delete process.env.GITHUB_APP_INSTALLATION_ID;
    await expect(createRepoFromTemplate('foo', 'bar')).rejects.toThrow(
      /Missing GitHub App environment variables/,
    );
  });

  it('surfaces GitHub API failures from createUsingTemplate', async () => {
    createUsingTemplate.mockRejectedValueOnce(
      Object.assign(new Error('Repo name already exists'), { status: 422 }),
    );
    await expect(createRepoFromTemplate('dup', 'd')).rejects.toThrow('Repo name already exists');
  });
});

describe('addCollaborator', () => {
  it('adds a collaborator with default push permission', async () => {
    addCollaborator.mockResolvedValueOnce({ data: {} });

    await libAddCollaborator('simplerdevelopment/acme-co', 'octocat');

    expect(addCollaborator).toHaveBeenCalledTimes(1);
    expect(addCollaborator).toHaveBeenCalledWith({
      owner: 'simplerdevelopment',
      repo: 'acme-co',
      username: 'octocat',
      permission: 'push',
    });
  });

  it('honors explicit permission level', async () => {
    addCollaborator.mockResolvedValueOnce({ data: {} });

    await libAddCollaborator('simplerdevelopment/acme-co', 'octocat', 'admin');

    expect(addCollaborator).toHaveBeenCalledWith(
      expect.objectContaining({ permission: 'admin' }),
    );
  });

  it('throws missing-env when called without GitHub App config', async () => {
    delete process.env.GITHUB_APP_ID;
    await expect(libAddCollaborator('a/b', 'u')).rejects.toThrow(
      /Missing GitHub App environment variables/,
    );
    expect(addCollaborator).not.toHaveBeenCalled();
  });

  it('propagates API errors from addCollaborator', async () => {
    addCollaborator.mockRejectedValueOnce(
      Object.assign(new Error('Not Found'), { status: 404 }),
    );
    await expect(libAddCollaborator('simplerdevelopment/nope', 'octocat')).rejects.toThrow(
      'Not Found',
    );
  });
});

describe('removeCollaborator', () => {
  it('removes a collaborator from the repo', async () => {
    removeCollaborator.mockResolvedValueOnce({ data: {} });

    await libRemoveCollaborator('simplerdevelopment/acme-co', 'octocat');

    expect(removeCollaborator).toHaveBeenCalledTimes(1);
    expect(removeCollaborator).toHaveBeenCalledWith({
      owner: 'simplerdevelopment',
      repo: 'acme-co',
      username: 'octocat',
    });
  });

  it('throws missing-env when called without GitHub App config', async () => {
    delete process.env.GITHUB_APP_PRIVATE_KEY;
    await expect(libRemoveCollaborator('a/b', 'u')).rejects.toThrow(
      /Missing GitHub App environment variables/,
    );
    expect(removeCollaborator).not.toHaveBeenCalled();
  });

  it('propagates API errors from removeCollaborator', async () => {
    removeCollaborator.mockRejectedValueOnce(
      Object.assign(new Error('Forbidden'), { status: 403 }),
    );
    await expect(libRemoveCollaborator('simplerdevelopment/x', 'octocat')).rejects.toThrow(
      'Forbidden',
    );
  });
});

describe('isRepoNameAvailable', () => {
  it('returns false when the repo already exists (200 OK)', async () => {
    reposGet.mockResolvedValueOnce({ data: { name: 'acme-co' } });

    const result = await isRepoNameAvailable('acme-co');

    expect(result).toBe(false);
    expect(reposGet).toHaveBeenCalledWith({
      owner: 'simplerdevelopment',
      repo: 'acme-co',
    });
  });

  it('returns true when the repo does not exist (404)', async () => {
    reposGet.mockRejectedValueOnce({ status: 404, message: 'Not Found' });

    const result = await isRepoNameAvailable('brand-new-name');

    expect(result).toBe(true);
  });

  it('rethrows non-404 errors (e.g. 403 forbidden)', async () => {
    const err = Object.assign(new Error('forbidden'), { status: 403 });
    reposGet.mockRejectedValueOnce(err);

    await expect(isRepoNameAvailable('whatever')).rejects.toBe(err);
  });

  it('rethrows malformed errors with no status property', async () => {
    const err = new Error('network exploded');
    reposGet.mockRejectedValueOnce(err);

    await expect(isRepoNameAvailable('whatever')).rejects.toBe(err);
  });

  it('rethrows non-object thrown values', async () => {
    reposGet.mockRejectedValueOnce('string error');

    await expect(isRepoNameAvailable('whatever')).rejects.toBe('string error');
  });

  it('throws missing-env when called without GitHub App config', async () => {
    delete process.env.GITHUB_APP_INSTALLATION_ID;
    await expect(isRepoNameAvailable('foo')).rejects.toThrow(
      /Missing GitHub App environment variables/,
    );
    expect(reposGet).not.toHaveBeenCalled();
  });
});
