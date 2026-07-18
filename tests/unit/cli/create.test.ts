import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  resolveTargetDir,
  targetDirState,
  buildCloneArgs,
  DEFAULT_REPO,
} from '../../../packages/cli/src/commands/create.js';

describe('resolveTargetDir', () => {
  it('resolves the dir arg against cwd', () => {
    expect(resolveTargetDir(['create', 'my-app'], '/home/x')).toBe('/home/x/my-app');
  });

  it('throws when no dir is given', () => {
    expect(() => resolveTargetDir(['create'], '/home/x')).toThrow(/Usage/);
  });

  it('throws when the next token is a flag, not a dir', () => {
    expect(() => resolveTargetDir(['create', '--repo'], '/home/x')).toThrow(/Usage/);
  });
});

describe('buildCloneArgs', () => {
  it('shallow-clones by default', () => {
    expect(buildCloneArgs('R', undefined, '/d')).toEqual(['clone', '--depth', '1', 'R', '/d']);
  });

  it('adds --branch when given', () => {
    expect(buildCloneArgs('R', 'dev', '/d')).toEqual(['clone', '--depth', '1', '--branch', 'dev', 'R', '/d']);
  });

  it('exposes the canonical repo as the default', () => {
    expect(DEFAULT_REPO).toContain('SimplerDevelopment/SimplerDevelopment');
  });
});

describe('targetDirState', () => {
  let base: string;
  beforeEach(() => {
    base = mkdtempSync(join(tmpdir(), 'create-test-'));
  });
  afterEach(() => {
    rmSync(base, { recursive: true, force: true });
  });

  it('reports missing for a non-existent path', () => {
    expect(targetDirState(join(base, 'nope'))).toBe('missing');
  });

  it('reports empty for an empty dir (ignoring .DS_Store)', () => {
    const d = join(base, 'empty');
    mkdirSync(d);
    writeFileSync(join(d, '.DS_Store'), '');
    expect(targetDirState(d)).toBe('empty');
  });

  it('reports nonempty when real files exist', () => {
    const d = join(base, 'full');
    mkdirSync(d);
    writeFileSync(join(d, 'README.md'), 'hi');
    expect(targetDirState(d)).toBe('nonempty');
  });
});
