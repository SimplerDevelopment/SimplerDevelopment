// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import { checkGroundedness } from '@/lib/ai/brain-tools/grounder';

const context = JSON.stringify([{ id: 42, title: 'Primary database', body: 'PostgreSQL' }]);
const valid = { confidence: 0.95, grounded: true, sources: ['Primary database', '42'], uncertain: false };

async function grade(input: unknown, summary = context) {
  const create = vi.fn().mockResolvedValue({ content: [{ type: 'tool_use', name: 'grade', input }] });
  const result = await checkGroundedness('Which database?', 'PostgreSQL', summary, { messages: { create } } as unknown as Anthropic);
  return { result, create };
}

describe('Brain groundedness evidence gate', () => {
  it('accepts a complete grade whose citations exist literally in retrieval', async () => {
    expect((await grade(valid)).result).toEqual(valid);
  });

  it.each([null, {}, { confidence: NaN }, { ...valid, confidence: Infinity },
    { ...valid, confidence: 2 }, { ...valid, confidence: -1 }, { ...valid, grounded: 'true' },
    { ...valid, uncertain: undefined }, { ...valid, sources: [42] }])('rejects malformed grade %j', async input => {
    expect((await grade(input)).result).toEqual({ confidence: 0, grounded: false, sources: [], uncertain: true });
  });

  it.each(['', '[]', '{}', 'null', '{invalid', '{"error":"No results"}', '{"success":false,"data":[{"id":42}]}'])
    ('does not call the checker without valid retrieved evidence: %s', async summary => {
      const { result, create } = await grade(valid, summary);
      expect(create).not.toHaveBeenCalled();
      expect(result.uncertain).toBe(true);
    });

  it.each([[], ['Invented decision'], ['42', 'Invented decision']].map(sources => ({ sources })))('rejects unverifiable citations $sources', async ({ sources }) => {
    expect((await grade({ ...valid, sources })).result.grounded).toBe(false);
  });

  it('requires uncertainty for a low-confidence or unsupported answer', async () => {
    const { result } = await grade({ ...valid, confidence: 0.1, uncertain: false });
    expect(result).toMatchObject({ grounded: false, uncertain: true, confidence: 0.1 });
    expect((await grade({ ...valid, grounded: false })).result.uncertain).toBe(true);
  });

  it('accepts separated JSON tool results without treating tool errors as sources', async () => {
    const summary = `${JSON.stringify({ error: 'Primary database' })}\n---\n${JSON.stringify({ id: 42 })}`;
    expect((await grade({ ...valid, sources: ['Primary database'] }, summary)).result.grounded).toBe(false);
    expect((await grade({ ...valid, sources: ['42'] }, summary)).result.grounded).toBe(true);
  });

  it('fails closed for conversational responses and provider errors', async () => {
    for (const create of [vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'Looks correct' }] }), vi.fn().mockRejectedValue(new Error('timeout'))]) {
      const result = await checkGroundedness('Q', 'A', context, { messages: { create } } as unknown as Anthropic);
      expect(result.uncertain).toBe(true);
      expect(result.grounded).toBe(false);
    }
  });
});
