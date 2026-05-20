/**
 * Agentic OS — headless `claude -p` executor support module.
 *
 * Holds the in-process registry of running child processes plus shared
 * helpers used by the run / stream / cancel API routes.
 *
 * TODO (multi-instance): this Map is in-process and dies on server
 * restart. For multi-host deployments this needs to move to a queue
 * (BullMQ / inngest / a DB-backed claim table). Today it works only on
 * a single host. Re-attach on restart is not supported; runs in flight
 * during a deploy are reaped by the DB row check (status stuck on
 * 'running' -> the stream route will emit `done` with whatever output
 * was last flushed, but exitCode will be null).
 */
import type { ChildProcess } from 'node:child_process';
import { execFileSync } from 'node:child_process';

export const MAX_OUTPUT_BYTES = 256 * 1024;
export const MAX_PROMPT_BYTES = 32 * 1024;
export const TRUNCATED_MARKER = '\n[truncated]\n';

export type ChildEntry = {
  runId: number;
  child: ChildProcess;
  startedAt: number;
  outputBuf: string;
  outputBytes: number;
  outputTruncated: boolean;
  // SSE subscribers — each tap receives every appended chunk (post-truncation).
  taps: Set<(chunk: string) => void>;
  // Last chunk of stderr (used for errorMessage on failure).
  stderrTail: string;
};

// globalThis trick so Next.js dev hot-reloads don't lose live children.
const g = globalThis as unknown as {
  __agenticOsChildren?: Map<number, ChildEntry>;
  __agenticOsClaudeBin?: string | null;
  __agenticOsClaudeBinResolved?: boolean;
};

export const children: Map<number, ChildEntry> =
  g.__agenticOsChildren ?? (g.__agenticOsChildren = new Map<number, ChildEntry>());

export function registerChild(entry: ChildEntry): void {
  children.set(entry.runId, entry);
}

export function unregisterChild(runId: number): void {
  children.delete(runId);
}

export function getChild(runId: number): ChildEntry | undefined {
  return children.get(runId);
}

export function appendOutput(entry: ChildEntry, chunk: string): void {
  let emitted = chunk;
  if (entry.outputTruncated) {
    // Already truncated — subscribers still get the chunk so the live stream
    // is responsive, but we don't grow the stored buffer further.
    for (const tap of entry.taps) tap(emitted);
    return;
  }
  if (entry.outputBytes + chunk.length > MAX_OUTPUT_BYTES) {
    const room = MAX_OUTPUT_BYTES - entry.outputBytes;
    if (room > 0) {
      const head = chunk.slice(0, room);
      entry.outputBuf += head;
      entry.outputBytes += head.length;
      emitted = head + TRUNCATED_MARKER;
    } else {
      emitted = TRUNCATED_MARKER;
    }
    entry.outputBuf += TRUNCATED_MARKER;
    entry.outputTruncated = true;
  } else {
    entry.outputBuf += chunk;
    entry.outputBytes += chunk.length;
  }
  for (const tap of entry.taps) tap(emitted);
}

/**
 * Truncate the prompt text to MAX_PROMPT_BYTES as a defensive measure
 * before passing it to `claude -p`. Most prompts are well under this.
 */
export function truncatePrompt(prompt: string): string {
  if (prompt.length <= MAX_PROMPT_BYTES) return prompt;
  return prompt.slice(0, MAX_PROMPT_BYTES) + TRUNCATED_MARKER;
}

/**
 * Resolve the `claude` CLI absolute path lazily and cache it. Returns
 * `null` if not found on PATH. Cached across hot-reloads via globalThis.
 */
