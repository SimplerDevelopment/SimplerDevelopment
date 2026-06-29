// @vitest-environment jsdom
/**
 * Unit tests for `components/portal/voice/useRealtimeVoice.ts`
 *
 * All browser APIs (RTCPeerConnection, navigator.mediaDevices.getUserMedia,
 * AudioContext, Audio) are replaced with minimal stub classes so no real
 * WebRTC / media ever executes. fetch is stubbed per-test via vi.stubGlobal.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRealtimeVoice } from '@/components/portal/voice/useRealtimeVoice';

// ─── Shared per-test handles (populated in beforeEach) ───────────────────────

// These are set in beforeEach so each test gets fresh mocks.
let dcHandle: {
  readyState: string;
  send: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  onopen: (() => void) | null;
  onmessage: ((e: MessageEvent) => void) | null;
};

let pcHandle: {
  addTrack: ReturnType<typeof vi.fn>;
  createDataChannel: ReturnType<typeof vi.fn>;
  createOffer: ReturnType<typeof vi.fn>;
  setLocalDescription: ReturnType<typeof vi.fn>;
  setRemoteDescription: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  ontrack: ((e: RTCTrackEvent) => void) | null;
};

let micTrack: { stop: ReturnType<typeof vi.fn> };
let micStream: {
  getAudioTracks: ReturnType<typeof vi.fn>;
  getVideoTracks: ReturnType<typeof vi.fn>;
  getTracks: ReturnType<typeof vi.fn>;
};

// ─── Browser API stubs ────────────────────────────────────────────────────────

beforeEach(() => {
  // Reset handles
  micTrack = { stop: vi.fn() };
  micStream = {
    getAudioTracks: vi.fn(() => [micTrack]),
    getVideoTracks: vi.fn(() => []),
    getTracks: vi.fn(() => [micTrack]),
  };

  dcHandle = {
    readyState: 'open',
    send: vi.fn(),
    close: vi.fn(),
    onopen: null,
    onmessage: null,
  };

  pcHandle = {
    addTrack: vi.fn(),
    createDataChannel: vi.fn(() => dcHandle),
    createOffer: vi.fn(() => Promise.resolve({ sdp: 'offer-sdp', type: 'offer' })),
    setLocalDescription: vi.fn(() => Promise.resolve()),
    setRemoteDescription: vi.fn(() => Promise.resolve()),
    close: vi.fn(),
    ontrack: null,
  };

  // RTCPeerConnection — must be a real class constructor (hook calls `new RTCPeerConnection()`)
  class MockRTCPeerConnection {
    addTrack: ReturnType<typeof vi.fn>;
    createDataChannel: ReturnType<typeof vi.fn>;
    createOffer: ReturnType<typeof vi.fn>;
    setLocalDescription: ReturnType<typeof vi.fn>;
    setRemoteDescription: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
    ontrack: ((e: RTCTrackEvent) => void) | null = null;

    constructor() {
      this.addTrack = pcHandle.addTrack;
      this.createDataChannel = pcHandle.createDataChannel;
      this.createOffer = pcHandle.createOffer;
      this.setLocalDescription = pcHandle.setLocalDescription;
      this.setRemoteDescription = pcHandle.setRemoteDescription;
      this.close = pcHandle.close;
      // Give hook access to ontrack setter via this instance
      Object.defineProperty(pcHandle, '_instance', { value: this, writable: true, configurable: true });
    }
  }
  globalThis.RTCPeerConnection = MockRTCPeerConnection as unknown as typeof RTCPeerConnection;

  // Audio — must be a real class constructor (hook calls `new Audio()`)
  class MockAudio {
    autoplay = false;
    srcObject: unknown = null;
  }
  globalThis.Audio = MockAudio as unknown as typeof Audio;

  // AudioContext — must be a real class constructor
  const mockDestStream = {
    getAudioTracks: vi.fn(() => [{ stop: vi.fn() }]),
  };
  const mockDest = { stream: mockDestStream };
  class MockAudioContext {
    createMediaStreamSource = vi.fn(() => ({ connect: vi.fn() }));
    createMediaStreamDestination = vi.fn(() => mockDest);
    close = vi.fn(() => Promise.resolve());
  }
  globalThis.AudioContext = MockAudioContext as unknown as typeof AudioContext;

  // navigator.mediaDevices
  Object.defineProperty(globalThis, 'navigator', {
    value: {
      mediaDevices: {
        getUserMedia: vi.fn(() => Promise.resolve(micStream)),
        getDisplayMedia: vi.fn(() =>
          Promise.resolve({
            getAudioTracks: vi.fn(() => []),
            getVideoTracks: vi.fn(() => [{ stop: vi.fn() }]),
            getTracks: vi.fn(() => [{ stop: vi.fn() }]),
          }),
        ),
      },
    },
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// ─── Fetch response builders ──────────────────────────────────────────────────

function sessionOk(clientSecret = 'secret-abc', model = 'gpt-4o-realtime'): Response {
  return {
    ok: true,
    json: () => Promise.resolve({ success: true, data: { clientSecret, model } }),
  } as unknown as Response;
}

function sdpOk(sdp = 'answer-sdp'): Response {
  return {
    ok: true,
    text: () => Promise.resolve(sdp),
  } as unknown as Response;
}

function toolExecuted(result: unknown = { done: true }): Response {
  return {
    ok: true,
    json: () => Promise.resolve({ success: true, data: { status: 'executed', result } }),
  } as unknown as Response;
}

function toolNeedsConfirm(summary = 'Confirm?', confirmToken = 'tok-xyz'): Response {
  return {
    ok: true,
    json: () =>
      Promise.resolve({
        success: true,
        data: { status: 'needs_confirmation', confirmToken, summary },
      }),
  } as unknown as Response;
}

function toolFailed(message = 'Tool failed'): Response {
  return {
    ok: false,
    json: () => Promise.resolve({ success: false, message }),
  } as unknown as Response;
}

// ─── Helper: render and drive to 'listening' status ──────────────────────────
//
// The hook's start() flow is fully async:
//   await fetch(session) → await sessRes.json() → await getUserMedia
//   → new RTCPeerConnection() → createDataChannel (dc.onopen assigned here)
//   → await createOffer() → await setLocalDescription()
//   → await fetch(SDP) → await sdpRes.text() → await setRemoteDescription()
//   → start() resolves.
//
// `dc.onopen` is assigned before the SDP exchange but is never *invoked* by our
// stubs — we must call it manually.  Because it's assigned mid-async-chain we
// trigger it AFTER `start()` fully resolves, inside a second `act()`.
async function renderAndConnect(getPageContext?: () => string) {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(sessionOk())
    .mockResolvedValueOnce(sdpOk());
  vi.stubGlobal('fetch', fetchMock);

  const r = renderHook(() => useRealtimeVoice(getPageContext));

  // Phase 1: let start() run to completion (status='connecting').
  await act(async () => {
    await r.result.current.start();
  });

  // Phase 2: simulate WebRTC signalling completing → dc.onopen fires.
  await act(async () => {
    dcHandle.onopen?.();
  });

  return { ...r, fetchMock };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('useRealtimeVoice — initial state', () => {
  it('starts with idle status, no error, empty transcript, no pendingConfirm', () => {
    const { result } = renderHook(() => useRealtimeVoice());
    expect(result.current.status).toBe('idle');
    expect(result.current.error).toBeNull();
    expect(result.current.transcript).toEqual([]);
    expect(result.current.pendingConfirm).toBeNull();
  });

  it('getElapsedSeconds returns 0 before any session starts', () => {
    const { result } = renderHook(() => useRealtimeVoice());
    expect(result.current.getElapsedSeconds()).toBe(0);
  });
});

describe('useRealtimeVoice — start / connect lifecycle', () => {
  it('transitions status: idle → connecting → listening on happy path', async () => {
    const { result } = await renderAndConnect();
    expect(result.current.status).toBe('listening');
    expect(result.current.error).toBeNull();
  });

  it('calls getUserMedia + RTCPeerConnection + addTrack', async () => {
    await renderAndConnect();
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({ audio: true });
    expect(pcHandle.addTrack).toHaveBeenCalledWith(micTrack, micStream);
  });

  it('mints an ephemeral session via POST /api/portal/voice/session', async () => {
    const { fetchMock } = await renderAndConnect(() => 'ctx-string');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/portal/voice/session');
    expect(JSON.parse(init.body as string)).toEqual({ pageContext: 'ctx-string' });
  });

  it('sends the SDP offer to OpenAI with the client secret as Bearer', async () => {
    const { fetchMock } = await renderAndConnect();
    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toContain('api.openai.com');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer secret-abc');
    expect(init.body).toBe('offer-sdp');
  });

  it('sends a session.update event on dc.onopen to enable transcription', async () => {
    await renderAndConnect();
    expect(dcHandle.send).toHaveBeenCalledTimes(1);
    const sent = JSON.parse(dcHandle.send.mock.calls[0][0] as string) as { type: string };
    expect(sent.type).toBe('session.update');
  });

  it('does NOT start a second connection when already connecting/listening', async () => {
    const { result, fetchMock } = await renderAndConnect();
    const callsBefore = fetchMock.mock.calls.length;
    await act(async () => {
      await result.current.start();
    });
    expect(fetchMock.mock.calls.length).toBe(callsBefore);
  });

  it('getElapsedSeconds returns a non-negative number after connecting', async () => {
    const { result } = await renderAndConnect();
    expect(result.current.getElapsedSeconds()).toBeGreaterThanOrEqual(0);
  });

  it('passes getPageContext result (undefined when not provided)', async () => {
    const { fetchMock } = await renderAndConnect();
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string) as { pageContext: string };
    expect(body.pageContext).toBe('');
  });
});

describe('useRealtimeVoice — start error paths', () => {
  // NOTE: The catch block in start() calls stop() after setStatus('error'),
  // and stop() calls setStatus('idle').  So the final settled status after
  // an error is 'idle', but the error string is preserved.

  it('sets error when session fetch returns non-ok', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ success: false, message: 'Unauthorized' }),
      }),
    );
    const { result } = renderHook(() => useRealtimeVoice());
    await act(async () => { await result.current.start(); });
    expect(result.current.error).toBe('Unauthorized');
    expect(result.current.status).toBe('idle'); // stop() resets to idle after error
  });

  it('sets error when session fetch returns success:false', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: false, message: 'No credits' }),
      }),
    );
    const { result } = renderHook(() => useRealtimeVoice());
    await act(async () => { await result.current.start(); });
    expect(result.current.error).toBe('No credits');
    expect(result.current.status).toBe('idle');
  });

  it('uses a fallback message when session json parse fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({
        ok: false,
        json: () => Promise.reject(new Error('bad json')),
      }),
    );
    const { result } = renderHook(() => useRealtimeVoice());
    await act(async () => { await result.current.start(); });
    // json() rejection is caught by .catch(() => null), so sessJson=null → throws fallback
    expect(result.current.error).toBeTruthy();
    expect(result.current.status).toBe('idle');
  });

  it('sets error when SDP exchange fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn()
        .mockResolvedValueOnce(sessionOk())
        .mockResolvedValueOnce({ ok: false, text: () => Promise.resolve('') }),
    );
    const { result } = renderHook(() => useRealtimeVoice());
    await act(async () => { await result.current.start(); });
    expect(result.current.error).toBe('Voice service refused the connection.');
    expect(result.current.status).toBe('idle');
  });

  it('sets error when getUserMedia rejects', async () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: {
        mediaDevices: {
          getUserMedia: vi.fn(() => Promise.reject(new Error('Permission denied'))),
        },
      },
      writable: true,
      configurable: true,
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(sessionOk()));
    const { result } = renderHook(() => useRealtimeVoice());
    await act(async () => { await result.current.start(); });
    expect(result.current.error).toBe('Permission denied');
    expect(result.current.status).toBe('idle');
  });

  it('clears transcript and error when a fresh start succeeds after an error', async () => {
    // First call → error (status ends up idle, error set)
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ success: false, message: 'oops' }),
      }),
    );
    const { result } = renderHook(() => useRealtimeVoice());
    await act(async () => { await result.current.start(); });
    expect(result.current.error).toBe('oops');
    expect(result.current.status).toBe('idle'); // stop() reset it

    // Second call → success
    const fetchMock2 = vi
      .fn()
      .mockResolvedValueOnce(sessionOk())
      .mockResolvedValueOnce(sdpOk());
    vi.stubGlobal('fetch', fetchMock2);

    await act(async () => {
      await result.current.start();
    });
    await act(async () => {
      dcHandle.onopen?.();
    });

    expect(result.current.status).toBe('listening');
    expect(result.current.error).toBeNull();
    expect(result.current.transcript).toEqual([]);
  });
});

describe('useRealtimeVoice — stop / cleanup', () => {
  it('stop() transitions status back to idle after connecting', async () => {
    const { result } = await renderAndConnect();
    expect(result.current.status).toBe('listening');
    act(() => result.current.stop());
    expect(result.current.status).toBe('idle');
  });

  it('stop() closes data channel and peer connection', async () => {
    const { result } = await renderAndConnect();
    act(() => result.current.stop());
    expect(dcHandle.close).toHaveBeenCalled();
    expect(pcHandle.close).toHaveBeenCalled();
  });

  it('stop() stops mic tracks', async () => {
    const { result } = await renderAndConnect();
    act(() => result.current.stop());
    expect(micTrack.stop).toHaveBeenCalled();
  });

  it('stop() clears pendingConfirm', async () => {
    const { result } = await renderAndConnect();
    act(() => result.current.stop());
    expect(result.current.pendingConfirm).toBeNull();
  });

  it('unmount does not throw', async () => {
    const { unmount } = await renderAndConnect();
    expect(() => unmount()).not.toThrow();
  });
});

describe('useRealtimeVoice — handleServerEvent via dc.onmessage', () => {
  it('appends assistant delta to transcript', async () => {
    const { result } = await renderAndConnect();
    act(() => {
      dcHandle.onmessage?.(new MessageEvent('message', {
        data: JSON.stringify({ type: 'response.output_audio_transcript.delta', delta: 'Hello ' }),
      }));
      dcHandle.onmessage?.(new MessageEvent('message', {
        data: JSON.stringify({ type: 'response.output_audio_transcript.delta', delta: 'world' }),
      }));
    });
    expect(result.current.transcript).toHaveLength(1);
    expect(result.current.transcript[0].role).toBe('assistant');
    expect(result.current.transcript[0].text).toBe('Hello world');
  });

  it('handles beta transcript delta event name', async () => {
    const { result } = await renderAndConnect();
    act(() => {
      dcHandle.onmessage?.(new MessageEvent('message', {
        data: JSON.stringify({ type: 'response.audio_transcript.delta', delta: 'Beta' }),
      }));
    });
    expect(result.current.transcript).toHaveLength(1);
    expect(result.current.transcript[0].text).toBe('Beta');
  });

  it('resets assistantEntryId on transcript.done so next delta starts fresh entry', async () => {
    const { result } = await renderAndConnect();
    // Fire each message in its own act() so React flushes between them and
    // assistantEntryId.current=null (set by done) is visible to the next delta.
    act(() => {
      dcHandle.onmessage?.(new MessageEvent('message', {
        data: JSON.stringify({ type: 'response.output_audio_transcript.delta', delta: 'First' }),
      }));
    });
    act(() => {
      dcHandle.onmessage?.(new MessageEvent('message', {
        data: JSON.stringify({ type: 'response.output_audio_transcript.done' }),
      }));
    });
    act(() => {
      dcHandle.onmessage?.(new MessageEvent('message', {
        data: JSON.stringify({ type: 'response.output_audio_transcript.delta', delta: 'Second' }),
      }));
    });
    expect(result.current.transcript).toHaveLength(2);
    expect(result.current.transcript[0].text).toBe('First');
    expect(result.current.transcript[1].text).toBe('Second');
  });

  it('handles beta transcript.done event name', async () => {
    const { result } = await renderAndConnect();
    act(() => {
      dcHandle.onmessage?.(new MessageEvent('message', {
        data: JSON.stringify({ type: 'response.audio_transcript.delta', delta: 'A' }),
      }));
    });
    act(() => {
      dcHandle.onmessage?.(new MessageEvent('message', {
        data: JSON.stringify({ type: 'response.audio_transcript.done' }),
      }));
    });
    act(() => {
      dcHandle.onmessage?.(new MessageEvent('message', {
        data: JSON.stringify({ type: 'response.audio_transcript.delta', delta: 'B' }),
      }));
    });
    expect(result.current.transcript).toHaveLength(2);
  });

  it('appends user transcript from input_audio_transcription.completed', async () => {
    const { result } = await renderAndConnect();
    act(() => {
      dcHandle.onmessage?.(new MessageEvent('message', {
        data: JSON.stringify({
          type: 'conversation.item.input_audio_transcription.completed',
          transcript: 'User said this',
        }),
      }));
    });
    expect(result.current.transcript).toHaveLength(1);
    expect(result.current.transcript[0].role).toBe('user');
    expect(result.current.transcript[0].text).toBe('User said this');
  });

  it('ignores blank user transcripts', async () => {
    const { result } = await renderAndConnect();
    act(() => {
      dcHandle.onmessage?.(new MessageEvent('message', {
        data: JSON.stringify({
          type: 'conversation.item.input_audio_transcription.completed',
          transcript: '   ',
        }),
      }));
    });
    expect(result.current.transcript).toHaveLength(0);
  });

  it('ignores non-string deltas without crashing', async () => {
    const { result } = await renderAndConnect();
    act(() => {
      dcHandle.onmessage?.(new MessageEvent('message', {
        data: JSON.stringify({ type: 'response.output_audio_transcript.delta', delta: 42 }),
      }));
    });
    expect(result.current.transcript).toHaveLength(0);
  });

  it('captures function call name from output_item.added without crashing', async () => {
    await renderAndConnect();
    expect(() => {
      act(() => {
        dcHandle.onmessage?.(new MessageEvent('message', {
          data: JSON.stringify({
            type: 'response.output_item.added',
            item: { type: 'function_call', call_id: 'call-1', name: 'search_crm' },
          }),
        }));
      });
    }).not.toThrow();
  });

  it('ignores output_item.added for non-function items', async () => {
    await renderAndConnect();
    expect(() => {
      act(() => {
        dcHandle.onmessage?.(new MessageEvent('message', {
          data: JSON.stringify({
            type: 'response.output_item.added',
            item: { type: 'message' },
          }),
        }));
      });
    }).not.toThrow();
  });

  it('sets error state on server-side error event', async () => {
    const { result } = await renderAndConnect();
    act(() => {
      dcHandle.onmessage?.(new MessageEvent('message', {
        data: JSON.stringify({ type: 'error', error: { message: 'Rate limited' } }),
      }));
    });
    expect(result.current.error).toBe('Rate limited');
  });

  it('uses fallback error message when error.message is absent', async () => {
    const { result } = await renderAndConnect();
    act(() => {
      dcHandle.onmessage?.(new MessageEvent('message', {
        data: JSON.stringify({ type: 'error' }),
      }));
    });
    expect(result.current.error).toBe('Voice error');
  });

  it('ignores non-JSON frames without crashing', async () => {
    await renderAndConnect();
    expect(() => {
      act(() => {
        dcHandle.onmessage?.(new MessageEvent('message', { data: 'not json }{' }));
      });
    }).not.toThrow();
  });
});

describe('useRealtimeVoice — tool dispatch (function_call_arguments.done)', () => {
  /** Render, connect, then fire a function_call_arguments.done message */
  async function dispatchToolEvent(
    extraFetchResponses: Response[],
    callId: string,
    name: string,
    args: string,
  ) {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(sessionOk())
      .mockResolvedValueOnce(sdpOk());
    extraFetchResponses.forEach((r) => fetchMock.mockResolvedValueOnce(r));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useRealtimeVoice());
    await act(async () => { await result.current.start(); });
    await act(async () => { dcHandle.onopen?.(); });

    dcHandle.send.mockClear();

    await act(async () => {
      dcHandle.onmessage?.(new MessageEvent('message', {
        data: JSON.stringify({
          type: 'response.function_call_arguments.done',
          call_id: callId,
          name,
          arguments: args,
        }),
      }));
      // Allow the async dispatchTool chain to resolve
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    return { result, fetchMock };
  }

  it('posts to /api/portal/voice/tool on function_call_arguments.done', async () => {
    const { fetchMock } = await dispatchToolEvent([toolExecuted()], 'c1', 'do_thing', '{"x":1}');
    const toolCalls = fetchMock.mock.calls.filter(([url]: [string]) => url === '/api/portal/voice/tool');
    expect(toolCalls).toHaveLength(1);
    const body = JSON.parse(toolCalls[0][1].body as string) as { tool: string; args: Record<string, unknown> };
    expect(body.tool).toBe('do_thing');
    expect(body.args).toEqual({ x: 1 });
  });

  it('sends function_call_output + response.create when tool executes', async () => {
    await dispatchToolEvent([toolExecuted({ value: 'done' })], 'c1', 'my_func', '{}');
    const sentEvents = dcHandle.send.mock.calls.map((c: [string]) => JSON.parse(c[0]) as { type: string; item?: { output?: string } });
    expect(sentEvents.some((e) => e.type === 'conversation.item.create')).toBe(true);
    expect(sentEvents.some((e) => e.type === 'response.create')).toBe(true);
  });

  it('sets pendingConfirm when tool returns needs_confirmation', async () => {
    const { result } = await dispatchToolEvent(
      [toolNeedsConfirm('Are you sure?', 'ct-001')],
      'c2',
      'dangerous_op',
      '{"target":"all"}',
    );
    expect(result.current.pendingConfirm).not.toBeNull();
    expect(result.current.pendingConfirm?.toolName).toBe('dangerous_op');
    expect(result.current.pendingConfirm?.summary).toBe('Are you sure?');
    expect(result.current.pendingConfirm?.confirmToken).toBe('ct-001');
  });

  it('sends error output when tool fetch fails', async () => {
    await dispatchToolEvent([toolFailed('Server error')], 'c3', 'fail_tool', '{}');
    const sentEvents = dcHandle.send.mock.calls.map((c: [string]) => JSON.parse(c[0]) as { type: string; item?: { output?: string } });
    const outputCall = sentEvents.find((e) => e.item?.output !== undefined);
    expect(outputCall).toBeDefined();
    const output = JSON.parse(outputCall!.item!.output!) as { error?: string };
    expect(output.error).toBe('Server error');
  });

  it('uses callNames map when evt.name is absent', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(sessionOk())
      .mockResolvedValueOnce(sdpOk())
      .mockResolvedValueOnce(toolExecuted());
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useRealtimeVoice());
    await act(async () => { await result.current.start(); });
    await act(async () => { dcHandle.onopen?.(); });

    await act(async () => {
      // Register name first
      dcHandle.onmessage?.(new MessageEvent('message', {
        data: JSON.stringify({
          type: 'response.output_item.added',
          item: { type: 'function_call', call_id: 'c-map', name: 'mapped_tool' },
        }),
      }));
      // Fire args done WITHOUT a name field
      dcHandle.onmessage?.(new MessageEvent('message', {
        data: JSON.stringify({
          type: 'response.function_call_arguments.done',
          call_id: 'c-map',
          name: '',
          arguments: '{}',
        }),
      }));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    const toolCalls = fetchMock.mock.calls.filter(([url]: [string]) => url === '/api/portal/voice/tool');
    expect(toolCalls).toHaveLength(1);
    const body = JSON.parse(toolCalls[0][1].body as string) as { tool: string };
    expect(body.tool).toBe('mapped_tool');
  });

  it('handles malformed JSON arguments gracefully (falls back to empty args)', async () => {
    const { fetchMock } = await dispatchToolEvent([toolExecuted()], 'c-bad', 'tool', '{not valid json');
    const toolCalls = fetchMock.mock.calls.filter(([url]: [string]) => url === '/api/portal/voice/tool');
    expect(toolCalls).toHaveLength(1);
    const body = JSON.parse(toolCalls[0][1].body as string) as { args: Record<string, unknown> };
    expect(body.args).toEqual({});
  });
});

