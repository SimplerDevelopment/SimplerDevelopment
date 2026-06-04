// @vitest-environment node
/**
 * Unit tests for lib/voice/tools.ts — the curated voice tool registry. We mock
 * global fetch to assert each tool builds the right internal request and shapes
 * results compactly. No real request/session/DB, so this stays unit-layer.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import {
  VOICE_TOOLS,
  getVoiceTool,
  voiceToolsForRealtime,
  type VoiceToolContext,
} from '@/lib/voice/tools';

const CTX: VoiceToolContext = { origin: 'https://acme.test', cookie: 'sd-session=abc' };

let fetchMock: ReturnType<typeof vi.fn>;

function mockJson(payload: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => payload } as unknown as Response;
}

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('voiceToolsForRealtime', () => {
  it('emits one OpenAI function def per tool', () => {
    const defs = voiceToolsForRealtime();
    expect(defs).toHaveLength(VOICE_TOOLS.length);
    for (const d of defs) {
      expect(d.type).toBe('function');
      expect(typeof d.name).toBe('string');
      expect(d.parameters).toBeTypeOf('object');
    }
  });

  it('marks read tools as not requiring confirmation and mutations as requiring it', () => {
    expect(getVoiceTool('search_brain')?.requiresConfirm).toBe(false);
    expect(getVoiceTool('create_contact')?.requiresConfirm).toBe(true);
    expect(getVoiceTool('create_task')?.requiresConfirm).toBe(true);
  });

  it('returns undefined for an unknown tool', () => {
    expect(getVoiceTool('drop_database')).toBeUndefined();
  });
});

describe('search_brain', () => {
  it('builds a GET to the brain search route with encoded query + clamped limit', async () => {
    fetchMock.mockResolvedValue(mockJson({ success: true, data: [{ id: 1 }] }));
    const tool = getVoiceTool('search_brain')!;
    const result = await tool.execute({ query: 'q&a notes', limit: 99 }, CTX);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://acme.test/api/portal/brain/search?q=q%26a%20notes&limit=15'); // clamped to 15
    expect((init as RequestInit).method).toBe('GET');
    expect((init as RequestInit).headers).toMatchObject({ cookie: 'sd-session=abc' });
    expect(result).toEqual([{ id: 1 }]);
  });
});

describe('list_open_deals', () => {
  it('unwraps {deals:[]} and shapes a compact summary', async () => {
    fetchMock.mockResolvedValue(
      mockJson({
        success: true,
        data: { deals: [{ id: 5, title: 'Acme', value: 1000, stage: { name: 'Proposal' } }] },
      }),
    );
    const tool = getVoiceTool('list_open_deals')!;
    const result = await tool.execute({}, CTX);

    expect(fetchMock.mock.calls[0][0]).toContain('/api/portal/crm/deals?status=open&limit=10');
    expect(result).toEqual([{ id: 5, title: 'Acme', value: 1000, stage: 'Proposal' }]);
  });
});

describe('create_contact', () => {
  it('summarizes the pending action for the confirm card', () => {
    const tool = getVoiceTool('create_contact')!;
    const summary = tool.summarize!({ firstName: 'Jane', lastName: 'Doe', email: 'j@x.co' });
    expect(summary).toContain('Jane Doe');
    expect(summary).toContain('j@x.co');
  });

  it('POSTs the contact body and returns id + name', async () => {
    fetchMock.mockResolvedValue(
      mockJson({ success: true, data: { id: 42, firstName: 'Jane', lastName: 'Doe' } }),
    );
    const tool = getVoiceTool('create_contact')!;
    const result = await tool.execute({ firstName: 'Jane', lastName: 'Doe' }, CTX);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://acme.test/api/portal/crm/contacts');
    expect((init as RequestInit).method).toBe('POST');
    expect(JSON.parse((init as RequestInit).body as string)).toMatchObject({
      firstName: 'Jane',
      lastName: 'Doe',
    });
    expect(result).toEqual({ id: 42, name: 'Jane Doe' });
  });
});

describe('error handling', () => {
  it('throws with the route message when the envelope reports failure', async () => {
    fetchMock.mockResolvedValue(mockJson({ success: false, message: 'Nope' }, true, 200));
    const tool = getVoiceTool('search_brain')!;
    await expect(tool.execute({ query: 'x' }, CTX)).rejects.toThrow('Nope');
  });

  it('throws on non-ok HTTP status', async () => {
    fetchMock.mockResolvedValue(mockJson({}, false, 500));
    const tool = getVoiceTool('list_my_tasks')!;
    await expect(tool.execute({}, CTX)).rejects.toThrow();
  });
});
