/**
 * The final flush is the write that saves everything done in the last 2s
 * before the room emptied — the window QAD-053's data-loss report lives in.
 *
 * `DocRoom.destroy()` used to swallow its failure with an empty catch and the
 * comment "Already logged in flush." That was false: `SnapshotPersistence.flush`
 * lets DB errors propagate, and the only logging is in the DEBOUNCED wrapper's
 * `.catch`. So on the last-client-disconnect path — the one that matters — a
 * failed flush produced no log anywhere. The deck silently reverted to its last
 * good state and the server said nothing, which is what makes this class of
 * data loss undiagnosable after the fact.
 *
 * These tests pin that the failure is now observable. They deliberately do NOT
 * assert the race itself is fixed — it isn't; see QAD-053.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { DocRoom } from '../../packages/realtime-server/src/handlers';
import type { SnapshotPersistence } from '../../packages/realtime-server/src/persistence';

function persistenceWhereFlush(behaviour: 'rejects' | 'resolves') {
  const cancelFlush = vi.fn();
  const flush = vi.fn(() =>
    behaviour === 'rejects'
      ? Promise.reject(new Error('connection terminated unexpectedly'))
      : Promise.resolve(),
  );
  return {
    stub: { scheduleFlush() {}, flush, cancelFlush } as unknown as SnapshotPersistence,
    flush,
    cancelFlush,
  };
}

afterEach(() => vi.restoreAllMocks());

describe('DocRoom.destroy — a failed final flush must be loud', () => {
  it('logs when the final flush rejects', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { stub } = persistenceWhereFlush('rejects');

    await new DocRoom('deck:42', stub).destroy();

    expect(spy).toHaveBeenCalledOnce();
    const msg = String(spy.mock.calls[0][0]);
    // The docKey has to be in there — a log that doesn't say WHICH deck lost
    // work is nearly as useless as no log at all.
    expect(msg).toContain('deck:42');
    expect(msg).toContain('FINAL flush failed');
  });

  it('passes the underlying error through, not just a message', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { stub } = persistenceWhereFlush('rejects');

    await new DocRoom('deck:42', stub).destroy();

    expect(spy.mock.calls[0][1]).toBeInstanceOf(Error);
  });

  it('still completes teardown when the flush fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { stub, cancelFlush } = persistenceWhereFlush('rejects');

    // A throwing flush must not abort destroy() and strand the timer or the
    // doc's update listeners — that would leak a room per failed shutdown.
    await expect(new DocRoom('deck:42', stub).destroy()).resolves.toBeUndefined();
    expect(cancelFlush).toHaveBeenCalledWith('deck:42');
  });

  it('says nothing on the happy path', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { stub, flush } = persistenceWhereFlush('resolves');

    await new DocRoom('deck:42', stub).destroy();

    expect(flush).toHaveBeenCalledOnce();
    expect(spy).not.toHaveBeenCalled();
  });

  it('is idempotent — a second destroy neither re-flushes nor re-logs', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { stub, flush } = persistenceWhereFlush('rejects');
    const room = new DocRoom('deck:42', stub);

    await room.destroy();
    await room.destroy();

    expect(flush).toHaveBeenCalledOnce();
    expect(spy).toHaveBeenCalledOnce();
  });
});
