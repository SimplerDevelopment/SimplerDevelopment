// @vitest-environment node
/**
 * Unit tests for the live_voice meeting source adapter (Phase 2). Pure
 * normalization logic — no DB/request — so unit-layer.
 */
import { describe, it, expect } from 'vitest';

import { liveVoiceAdapter } from '@/lib/brain/meeting-sources/live-voice';
import { getMeetingAdapter } from '@/lib/brain/meeting-sources';

const CTX = {
  clientId: 100,
  userId: 7,
  // Adapter normalization doesn't read the profile; a minimal stub is fine.
  profile: {} as never,
};

describe('liveVoiceAdapter', () => {
  it('is registered and discoverable by id', () => {
    expect(getMeetingAdapter('live_voice')).toBe(liveVoiceAdapter);
    expect(liveVoiceAdapter.id).toBe('live_voice');
  });

  it('is always enabled', () => {
    expect(liveVoiceAdapter.enabledFor({} as never)).toBe(true);
  });

  it('normalizes a transcript with a unique live_voice sourceRef', async () => {
    const out = await liveVoiceAdapter.fetch(
      { transcript: '  Speaker: hello\nAssistant: hi  ', title: '  Standup  ', durationSeconds: 42 },
      CTX,
    );
    expect(out.transcript).toBe('Speaker: hello\nAssistant: hi');
    expect(out.title).toBe('Standup');
    expect(out.sourceRef).toMatch(/^live_voice:[0-9a-f-]{36}$/);
    expect(out.sourceMetadata).toMatchObject({ durationSeconds: 42 });
    expect(out.meetingDate).toBeInstanceOf(Date);
  });

  it('generates a distinct sourceRef per call (no accidental dedupe)', async () => {
    const a = await liveVoiceAdapter.fetch({ transcript: 'x' }, CTX);
    const b = await liveVoiceAdapter.fetch({ transcript: 'x' }, CTX);
    expect(a.sourceRef).not.toBe(b.sourceRef);
  });

  it('rejects an empty transcript', async () => {
    await expect(liveVoiceAdapter.fetch({ transcript: '   ' }, CTX)).rejects.toThrow(/required/i);
  });

  it('filters participants without a name', async () => {
    const out = await liveVoiceAdapter.fetch(
      { transcript: 'hi', participants: [{ name: 'Jane', email: 'j@x.co' }, { name: '   ' }] },
      CTX,
    );
    expect(out.participants).toEqual([{ name: 'Jane', email: 'j@x.co' }]);
  });
});
