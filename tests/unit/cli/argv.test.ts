import { describe, it, expect } from 'vitest';
import { parseArgv, extractGlobalFlags, decideDestructive } from '../../../packages/cli/src/index.js';

describe('parseArgv', () => {
  it('parses a bare command path with no flags', () => {
    expect(parseArgv(['posts', 'list'])).toEqual({ command: ['posts', 'list'], flags: {} });
  });

  it('parses --flag value pairs', () => {
    expect(parseArgv(['posts', 'list', '--status', 'draft'])).toEqual({
      command: ['posts', 'list'],
      flags: { status: 'draft' },
    });
  });

  it('parses --flag=value syntax', () => {
    expect(parseArgv(['posts', 'list', '--status=draft'])).toEqual({
      command: ['posts', 'list'],
      flags: { status: 'draft' },
    });
  });

  it('mixes --flag=value and --flag value in the same call', () => {
    expect(parseArgv(['posts', 'list', '--status=draft', '--limit', '5'])).toEqual({
      command: ['posts', 'list'],
      flags: { status: 'draft', limit: '5' },
    });
  });

  it('treats a flag followed by another flag (or end of argv) as a bare boolean', () => {
    expect(parseArgv(['posts', 'delete', '--yes'])).toEqual({
      command: ['posts', 'delete'],
      flags: { yes: true },
    });
    expect(parseArgv(['posts', 'delete', '--yes', '--verbose'])).toEqual({
      command: ['posts', 'delete'],
      flags: { yes: true, verbose: true },
    });
  });

  it('stops collecting the command path at the first flag token', () => {
    const result = parseArgv(['call', 'posts_list', '--args', '{}']);
    expect(result.command).toEqual(['call', 'posts_list']);
    expect(result.flags).toEqual({ args: '{}' });
  });

  it('supports an empty argv', () => {
    expect(parseArgv([])).toEqual({ command: [], flags: {} });
  });
});

describe('extractGlobalFlags', () => {
  it('pulls known global flags out and leaves the rest untouched', () => {
    const { global, rest } = extractGlobalFlags({ json: true, status: 'draft', limit: '5' });
    expect(global.json).toBe(true);
    expect(rest).toEqual({ status: 'draft', limit: '5' });
  });

  it('parses --fields into a trimmed array', () => {
    const { global } = extractGlobalFlags({ fields: 'id, title,slug' });
    expect(global.fields).toEqual(['id', 'title', 'slug']);
  });

  it('parses --timeout into a number', () => {
    const { global } = extractGlobalFlags({ timeout: '5000' });
    expect(global.timeout).toBe(5000);
  });

  it('defaults yes/dry-run/verbose/help/password-stdin to false when absent', () => {
    const { global } = extractGlobalFlags({});
    expect(global.yes).toBe(false);
    expect(global.dryRun).toBe(false);
    expect(global.verbose).toBe(false);
    expect(global.help).toBe(false);
    expect(global.passwordStdin).toBe(false);
  });

  it('honors --dry-run and --api-url/--api-key', () => {
    const { global } = extractGlobalFlags({
      'dry-run': true,
      'api-url': 'https://example.com',
      'api-key': 'sd_mcp_secret',
    });
    expect(global.dryRun).toBe(true);
    expect(global.apiUrl).toBe('https://example.com');
    expect(global.apiKey).toBe('sd_mcp_secret');
  });
});

describe('decideDestructive', () => {
  it('proceeds immediately for non-destructive tools', () => {
    expect(decideDestructive(false, false, false)).toBe('proceed');
  });

  it('proceeds when --yes is passed, TTY or not', () => {
    expect(decideDestructive(true, true, false)).toBe('proceed');
    expect(decideDestructive(true, true, true)).toBe('proceed');
  });

  it('requires an interactive prompt on a TTY without --yes', () => {
    expect(decideDestructive(true, false, true)).toBe('need-prompt');
  });

  it('denies outright on a non-TTY without --yes', () => {
    expect(decideDestructive(true, false, false)).toBe('deny');
  });
});
