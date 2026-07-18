import { describe, it, expect } from 'vitest';
import {
  shouldUseJson,
  projectFields,
  successEnvelope,
  errorEnvelope,
  renderEnvelope,
  resolveError,
} from '../../../packages/cli/src/output.js';
import { CliError } from '../../../packages/cli/src/client.js';

describe('shouldUseJson', () => {
  it('honors an explicit --json flag regardless of TTY', () => {
    expect(shouldUseJson(true, true)).toBe(true);
    expect(shouldUseJson(false, false)).toBe(false);
  });

  it('defaults to JSON when stdout is not a TTY', () => {
    expect(shouldUseJson(undefined, false)).toBe(true);
  });

  it('defaults to human mode when stdout is a TTY', () => {
    expect(shouldUseJson(undefined, true)).toBe(false);
  });
});

describe('projectFields', () => {
  it('returns data unchanged when no fields given', () => {
    const data = { a: 1, b: 2 };
    expect(projectFields(data)).toBe(data);
  });

  it('projects a single object to the requested fields', () => {
    expect(projectFields({ id: 1, title: 'x', body: 'y' }, ['id', 'title'])).toEqual({ id: 1, title: 'x' });
  });

  it('projects each item of an array of objects', () => {
    const data = [
      { id: 1, title: 'a', body: 'x' },
      { id: 2, title: 'b', body: 'y' },
    ];
    expect(projectFields(data, ['id', 'title'])).toEqual([
      { id: 1, title: 'a' },
      { id: 2, title: 'b' },
    ]);
  });

  it('ignores fields that do not exist on the object', () => {
    expect(projectFields({ id: 1 }, ['id', 'missing'])).toEqual({ id: 1 });
  });

  it('passes non-object values through untouched', () => {
    expect(projectFields('a string', ['id'])).toBe('a string');
  });
});

describe('envelope builders', () => {
  it('successEnvelope wraps data and applies field projection', () => {
    expect(successEnvelope({ id: 1, title: 'x' }, ['id'])).toEqual({ success: true, data: { id: 1 } });
  });

  it('errorEnvelope shapes {success:false, error:{message, code}}', () => {
    expect(errorEnvelope('boom', 'usage_error')).toEqual({
      success: false,
      error: { message: 'boom', code: 'usage_error' },
    });
  });
});

describe('renderEnvelope', () => {
  it('renders compact single-line JSON for --json mode', () => {
    const rendered = renderEnvelope({ success: true, data: { a: 1 } }, true);
    expect(rendered).toBe('{"success":true,"data":{"a":1}}');
    expect(rendered.split('\n')).toHaveLength(1);
  });

  it('renders pretty-printed JSON for human mode', () => {
    const rendered = renderEnvelope({ success: true, data: { a: 1 } }, false);
    expect(rendered).toContain('\n');
    expect(JSON.parse(rendered)).toEqual({ success: true, data: { a: 1 } });
  });
});

describe('resolveError', () => {
  it('maps a CliError to its own exit code and code', () => {
    const { envelope, exitCode } = resolveError(new CliError('nope', 4, 'confirmation_required'));
    expect(exitCode).toBe(4);
    expect(envelope).toEqual({ success: false, error: { message: 'nope', code: 'confirmation_required' } });
  });

  it('maps an unknown Error to exit 1 / internal_error', () => {
    const { envelope, exitCode } = resolveError(new Error('unexpected'));
    expect(exitCode).toBe(1);
    expect(envelope).toEqual({ success: false, error: { message: 'unexpected', code: 'internal_error' } });
  });

  it('maps a non-Error throw to a stringified message', () => {
    const { envelope, exitCode } = resolveError('raw string throw');
    expect(exitCode).toBe(1);
    expect(envelope.success).toBe(false);
  });
});