export function resolveClaudeBin(): string | null {
  if (g.__agenticOsClaudeBinResolved) {
    return g.__agenticOsClaudeBin ?? null;
  }
  let bin: string | null = null;
  try {
    bin = execFileSync('which', ['claude'], {
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
    if (!bin) bin = null;
  } catch {
    bin = null;
  }
  g.__agenticOsClaudeBin = bin;
  g.__agenticOsClaudeBinResolved = true;
  return bin;
}

export function executorEnabled(): boolean {
  return (
    process.env.AGENTIC_OS_EXECUTOR_ENABLED === '1' &&
    resolveClaudeBin() !== null
  );
}

// ── stream-json formatter ────────────────────────────────────────────────
//
// `claude -p --output-format stream-json --verbose` emits one JSON object per
// line. Event types we care about: `assistant` (text + tool_use blocks),
// `user` (tool_result blocks), `result` (final cost + usage). We render each
// into terse human-readable text for the SSE stream and the persisted
// `output` column. Non-JSON lines (rare — usually stderr-ish) pass through
// verbatim so we never silently drop bytes.

interface StreamJsonContentBlock {
  type: string;
  text?: string;
  name?: string;
  input?: unknown;
  content?: unknown;
}

interface StreamJsonMessage {
  content?: StreamJsonContentBlock[];
}

interface StreamJsonUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}

interface StreamJsonEvent {
  type?: string;
  subtype?: string;
  message?: StreamJsonMessage;
  total_cost_usd?: number;
  duration_ms?: number;
  usage?: StreamJsonUsage;
  is_error?: boolean;
}

function clip(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n) + '… (truncated)';
}

export function formatStreamJsonLine(line: string): string | null {
  let evt: StreamJsonEvent;
  try {
    evt = JSON.parse(line);
  } catch {
    // Non-JSON line — return it as-is so the user sees raw output.
    return line + '\n';
  }

  // Skip session-init boilerplate.
  if (evt.type === 'system') return null;

  if (evt.type === 'assistant' && evt.message?.content) {
    let out = '';
    for (const block of evt.message.content) {
      if (block.type === 'text' && typeof block.text === 'string') {
        out += block.text;
      } else if (block.type === 'tool_use') {
        const inputStr =
          typeof block.input === 'object'
            ? JSON.stringify(block.input, null, 2)
            : String(block.input ?? '');
        out += `\n[tool_use: ${block.name ?? '?'}]\n${clip(inputStr, 1000)}\n`;
      }
    }
    return out || null;
  }

  if (evt.type === 'user' && evt.message?.content) {
    let out = '';
    for (const block of evt.message.content) {
      if (block.type === 'tool_result') {
        const content =
          typeof block.content === 'string'
            ? block.content
            : JSON.stringify(block.content);
        out += `\n[tool_result] ${clip(content, 500)}\n`;
      }
    }
    return out || null;
  }

  if (evt.type === 'result') {
    const cost = typeof evt.total_cost_usd === 'number' ? evt.total_cost_usd : 0;
    const durationMs = typeof evt.duration_ms === 'number' ? evt.duration_ms : 0;
    const u = evt.usage ?? {};
    const inT = u.input_tokens ?? 0;
    const outT = u.output_tokens ?? 0;
    const cachedR = u.cache_read_input_tokens ?? 0;
    const cachedW = u.cache_creation_input_tokens ?? 0;
    return (
      `\n\n─── done ───\n` +
      `cost:     $${cost.toFixed(4)}\n` +
      `duration: ${(durationMs / 1000).toFixed(1)}s\n` +
      `tokens:   ${inT} in / ${outT} out` +
      (cachedR || cachedW ? ` / ${cachedR} cache-read / ${cachedW} cache-write` : '') +
      `\n`
    );
  }

  return null;
}

/**
 * Build a stateful parser that takes raw stdout chunks (potentially split
 * mid-line) and returns formatted text ready for `appendOutput`. Holds a
 * partial-line buffer between calls.
 */
export function makeStreamJsonParser(): (raw: string) => string {
  let lineBuf = '';
  return (raw: string) => {
    lineBuf += raw;
    const lines = lineBuf.split('\n');
    lineBuf = lines.pop() ?? '';
    let formatted = '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const piece = formatStreamJsonLine(trimmed);
      if (piece) formatted += piece;
    }
    return formatted;
  };
}
