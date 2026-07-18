import { describe, it, expect } from 'vitest';
import { run, renderHelpText } from '../../../packages/cli/src/index.js';

describe('help output modes', () => {
  it('renders a human help menu on a TTY', async () => {
    const result = await run(['--help'], { isTTY: true });
    expect(result.exitCode).toBe(0);
    expect(result.humanText).toContain('Built-in commands:');
    expect(result.humanText).toContain('Usage: simpler <domain> <action>');
  });

  it('keeps the JSON envelope contract when piped (non-TTY)', async () => {
    const result = await run(['--help'], { isTTY: false });
    expect(result.humanText).toBeUndefined();
    expect(result.envelope.success).toBe(true);
  });

  it('bare `simpler` on a TTY shows the same menu', async () => {
    const result = await run([], { isTTY: true });
    expect(result.humanText).toContain('Built-in commands:');
  });
});

describe('renderHelpText shapes', () => {
  it('renders builtin help', () => {
    const text = renderHelpText({ command: 'doctor', usage: 'simpler doctor', desc: 'Check stuff.' });
    expect(text).toContain('simpler doctor — Check stuff.');
  });

  it('renders command help with args and example', () => {
    const text = renderHelpText({
      cmd: 'posts list',
      desc: 'List posts.',
      destructive: false,
      args: [{ name: 'websiteId', type: 'number', required: false }],
      example: 'simpler posts list',
    });
    expect(text).toContain('--website-id');
    expect(text).toContain('Example: simpler posts list');
  });

  it('marks destructive commands in domain help', () => {
    const text = renderHelpText({
      domain: 'posts',
      commands: [{ cmd: 'posts delete', desc: 'Delete.', destructive: true }],
    });
    expect(text).toContain('[destructive]');
  });
});