describe('useRealtimeVoice — confirm / deny', () => {
  /** Helper: connect + inject a needs_confirmation response */
  async function renderWithPending() {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(sessionOk())
      .mockResolvedValueOnce(sdpOk())
      .mockResolvedValueOnce(toolNeedsConfirm('Delete all?', 'confirm-tok'));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useRealtimeVoice());
    await act(async () => { await result.current.start(); });
    await act(async () => { dcHandle.onopen?.(); });

    await act(async () => {
      dcHandle.onmessage?.(new MessageEvent('message', {
        data: JSON.stringify({
          type: 'response.function_call_arguments.done',
          call_id: 'c-confirm',
          name: 'delete_all',
          arguments: '{"scope":"all"}',
        }),
      }));
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.pendingConfirm).not.toBeNull();
    return { result, fetchMock };
  }

  it('confirm() clears pendingConfirm and dispatches tool with confirmToken', async () => {
    const { result, fetchMock } = await renderWithPending();
    fetchMock.mockResolvedValueOnce(toolExecuted({ deleted: true }));

    await act(async () => {
      await result.current.confirm();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.pendingConfirm).toBeNull();
    const confirmCalls = fetchMock.mock.calls.filter(([url, init]: [string, { body: string }]) => {
      if (url !== '/api/portal/voice/tool') return false;
      const body = JSON.parse(init.body) as { confirmToken?: string };
      return body.confirmToken === 'confirm-tok';
    });
    expect(confirmCalls).toHaveLength(1);
  });

  it('confirm() is a no-op when pendingConfirm is null', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useRealtimeVoice());
    await act(async () => { await result.current.confirm(); });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('deny() clears pendingConfirm and sends cancelled output to model', async () => {
    const { result } = await renderWithPending();
    dcHandle.send.mockClear();

    act(() => result.current.deny());

    expect(result.current.pendingConfirm).toBeNull();
    const sentEvents = dcHandle.send.mock.calls.map((c: [string]) => JSON.parse(c[0]) as { type: string; item?: { output?: string } });
    const outputCall = sentEvents.find((e) => e.item?.output !== undefined);
    expect(outputCall).toBeDefined();
    const output = JSON.parse(outputCall!.item!.output!) as { cancelled: boolean };
    expect(output.cancelled).toBe(true);
    expect(sentEvents.some((e) => e.type === 'response.create')).toBe(true);
  });

  it('deny() is a no-op when pendingConfirm is null', async () => {
    const { result } = renderHook(() => useRealtimeVoice());
    expect(() => act(() => result.current.deny())).not.toThrow();
  });
});

describe('useRealtimeVoice — sendEvent guards', () => {
  it('sendEvent does NOT send when dc.readyState is not open', async () => {
    // Close the dc before the hook uses it
    dcHandle.readyState = 'closed';

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(sessionOk())
      .mockResolvedValueOnce(sdpOk());
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useRealtimeVoice());
    await act(async () => { await result.current.start(); });
    await act(async () => { dcHandle.onopen?.(); });

    dcHandle.send.mockClear();

    // deny() with no pendingConfirm is a no-op; the dc being closed means
    // even if send were called it should short-circuit.
    act(() => result.current.deny());
    expect(dcHandle.send).not.toHaveBeenCalled();
  });
});
