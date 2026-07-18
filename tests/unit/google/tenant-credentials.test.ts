import { describe, it, expect, vi, beforeEach } from 'vitest';
import { randomBytes } from 'node:crypto';

// db is mocked. select/from/where/limit form a chain that ultimately returns
// the rows array supplied by the test via mockRows.
let mockRows: unknown[] = [];
const mockLimit = vi.fn(() => Promise.resolve(mockRows));
const mockWhere = vi.fn(() => ({ limit: mockLimit }));
const mockFrom = vi.fn(() => ({ where: mockWhere }));
const mockSelect = vi.fn(() => ({ from: mockFrom }));

vi.mock('@/lib/db', () => ({
  db: {
    select: mockSelect,
  },
}));

vi.mock('@/lib/db/schema', () => ({
  googleWorkspaceTenantCredentials: {
    clientId: { name: 'client_id' },
    pubsubVerificationToken: { name: 'pubsub_verification_token' },
  },
}));

const TEST_KEY = randomBytes(32).toString('hex');
process.env.WORKSPACE_TENANT_SECRETS_KEY = TEST_KEY;

const { encryptSecret } = await import('@/lib/crypto/secrets');
const {
  getTenantWorkspaceCredentialsByClientId,
  getTenantWorkspaceCredentialsByPubsubToken,
} = await import('@/lib/google/tenant-credentials');

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    clientId: 42,
    googleProjectId: 'tenant-proj-462913',
    oauthClientId: '123-abc.apps.googleusercontent.com',
    oauthClientSecretEncrypted: encryptSecret('GOCSPX-tenant-secret'),
    oauthRedirectUri: 'https://tenant.simplerdevelopment.com/api/portal/integrations/google/callback',
    pubsubTopic: 'projects/tenant-proj-462913/topics/gmail-watch',
    pubsubVerificationToken: 'plaintext-token-32-bytes-of-hex',
    consentScreenUserType: 'internal' as const,
    status: 'active' as const,
    configuredByUserId: 7,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

beforeEach(() => {
  mockRows = [];
  mockSelect.mockClear();
  mockFrom.mockClear();
  mockWhere.mockClear();
  mockLimit.mockClear();
});

describe('getTenantWorkspaceCredentialsByClientId', () => {
  it('returns null when client has no row (standard tier)', async () => {
    mockRows = [];
    const result = await getTenantWorkspaceCredentialsByClientId(42);
    expect(result).toBeNull();
  });

  it('returns decrypted credentials for an active tenant', async () => {
    mockRows = [makeRow()];
    const result = await getTenantWorkspaceCredentialsByClientId(42);
    expect(result).not.toBeNull();
    expect(result?.clientId).toBe(42);
    expect(result?.oauth.clientId).toBe('123-abc.apps.googleusercontent.com');
    expect(result?.oauth.clientSecret).toBe('GOCSPX-tenant-secret');
    expect(result?.oauth.redirectUri).toBe(
      'https://tenant.simplerdevelopment.com/api/portal/integrations/google/callback'
    );
    expect(result?.pubsubVerificationToken).toBe('plaintext-token-32-bytes-of-hex');
    expect(result?.status).toBe('active');
  });

  it('returns credentials for a tenant in configured (pre-smoke-test) state', async () => {
    mockRows = [makeRow({ status: 'configured' })];
    const result = await getTenantWorkspaceCredentialsByClientId(42);
    expect(result?.status).toBe('configured');
  });

  it('throws on revoked tenant rather than returning stale credentials', async () => {
    mockRows = [makeRow({ status: 'revoked' })];
    await expect(getTenantWorkspaceCredentialsByClientId(42)).rejects.toThrow(/revoked/);
  });

  it('throws when ciphertext is corrupt', async () => {
    mockRows = [makeRow({ oauthClientSecretEncrypted: 'not-valid-base64-or-too-short' })];
    await expect(getTenantWorkspaceCredentialsByClientId(42)).rejects.toThrow();
  });
});

describe('getTenantWorkspaceCredentialsByPubsubToken', () => {
  it('returns null when no tenant matches the token', async () => {
    mockRows = [];
    const result = await getTenantWorkspaceCredentialsByPubsubToken('unknown-token');
    expect(result).toBeNull();
  });

  it('returns decrypted credentials for an active tenant', async () => {
    mockRows = [makeRow()];
    const result = await getTenantWorkspaceCredentialsByPubsubToken('plaintext-token-32-bytes-of-hex');
    expect(result).not.toBeNull();
    expect(result?.clientId).toBe(42);
    expect(result?.oauth.clientSecret).toBe('GOCSPX-tenant-secret');
  });

  it('returns null (not throw) for a revoked tenant — webhook should drop silently', async () => {
    mockRows = [makeRow({ status: 'revoked' })];
    const result = await getTenantWorkspaceCredentialsByPubsubToken('plaintext-token-32-bytes-of-hex');
    expect(result).toBeNull();
  });
});
