/**
 * UAG-005 — the agent-loop adapter (used by the inbound-email agent) must run
 * every tool result through sanitizeToolResult before it re-enters the model
 * context, matching the chat routes. Without this, a get_* tool returning
 * portal data with an embedded secret would reach the model unredacted.
 *
 * Unit-layer: `@/lib/db` mocked to dodge the import-time DATABASE_URL throw
 * pulled in transitively via ./models.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/db', () => ({ db: {} }));

import { anthropicToolsToToolSet } from '@/lib/ai/agent-loop';

// Fake fixtures — declared once so the literal lives on a single line.
const FAKE_KEY = 'sk-abcdefghijklmnopqrstuvwx1234'; // pragma: allowlist secret
const FAKE_SSN = '123-45-6789'; // pragma: allowlist secret

const tools = [{ name: 'get_secret', description: '', input_schema: { type: 'object', properties: {} } }];
const opts = { toolCallId: 't', messages: [] } as never;

describe('anthropicToolsToToolSet sanitization (UAG-005)', () => {
  it('redacts secrets in object tool results before they reach the model', async () => {
    const set = anthropicToolsToToolSet(tools, async () => ({ apiKey: FAKE_KEY, note: 'hello world' }));
    const out = (await set.get_secret.execute!({}, opts)) as string;
    expect(typeof out).toBe('string');
    expect(out).not.toContain(FAKE_KEY);
    expect(out).toContain('[REDACTED_API_KEY]');
    expect(out).toContain('hello world'); // non-secret content preserved
  });

  it('sanitizes string results too', async () => {
    const set = anthropicToolsToToolSet(tools, async () => `ssn ${FAKE_SSN} in the note`);
    const out = (await set.get_secret.execute!({}, opts)) as string;
    expect(out).toContain('[REDACTED_SSN]');
    expect(out).not.toContain(FAKE_SSN);
  });
});
