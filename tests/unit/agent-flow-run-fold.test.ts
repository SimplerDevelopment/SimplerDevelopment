/**
 * foldRunEvents — the client-side derivation of per-node state.
 *
 * This is load-bearing precisely because there is NO per-node state table: the
 * event log IS the state, and both the executions list and the canvas overlay
 * fold it with this one function. A bug here shows up as a run that renders
 * wrong rather than as an error, so it gets real tests.
 */
import { describe, it, expect } from 'vitest';
import { foldRunEvents, type AgentFlowRunEvent } from '@/lib/agent-flows/types';

let seq = 0;
function ev(partial: Partial<AgentFlowRunEvent>): AgentFlowRunEvent {
  return {
    id: ++seq,
    runId: 1,
    type: 'node.status',
    nodeId: null,
    status: null,
    summary: null,
    model: null,
    inputTokens: null,
    outputTokens: null,
    durationMs: null,
    createdAt: new Date().toISOString(),
    ...partial,
  };
}

describe('foldRunEvents @agent-flows', () => {
  it('is empty for no events', () => {
    expect(foldRunEvents([])).toEqual({});
  });

  it('later events win, so a node that started then finished reads as finished', () => {
    const folded = foldRunEvents([
      ev({ nodeId: 'a', status: 'started' }),
      ev({ nodeId: 'a', status: 'finished', summary: 'done' }),
    ]);
    expect(folded.a.status).toBe('finished');
    expect(folded.a.summary).toBe('done');
  });

  it('keeps nodes independent', () => {
    const folded = foldRunEvents([
      ev({ nodeId: 'a', status: 'finished' }),
      ev({ nodeId: 'b', status: 'started' }),
      ev({ nodeId: 'c', status: 'skipped' }),
    ]);
    expect(folded.a.status).toBe('finished');
    expect(folded.b.status).toBe('started');
    expect(folded.c.status).toBe('skipped');
  });

  it('carries the execution facts through, so the canvas can show cost per step', () => {
    const folded = foldRunEvents([
      ev({ nodeId: 'a', status: 'finished', model: 'opus', inputTokens: 4200, outputTokens: 900, durationMs: 8300 }),
    ]);
    expect(folded.a).toMatchObject({ model: 'opus', inputTokens: 4200, outputTokens: 900, durationMs: 8300 });
  });

  it('ignores run-scoped events — they are not node state', () => {
    const folded = foldRunEvents([
      ev({ type: 'run.started' }),
      ev({ type: 'note', summary: 'picked the ledger branch' }),
      ev({ type: 'run.finished', status: 'succeeded' }),
    ]);
    expect(folded).toEqual({});
  });

  it('ignores run.waiting even though it carries a nodeId', () => {
    // run.waiting names the node being waited ON, but the node itself has not
    // changed state — folding it would show a human node as though it ran.
    const folded = foldRunEvents([
      ev({ nodeId: 'h', status: 'started' }),
      ev({ type: 'run.waiting', nodeId: 'h', summary: 'Waiting on Dan' }),
    ]);
    expect(folded.h.status).toBe('started');
  });

  it('a failed node stays failed even if a later run-scoped event arrives', () => {
    const folded = foldRunEvents([
      ev({ nodeId: 'a', status: 'failed', summary: 'boom' }),
      ev({ type: 'run.finished', status: 'failed' }),
    ]);
    expect(folded.a.status).toBe('failed');
    expect(folded.a.summary).toBe('boom');
  });

  it('a re-run node (rework loop) reflects its latest execution', () => {
    // Rework loops are legal — a node can run more than once in a single run.
    const folded = foldRunEvents([
      ev({ nodeId: 'be', status: 'finished', durationMs: 100 }),
      ev({ nodeId: 'be', status: 'started' }),
      ev({ nodeId: 'be', status: 'finished', durationMs: 250 }),
    ]);
    expect(folded.be.status).toBe('finished');
    expect(folded.be.durationMs).toBe(250);
  });

  it('drops absent optional fields rather than emitting undefined keys', () => {
    const folded = foldRunEvents([ev({ nodeId: 'a', status: 'started' })]);
    expect(Object.keys(folded.a)).toEqual(['status']);
  });
});
