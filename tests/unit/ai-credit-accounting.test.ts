// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';

const { reserve, settle, audit } = vi.hoisted(() => ({ reserve: vi.fn(), settle: vi.fn(), audit: vi.fn() }));
vi.mock('@/lib/ai-credits', () => ({ reserveCredits: reserve, settleCredits: settle }));
vi.mock('@/lib/ai/audit', () => ({ recordAiUsage: audit }));
import { AiCreditError, creditTrackedAnthropic, creditTrackedCompletion, creditTrackedStream } from '@/lib/ai/credit-accounting';

const context = { clientId: 1, category: 'ai', source: 'platform' as const };
const params = { model: 'test', max_tokens: 20, messages: [{ role: 'user' as const, content: 'Hi' }] };
function sdk() {
  return {
    messages: {
      countTokens: vi.fn().mockResolvedValue({ input_tokens: 10 }),
      create: vi.fn().mockResolvedValue({ usage: { input_tokens: 10, output_tokens: 3 } }),
      stream: vi.fn(),
    },
  };
}

beforeEach(() => {
  reserve.mockReset().mockResolvedValue({ success: true, newBalance: 1000 });
  settle.mockReset().mockResolvedValue({ success: true, newBalance: 2000 });
  audit.mockReset().mockResolvedValue(undefined);
});

describe('AI request accounting', () => {
  it('reserves before provider inference and settles actual usage before returning', async () => {
    const raw = sdk();
    raw.messages.create.mockImplementationOnce(async () => {
      expect(reserve).toHaveBeenCalledOnce();
      expect(settle).not.toHaveBeenCalled();
      return { usage: { input_tokens: 10, output_tokens: 3 } };
    });
    await creditTrackedAnthropic(raw as unknown as Anthropic, context).messages.create(params);
    expect(reserve).toHaveBeenCalledWith(1, 1056, 'ai', expect.stringMatching(/^request:/));
    expect(settle).toHaveBeenCalledWith(1, 13, 'ai', reserve.mock.calls[0][3]);
    expect(audit).toHaveBeenCalledWith({ clientId: 1, source: 'platform', tokens: 13 });
  });

  it('blocks inference if another request consumed the available balance', async () => {
    reserve.mockResolvedValueOnce({ success: false, newBalance: 5, error: 'Insufficient credits' });
    const raw = sdk();
    await expect(creditTrackedAnthropic(raw as unknown as Anthropic, context).messages.create(params)).rejects.toBeInstanceOf(AiCreditError);
    expect(raw.messages.create).not.toHaveBeenCalled();
  });

  it('uses independent charge identities for consecutive turns', async () => {
    const tracked = creditTrackedAnthropic(sdk() as unknown as Anthropic, context);
    await tracked.messages.create(params);
    await tracked.messages.create(params);
    expect(reserve.mock.calls[0][3]).not.toBe(reserve.mock.calls[1][3]);
  });

  it('includes cached tokens in the actual charge', async () => {
    const raw = sdk();
    raw.messages.create.mockResolvedValueOnce({ usage: { input_tokens: 10, output_tokens: 3, cache_creation_input_tokens: 5, cache_read_input_tokens: 7 } });
    await creditTrackedAnthropic(raw as unknown as Anthropic, context).messages.create(params);
    expect(settle.mock.calls[0][1]).toBe(25);
  });

  it('releases definitely rejected requests, retaining transport-error holds', async () => {
    for (const status of [400, 429, 408, 500, undefined]) {
      settle.mockClear();
      const raw = sdk();
      raw.messages.create.mockRejectedValueOnce(Object.assign(new Error('Provider error'), { status }));
      await expect(creditTrackedAnthropic(raw as unknown as Anthropic, context).messages.create(params)).rejects.toThrow();
      if (status === 400 || status === 429) expect(settle.mock.calls[0][1]).toBe(0);
      else expect(settle).not.toHaveBeenCalled();
    }
  });

  it('surfaces settlement failures and still records consumed usage', async () => {
    settle.mockResolvedValueOnce({ success: false, newBalance: 0, error: 'Reconciliation failed' });
    await expect(creditTrackedAnthropic(sdk() as unknown as Anthropic, context).messages.create(params)).rejects.toThrow('Reconciliation failed');
    expect(audit).toHaveBeenCalledOnce();
  });

  it('keeps BYOK requests independent of platform credit balances', async () => {
    const raw = sdk();
    await creditTrackedAnthropic(raw as unknown as Anthropic, { ...context, source: 'byok' }).messages.create(params);
    expect(raw.messages.countTokens).not.toHaveBeenCalled();
    expect(reserve).not.toHaveBeenCalled();
    expect(settle).not.toHaveBeenCalled();
    expect(audit).toHaveBeenCalledOnce();
  });

  it('does not free consumption when the provider returned unmetered output', async () => {
    await expect(creditTrackedCompletion(context, 'input', 20, async () => ({ usage: {} }))).rejects.toThrow('pending reconciliation');
    expect(settle).not.toHaveBeenCalled();
  });

  it.each([true, false])('settles only a completed stream; complete=%s', async complete => {
    const raw = sdk();
    const abort = vi.fn();
    raw.messages.stream.mockReturnValue({
      abort,
      async *[Symbol.asyncIterator]() {
        yield { type: 'message_start', message: { usage: { input_tokens: 10, output_tokens: 0 } } };
        yield { type: 'message_delta', usage: { output_tokens: 3 } };
        if (complete) yield { type: 'message_stop' };
      },
    });
    const stream = await creditTrackedStream(raw as unknown as Anthropic, params, context);
    for await (const _event of stream) { /* consume */ }
    if (complete) {
      expect(settle.mock.calls[0][1]).toBe(13);
      expect(abort).not.toHaveBeenCalled();
    } else {
      expect(settle).not.toHaveBeenCalled();
      expect(abort).toHaveBeenCalledOnce();
    }
  });
});
