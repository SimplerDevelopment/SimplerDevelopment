// @vitest-environment node
/**
 * Unit tests for lib/agentic-os/executor.ts
 *
 * The module is pure (no DB, no AI deps) so we only need to stub the
 * single system call: execFileSync (used by resolveClaudeBin). Everything
 * else is in-process logic that we drive directly.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---- mock execFileSync before module import ----

const execFileSyncMock = vi.fn();
vi.mock('node:child_process', () => ({
  execFileSync: (...args: unknown[]) => execFileSyncMock(...args),
  // ChildProcess type is only referenced as a type import — no runtime value needed
}));

// ---- module under test (after mocks) ----

import {
  MAX_OUTPUT_BYTES,
  MAX_PROMPT_BYTES,
  TRUNCATED_MARKER,
  children,
  registerChild,
  unregisterChild,
  getChild,
  appendOutput,
  truncatePrompt,
  resolveClaudeBin,
  executorEnabled,
  formatStreamJsonLine,
  makeStreamJsonParser,
  type ChildEntry,
} from '@/lib/agentic-os/executor';

// ---- helpers ----

function makeEntry(overrides: Partial<ChildEntry> = {}): ChildEntry {
  return {
    runId: 1,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    child: {} as any,
    startedAt: Date.now(),
    outputBuf: '',
    outputBytes: 0,
    outputTruncated: false,
    taps: new Set(),
    stderrTail: '',
    ...overrides,
  };
}

// Reset globalThis cache between tests so resolveClaudeBin can be re-tested
function clearBinCache() {
  const g = globalThis as Record<string, unknown>;
  delete g.__agenticOsClaudeBin;
  delete g.__agenticOsClaudeBinResolved;
}

beforeEach(() => {
  children.clear();
  clearBinCache();
  execFileSyncMock.mockReset();
});

afterEach(() => {
  clearBinCache();
});

// ---------------------------------------------------------------------------
// constants
// ---------------------------------------------------------------------------

describe('constants', () => {
  it('MAX_OUTPUT_BYTES is 256 KiB', () => {
    expect(MAX_OUTPUT_BYTES).toBe(256 * 1024);
  });

  it('MAX_PROMPT_BYTES is 32 KiB', () => {
    expect(MAX_PROMPT_BYTES).toBe(32 * 1024);
  });

  it('TRUNCATED_MARKER starts and ends with newline', () => {
    expect(TRUNCATED_MARKER).toMatch(/^\n/);
    expect(TRUNCATED_MARKER).toMatch(/\n$/);
  });
});

// ---------------------------------------------------------------------------
// children registry
// ---------------------------------------------------------------------------

describe('registerChild / unregisterChild / getChild', () => {
  it('registers and retrieves a child entry', () => {
    const entry = makeEntry({ runId: 42 });
    registerChild(entry);
    expect(getChild(42)).toBe(entry);
  });

  it('returns undefined for unknown runId', () => {
    expect(getChild(9999)).toBeUndefined();
  });

  it('unregisters a child entry', () => {
    const entry = makeEntry({ runId: 5 });
    registerChild(entry);
    unregisterChild(5);
    expect(getChild(5)).toBeUndefined();
  });

  it('unregistering a non-existent entry is a no-op', () => {
    expect(() => unregisterChild(404)).not.toThrow();
  });

  it('can register multiple entries independently', () => {
    const a = makeEntry({ runId: 10 });
    const b = makeEntry({ runId: 20 });
    registerChild(a);
    registerChild(b);
    expect(getChild(10)).toBe(a);
    expect(getChild(20)).toBe(b);
    unregisterChild(10);
    expect(getChild(10)).toBeUndefined();
    expect(getChild(20)).toBe(b);
  });
});

// ---------------------------------------------------------------------------
// appendOutput
// ---------------------------------------------------------------------------

describe('appendOutput', () => {
  it('appends a small chunk and updates outputBytes', () => {
    const entry = makeEntry();
    appendOutput(entry, 'hello');
    expect(entry.outputBuf).toBe('hello');
    expect(entry.outputBytes).toBe(5);
    expect(entry.outputTruncated).toBe(false);
  });

  it('calls all registered taps with the emitted chunk', () => {
    const entry = makeEntry();
    const tap1 = vi.fn();
    const tap2 = vi.fn();
    entry.taps.add(tap1);
    entry.taps.add(tap2);
    appendOutput(entry, 'ping');
    expect(tap1).toHaveBeenCalledWith('ping');
    expect(tap2).toHaveBeenCalledWith('ping');
  });

  it('truncates when chunk pushes bytes over MAX_OUTPUT_BYTES', () => {
    const entry = makeEntry({ outputBuf: 'x'.repeat(MAX_OUTPUT_BYTES - 3), outputBytes: MAX_OUTPUT_BYTES - 3 });
    appendOutput(entry, 'abcdef');
    expect(entry.outputTruncated).toBe(true);
    expect(entry.outputBuf).toContain(TRUNCATED_MARKER);
    // Only the first 3 bytes of the chunk should be stored
    expect(entry.outputBytes).toBe(MAX_OUTPUT_BYTES);
  });

  it('after truncation, further chunks still reach taps but do not grow outputBuf', () => {
    const entry = makeEntry({ outputTruncated: true, outputBuf: 'x', outputBytes: MAX_OUTPUT_BYTES });
    const tap = vi.fn();
    entry.taps.add(tap);
    appendOutput(entry, 'more data');
    expect(tap).toHaveBeenCalledWith('more data');
    expect(entry.outputBuf).toBe('x'); // not grown
  });

  it('emits TRUNCATED_MARKER when no room at all', () => {
    const entry = makeEntry({ outputBuf: 'x'.repeat(MAX_OUTPUT_BYTES), outputBytes: MAX_OUTPUT_BYTES });
    const tap = vi.fn();
    entry.taps.add(tap);
    appendOutput(entry, 'overflow');
    expect(entry.outputTruncated).toBe(true);
    expect(tap).toHaveBeenCalledWith(TRUNCATED_MARKER);
  });

  it('accumulates multiple small chunks correctly', () => {
    const entry = makeEntry();
    appendOutput(entry, 'foo');
    appendOutput(entry, 'bar');
    appendOutput(entry, 'baz');
    expect(entry.outputBuf).toBe('foobarbaz');
    expect(entry.outputBytes).toBe(9);
  });
});

// ---------------------------------------------------------------------------
// truncatePrompt
// ---------------------------------------------------------------------------

describe('truncatePrompt', () => {
  it('returns prompt unchanged when under limit', () => {
    const p = 'short prompt';
    expect(truncatePrompt(p)).toBe(p);
  });

  it('returns prompt unchanged when exactly at limit', () => {
    const p = 'x'.repeat(MAX_PROMPT_BYTES);
    expect(truncatePrompt(p)).toBe(p);
  });

  it('truncates and appends TRUNCATED_MARKER when over limit', () => {
    const p = 'y'.repeat(MAX_PROMPT_BYTES + 100);
    const result = truncatePrompt(p);
    expect(result.length).toBe(MAX_PROMPT_BYTES + TRUNCATED_MARKER.length);
    expect(result.endsWith(TRUNCATED_MARKER)).toBe(true);
    expect(result.startsWith('y'.repeat(MAX_PROMPT_BYTES))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// resolveClaudeBin
// ---------------------------------------------------------------------------

describe('resolveClaudeBin', () => {
  it('returns the trimmed bin path when which succeeds', () => {
    execFileSyncMock.mockReturnValue(Buffer.from('/usr/local/bin/claude\n'));
    const bin = resolveClaudeBin();
    expect(bin).toBe('/usr/local/bin/claude');
    expect(execFileSyncMock).toHaveBeenCalledWith('which', ['claude'], expect.any(Object));
  });

  it('returns null when which outputs an empty string', () => {
    execFileSyncMock.mockReturnValue(Buffer.from('   \n'));
    expect(resolveClaudeBin()).toBeNull();
  });

  it('returns null when which throws', () => {
    execFileSyncMock.mockImplementation(() => { throw new Error('not found'); });
    expect(resolveClaudeBin()).toBeNull();
  });

  it('caches the result across multiple calls', () => {
    execFileSyncMock.mockReturnValue(Buffer.from('/usr/bin/claude\n'));
    resolveClaudeBin();
    resolveClaudeBin();
    resolveClaudeBin();
    expect(execFileSyncMock).toHaveBeenCalledTimes(1);
  });

  it('caches null result too', () => {
    execFileSyncMock.mockImplementation(() => { throw new Error('not found'); });
    expect(resolveClaudeBin()).toBeNull();
    expect(resolveClaudeBin()).toBeNull();
    expect(execFileSyncMock).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// executorEnabled
// ---------------------------------------------------------------------------

describe('executorEnabled', () => {
  const origEnv = process.env.AGENTIC_OS_EXECUTOR_ENABLED;

  afterEach(() => {
    if (origEnv === undefined) {
      delete process.env.AGENTIC_OS_EXECUTOR_ENABLED;
    } else {
      process.env.AGENTIC_OS_EXECUTOR_ENABLED = origEnv;
    }
    clearBinCache();
  });

  it('returns false when env var is not set', () => {
    delete process.env.AGENTIC_OS_EXECUTOR_ENABLED;
    execFileSyncMock.mockReturnValue(Buffer.from('/usr/bin/claude\n'));
    expect(executorEnabled()).toBe(false);
  });

  it('returns false when env var is "0"', () => {
    process.env.AGENTIC_OS_EXECUTOR_ENABLED = '0';
    execFileSyncMock.mockReturnValue(Buffer.from('/usr/bin/claude\n'));
    expect(executorEnabled()).toBe(false);
  });

  it('returns false when env var is "1" but claude not found', () => {
    process.env.AGENTIC_OS_EXECUTOR_ENABLED = '1';
    execFileSyncMock.mockImplementation(() => { throw new Error('not found'); });
    expect(executorEnabled()).toBe(false);
  });

  it('returns true when env var is "1" and claude is found', () => {
    process.env.AGENTIC_OS_EXECUTOR_ENABLED = '1';
    execFileSyncMock.mockReturnValue(Buffer.from('/usr/bin/claude\n'));
    expect(executorEnabled()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// formatStreamJsonLine
// ---------------------------------------------------------------------------

describe('formatStreamJsonLine', () => {
  it('returns the raw line plus newline for non-JSON input', () => {
    const result = formatStreamJsonLine('not-json here');
    expect(result).toBe('not-json here\n');
  });

  it('returns null for system event', () => {
    const result = formatStreamJsonLine(JSON.stringify({ type: 'system' }));
    expect(result).toBeNull();
  });

  it('returns null for unknown event type', () => {
    const result = formatStreamJsonLine(JSON.stringify({ type: 'ping' }));
    expect(result).toBeNull();
  });

  it('extracts text from assistant event', () => {
    const evt = {
      type: 'assistant',
      message: {
        content: [
          { type: 'text', text: 'Hello world' },
        ],
      },
    };
    const result = formatStreamJsonLine(JSON.stringify(evt));
    expect(result).toBe('Hello world');
  });

  it('formats tool_use block from assistant event', () => {
    const evt = {
      type: 'assistant',
      message: {
        content: [
          { type: 'tool_use', name: 'read_file', input: { path: '/foo' } },
        ],
      },
    };
    const result = formatStreamJsonLine(JSON.stringify(evt));
    expect(result).toContain('[tool_use: read_file]');
    expect(result).toContain('/foo');
  });

  it('handles tool_use with null name gracefully', () => {
    const evt = {
      type: 'assistant',
      message: {
        content: [{ type: 'tool_use', name: null, input: null }],
      },
    };
    const result = formatStreamJsonLine(JSON.stringify(evt));
    expect(result).toContain('[tool_use: ?]');
  });

  it('returns null for assistant event with empty content', () => {
    const evt = { type: 'assistant', message: { content: [] } };
    expect(formatStreamJsonLine(JSON.stringify(evt))).toBeNull();
  });

  it('extracts text from assistant event with multiple content blocks', () => {
    const evt = {
      type: 'assistant',
      message: {
        content: [
          { type: 'text', text: 'Part A ' },
          { type: 'text', text: 'Part B' },
        ],
      },
    };
    const result = formatStreamJsonLine(JSON.stringify(evt));
    expect(result).toBe('Part A Part B');
  });

  it('formats tool_result from user event', () => {
    const evt = {
      type: 'user',
      message: {
        content: [
          { type: 'tool_result', content: 'file contents here' },
        ],
      },
    };
    const result = formatStreamJsonLine(JSON.stringify(evt));
    expect(result).toContain('[tool_result]');
    expect(result).toContain('file contents here');
  });

  it('stringifies object tool_result content', () => {
    const evt = {
      type: 'user',
      message: {
        content: [
          { type: 'tool_result', content: { ok: true } },
        ],
      },
    };
    const result = formatStreamJsonLine(JSON.stringify(evt));
    expect(result).toContain('[tool_result]');
    expect(result).toContain('ok');
  });

  it('returns null for user event with no tool_result blocks', () => {
    const evt = { type: 'user', message: { content: [{ type: 'text' }] } };
    expect(formatStreamJsonLine(JSON.stringify(evt))).toBeNull();
  });

  it('formats result event with cost and token info', () => {
    const evt = {
      type: 'result',
      total_cost_usd: 0.0025,
      duration_ms: 3500,
      usage: { input_tokens: 100, output_tokens: 50 },
    };
    const result = formatStreamJsonLine(JSON.stringify(evt));
    expect(result).toContain('done');
    expect(result).toContain('$0.0025');
    expect(result).toContain('3.5s');
    expect(result).toContain('100 in / 50 out');
  });

  it('includes cache token counts when non-zero', () => {
    const evt = {
      type: 'result',
      total_cost_usd: 0,
      duration_ms: 1000,
      usage: {
        input_tokens: 10,
        output_tokens: 5,
        cache_read_input_tokens: 20,
        cache_creation_input_tokens: 30,
      },
    };
    const result = formatStreamJsonLine(JSON.stringify(evt));
    expect(result).toContain('20 cache-read');
    expect(result).toContain('30 cache-write');
  });

  it('handles result event with missing usage gracefully', () => {
    const evt = { type: 'result', total_cost_usd: 0.001, duration_ms: 1000 };
    const result = formatStreamJsonLine(JSON.stringify(evt));
    expect(result).toContain('done');
    expect(result).toContain('0 in / 0 out');
  });

  it('clips long tool_use input strings to 1000 chars', () => {
    const longInput = { data: 'a'.repeat(2000) };
    const evt = {
      type: 'assistant',
      message: {
        content: [{ type: 'tool_use', name: 'write', input: longInput }],
      },
    };
    const result = formatStreamJsonLine(JSON.stringify(evt));
    expect(result).toContain('… (truncated)');
  });
});

// ---------------------------------------------------------------------------
// makeStreamJsonParser
// ---------------------------------------------------------------------------

describe('makeStreamJsonParser', () => {
  it('returns empty string for empty input', () => {
    const parse = makeStreamJsonParser();
    expect(parse('')).toBe('');
  });

  it('parses a complete line ending with newline', () => {
    const parse = makeStreamJsonParser();
    const line = JSON.stringify({ type: 'system' }) + '\n';
    // system events return null — no output
    expect(parse(line)).toBe('');
  });

  it('buffers a partial line and flushes it when newline arrives', () => {
    const parse = makeStreamJsonParser();
    const evt = JSON.stringify({
      type: 'assistant',
      message: { content: [{ type: 'text', text: 'Hello' }] },
    });
    // Split the line into two chunks
    const half = Math.floor(evt.length / 2);
    const part1 = parse(evt.slice(0, half));
    expect(part1).toBe(''); // not flushed yet
    const part2 = parse(evt.slice(half) + '\n');
    expect(part2).toBe('Hello');
  });

  it('handles multiple complete lines in one chunk', () => {
    const parse = makeStreamJsonParser();
    const e1 = JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'A' }] } });
    const e2 = JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'B' }] } });
    const result = parse(e1 + '\n' + e2 + '\n');
    expect(result).toBe('AB');
  });

  it('skips empty/whitespace lines', () => {
    const parse = makeStreamJsonParser();
    const result = parse('   \n\n  \n');
    expect(result).toBe('');
  });

  it('passes through non-JSON lines verbatim', () => {
    const parse = makeStreamJsonParser();
    const result = parse('raw stderr output\n');
    expect(result).toBe('raw stderr output\n');
  });

  it('accumulates output across multiple parse calls', () => {
    const parse = makeStreamJsonParser();
    const e1 = JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'Part1 ' }] } });
    const e2 = JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'Part2' }] } });
    parse(e1 + '\n');
    const result = parse(e2 + '\n');
    expect(result).toBe('Part2');
  });

  it('result event includes cost line', () => {
    const parse = makeStreamJsonParser();
    const line = JSON.stringify({ type: 'result', total_cost_usd: 0.001, duration_ms: 2000, usage: {} });
    const result = parse(line + '\n');
    expect(result).toContain('done');
  });
});
