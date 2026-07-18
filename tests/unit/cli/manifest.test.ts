import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import {
  loadManifestFromPath,
  findByCmd,
  findByName,
  domainNames,
  domainCommands,
  coerceArgs,
  toKebab,
  summarizeManifest,
  summarizeDomain,
} from '../../../packages/cli/src/manifest.js';
import { runManifestCommand } from '../../../packages/cli/src/commands/manifest.js';
import { CliError } from '../../../packages/cli/src/client.js';

const FIXTURE_PATH = resolve(__dirname, 'fixtures/manifest.fixture.json');

function loadFixture() {
  return loadManifestFromPath(FIXTURE_PATH);
}

describe('loadManifestFromPath', () => {
  it('loads and parses a well-formed manifest', () => {
    const manifest = loadFixture();
    expect(manifest.toolCount).toBe(4);
    expect(manifest.tools).toHaveLength(4);
  });

  it('throws a manifest_missing CliError (exit 2) when the file does not exist', () => {
    expect(() => loadManifestFromPath(resolve(__dirname, 'fixtures/does-not-exist.json'))).toThrowError(CliError);
    try {
      loadManifestFromPath(resolve(__dirname, 'fixtures/does-not-exist.json'));
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(CliError);
      expect((err as CliError).exitCode).toBe(2);
      expect((err as CliError).code).toBe('manifest_missing');
      expect((err as CliError).message).toContain('cli:manifest');
    }
  });
});

describe('manifest lookup', () => {
  it('finds a tool by domain+action cmd', () => {
    const manifest = loadFixture();
    const tool = findByCmd(manifest, ['posts', 'list']);
    expect(tool?.name).toBe('posts_list');
  });

  it('finds a tool by its raw MCP name', () => {
    const manifest = loadFixture();
    const tool = findByName(manifest, 'bookings_cancel');
    expect(tool?.cmd).toBe('bookings cancel');
  });

  it('returns undefined for unknown lookups', () => {
    const manifest = loadFixture();
    expect(findByCmd(manifest, ['nope', 'nope'])).toBeUndefined();
    expect(findByName(manifest, 'nope_tool')).toBeUndefined();
  });

  it('lists domain names and per-domain commands', () => {
    const manifest = loadFixture();
    expect(domainNames(manifest)).toEqual(['posts', 'bookings']);
    expect(domainCommands(manifest, 'posts').map((t) => t.name)).toEqual(['posts_list', 'posts_create', 'posts_delete']);
  });
});

describe('toKebab', () => {
  it('converts camelCase to kebab-case', () => {
    expect(toKebab('requireCmsApproval')).toBe('require-cms-approval');
  });
  it('converts snake_case to kebab-case', () => {
    expect(toKebab('site_id')).toBe('site-id');
  });
  it('leaves already-kebab names untouched', () => {
    expect(toKebab('status')).toBe('status');
  });
});

describe('coerceArgs', () => {
  const manifest = loadFixture();
  const postsList = findByCmd(manifest, ['posts', 'list'])!;
  const postsCreate = findByCmd(manifest, ['posts', 'create'])!;

  it('coerces string/number/boolean/json flag types', () => {
    const { args, errors } = coerceArgs(postsCreate, {
      flags: { title: 'Hello', content: '{"a":1}', published: true },
    });
    expect(errors).toEqual([]);
    expect(args).toEqual({ title: 'Hello', content: { a: 1 }, published: true });
  });

  it('coerces a number flag', () => {
    const { args, errors } = coerceArgs(postsList, { flags: { limit: '5' } });
    expect(errors).toEqual([]);
    expect(args.limit).toBe(5);
  });

  it('rejects a non-numeric value for a number arg', () => {
    const { errors } = coerceArgs(postsList, { flags: { limit: 'not-a-number' } });
    expect(errors.some((e) => e.includes('--limit'))).toBe(true);
  });

  it('validates enum membership', () => {
    const ok = coerceArgs(postsList, { flags: { status: 'draft' } });
    expect(ok.errors).toEqual([]);
    const bad = coerceArgs(postsList, { flags: { status: 'not-a-status' } });
    expect(bad.errors.some((e) => e.includes('--status'))).toBe(true);
  });

  it('flags missing required args', () => {
    const { errors } = coerceArgs(postsCreate, { flags: { title: 'Hello' } });
    expect(errors.some((e) => e.includes('Missing required flag(s)') && e.includes('--content'))).toBe(true);
  });

  it('flags unknown flags', () => {
    const { errors } = coerceArgs(postsList, { flags: { bogus: 'x' } });
    expect(errors.some((e) => e.includes('Unknown flag(s)') && e.includes('--bogus'))).toBe(true);
  });

  it('merges --file < --args < individual flags, flags winning', () => {
    const { args, errors } = coerceArgs(postsCreate, {
      flags: { title: 'from-flag' },
      filePayload: { title: 'from-file', content: { source: 'file' } },
      argsJson: { title: 'from-args', content: { source: 'args' } },
    });
    expect(errors).toEqual([]);
    expect(args.title).toBe('from-flag');
    expect(args.content).toEqual({ source: 'args' });
  });
});

describe('manifest tiering (against the fixture)', () => {
  const manifest = loadFixture();

  it('no args -> toolCount + domains + builtins', () => {
    const summary = summarizeManifest(manifest);
    expect(summary.toolCount).toBe(4);
    expect(summary.domains).toEqual([
      { name: 'posts', tools: 3 },
      { name: 'bookings', tools: 1 },
    ]);
    expect(summary.builtins.length).toBeGreaterThan(0);
  });

  it('one arg -> that domain\'s commands', () => {
    const commands = summarizeDomain(manifest, 'posts');
    expect(commands).toEqual([
      { cmd: 'posts list', desc: 'List posts for the active site.', destructive: false },
      { cmd: 'posts create', desc: 'Create a new post.', destructive: false },
      { cmd: 'posts delete', desc: 'Permanently delete a post.', destructive: true },
    ]);
  });

  it('runManifestCommand tiers no-args / domain / domain+action', () => {
    expect((runManifestCommand(manifest) as any).toolCount).toBe(4);
    expect((runManifestCommand(manifest, 'bookings') as any).commands).toHaveLength(1);
    expect((runManifestCommand(manifest, 'bookings', 'cancel') as any).name).toBe('bookings_cancel');
  });

  it('runManifestCommand throws a not_found CliError for an unknown domain', () => {
    try {
      runManifestCommand(manifest, 'nope');
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(CliError);
      expect((err as CliError).exitCode).toBe(2);
      expect((err as CliError).code).toBe('not_found');
    }
  });

  it('runManifestCommand throws a not_found CliError for an unknown action', () => {
    expect(() => runManifestCommand(manifest, 'posts', 'nope')).toThrowError(CliError);
  });
});
