'use client';

/**
 * useRealtimeVoice — browser side of the portal voice assistant.
 *
 * Opens a WebRTC connection straight to the OpenAI Realtime API using a
 * short-lived client secret minted by `/api/portal/voice/session`. The mic is
 * streamed up, the assistant's voice comes back on a remote audio track, and
 * events (transcripts, function calls) flow over an `oai-events` data channel.
 *
 * Function calls are NOT executed in the browser — they're relayed to
 * `/api/portal/voice/tool`, which enforces auth/tenancy and gates mutations
 * behind a confirm card. When a tool needs confirmation we pause and surface
 * `pendingConfirm`; the UI calls `confirm()` / `deny()` to resume the model.
 */
import { useCallback, useRef, useState } from 'react';

export type VoiceStatus = 'idle' | 'connecting' | 'listening' | 'error';

export interface TranscriptEntry {
  id: string;
  role: 'user' | 'assistant';
  text: string;
}

export interface PendingConfirm {
  callId: string;
  toolName: string;
  args: Record<string, unknown>;
  confirmToken: string;
  summary: string;
}

export function useRealtimeVoice(getPageContext?: () => string) {
  const [status, setStatus] = useState<VoiceStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const micRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Meeting-mode: optional shared-tab audio + the mixer that combines it with mic.
  const displayRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const startedAtRef = useRef<number | null>(null);
  // call_id → tool name, captured from output_item.added before args arrive.
  const callNames = useRef<Map<string, string>>(new Map());
  // Accumulates streaming assistant transcript deltas into one entry.
  const assistantEntryId = useRef<string | null>(null);

  const appendAssistantDelta = useCallback((delta: string) => {
    setTranscript((prev) => {
      const id = assistantEntryId.current;
      if (id) {
        return prev.map((e) => (e.id === id ? { ...e, text: e.text + delta } : e));
      }
      const newId = `a_${prev.length}_${delta.length}`;
      assistantEntryId.current = newId;
      return [...prev, { id: newId, role: 'assistant', text: delta }];
    });
  }, []);

  const addUserTranscript = useCallback((text: string) => {
    if (!text.trim()) return;
    setTranscript((prev) => [...prev, { id: `u_${prev.length}_${text.length}`, role: 'user', text }]);
  }, []);

  const sendEvent = useCallback((event: unknown) => {
    const dc = dcRef.current;
    if (dc && dc.readyState === 'open') dc.send(JSON.stringify(event));
  }, []);

  /** Relay a completed function call to the server tool dispatcher. */
  const dispatchTool = useCallback(
    async (callId: string, toolName: string, args: Record<string, unknown>, confirmToken?: string) => {
      const res = await fetch('/api/portal/voice/tool', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool: toolName, args, confirmToken }),
      });
      const json = (await res.json().catch(() => null)) as
        | { success?: boolean; data?: { status?: string; summary?: string; confirmToken?: string; result?: unknown }; message?: string }
        | null;

      if (!res.ok || !json?.success) {
        // Tell the model the tool failed so it can recover gracefully.
        sendEvent({
          type: 'conversation.item.create',
          item: {
            type: 'function_call_output',
            call_id: callId,
            output: JSON.stringify({ error: json?.message ?? 'Tool failed' }),
          },
        });
        sendEvent({ type: 'response.create' });
        return;
      }

      if (json.data?.status === 'needs_confirmation') {
        setPendingConfirm({
          callId,
          toolName,
          args,
          confirmToken: json.data.confirmToken ?? '',
          summary: json.data.summary ?? `Run ${toolName}?`,
        });
        return; // wait for confirm()/deny()
      }

      // Executed — feed the result back and let the model continue speaking.
      sendEvent({
        type: 'conversation.item.create',
        item: {
          type: 'function_call_output',
          call_id: callId,
          output: JSON.stringify(json.data?.result ?? {}),
        },
      });
      sendEvent({ type: 'response.create' });
    },
    [sendEvent],
  );

  const handleServerEvent = useCallback(
    (evt: Record<string, unknown>) => {
      const type = String(evt.type ?? '');

      // ── Assistant spoken transcript (streaming). Handle GA + beta names.
      if (type === 'response.output_audio_transcript.delta' || type === 'response.audio_transcript.delta') {
        if (typeof evt.delta === 'string') appendAssistantDelta(evt.delta);
        return;
      }
      if (type === 'response.output_audio_transcript.done' || type === 'response.audio_transcript.done') {
        assistantEntryId.current = null; // next delta starts a fresh entry
        return;
      }

      // ── User speech transcription.
      if (type === 'conversation.item.input_audio_transcription.completed') {
        if (typeof evt.transcript === 'string') addUserTranscript(evt.transcript);
        return;
      }

      // ── Function call lifecycle.
      if (type === 'response.output_item.added') {
        const item = evt.item as { type?: string; call_id?: string; name?: string } | undefined;
        if (item?.type === 'function_call' && item.call_id && item.name) {
          callNames.current.set(item.call_id, item.name);
        }
        return;
      }
      if (type === 'response.function_call_arguments.done') {
        const callId = String(evt.call_id ?? '');
        const name = (evt.name as string) || callNames.current.get(callId) || '';
        let args: Record<string, unknown> = {};
        try {
          args = evt.arguments ? (JSON.parse(String(evt.arguments)) as Record<string, unknown>) : {};
        } catch {
          /* malformed args → empty object; tool will validate */
        }
        if (callId && name) void dispatchTool(callId, name, args);
        return;
      }

      if (type === 'error') {
        const message = (evt.error as { message?: string } | undefined)?.message ?? 'Voice error';
        setError(message);
      }
    },
    [appendAssistantDelta, addUserTranscript, dispatchTool],
  );

  const stop = useCallback(() => {
    dcRef.current?.close();
    dcRef.current = null;
    micRef.current?.getTracks().forEach((t) => t.stop());
    micRef.current = null;
    displayRef.current?.getTracks().forEach((t) => t.stop());
    displayRef.current = null;
    void audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    pcRef.current?.close();
    pcRef.current = null;
    if (audioRef.current) {
      audioRef.current.srcObject = null;
      audioRef.current = null;
    }
    callNames.current.clear();
    assistantEntryId.current = null;
    setPendingConfirm(null);
    setStatus('idle');
  }, []);

  /** Seconds elapsed since the current/last session started (0 if never started). */
  const getElapsedSeconds = useCallback(() => {
    return startedAtRef.current ? Math.round((Date.now() - startedAtRef.current) / 1000) : 0;
  }, []);

  const start = useCallback(async (opts?: { captureTabAudio?: boolean }) => {
    if (status === 'connecting' || status === 'listening') return;
    setError(null);
    setTranscript([]);
    setStatus('connecting');
    startedAtRef.current = Date.now();
    try {
      // 1. Mint an ephemeral session (server enforces plan/credits + tools).
      const sessRes = await fetch('/api/portal/voice/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageContext: getPageContext?.() ?? '' }),
      });
      const sessJson = (await sessRes.json().catch(() => null)) as
        | { success?: boolean; data?: { clientSecret?: string; model?: string }; message?: string }
        | null;
      if (!sessRes.ok || !sessJson?.success || !sessJson.data?.clientSecret) {
        throw new Error(sessJson?.message ?? 'Could not start a voice session.');
      }
      const { clientSecret, model } = sessJson.data;

      // 2. Mic + peer connection.
      const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
      micRef.current = mic;
      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      // Meeting mode: optionally fold shared-tab audio in with the mic so the
      // assistant hears the other participants too. Best-effort — any failure
      // falls back to mic-only.
      let outboundTrack: MediaStreamTrack = mic.getAudioTracks()[0];
      if (opts?.captureTabAudio) {
        try {
          const display = await navigator.mediaDevices.getDisplayMedia({ audio: true, video: true });
          displayRef.current = display;
          // We only want the audio; stop the video track immediately.
          display.getVideoTracks().forEach((t) => t.stop());
          if (display.getAudioTracks().length > 0) {
            const ctx = new AudioContext();
            audioCtxRef.current = ctx;
            const dest = ctx.createMediaStreamDestination();
            ctx.createMediaStreamSource(mic).connect(dest);
            ctx.createMediaStreamSource(display).connect(dest);
            outboundTrack = dest.stream.getAudioTracks()[0];
          }
        } catch {
          /* user cancelled the picker or no tab audio — mic-only is fine */
        }
      }
      pc.addTrack(outboundTrack, mic);

      // 3. Remote audio (assistant voice).
      const audioEl = new Audio();
      audioEl.autoplay = true;
      audioRef.current = audioEl;
      pc.ontrack = (e) => {
        audioEl.srcObject = e.streams[0];
      };

      // 4. Events channel.
      const dc = pc.createDataChannel('oai-events');
      dcRef.current = dc;
      dc.onopen = () => {
        setStatus('listening');
        // Ask for user-speech transcription (best-effort; ignored if unsupported).
        sendEvent({
          type: 'session.update',
          session: { type: 'realtime', audio: { input: { transcription: { model: 'whisper-1' } } } },
        });
      };
      dc.onmessage = (e) => {
        try {
          handleServerEvent(JSON.parse(e.data) as Record<string, unknown>);
        } catch {
          /* ignore non-JSON frames */
        }
      };

      // 5. SDP exchange with OpenAI using the ephemeral secret.
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const sdpRes = await fetch(`https://api.openai.com/v1/realtime/calls?model=${encodeURIComponent(model ?? 'gpt-realtime')}`, {
        method: 'POST',
        body: offer.sdp,
        headers: { Authorization: `Bearer ${clientSecret}`, 'Content-Type': 'application/sdp' },
      });
      if (!sdpRes.ok) throw new Error('Voice service refused the connection.');
      const answerSdp = await sdpRes.text();
      await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start voice.';
      setError(message);
      setStatus('error');
      stop();
    }
  }, [status, getPageContext, sendEvent, handleServerEvent, stop]);

  const confirm = useCallback(async () => {
    const pc = pendingConfirm;
    if (!pc) return;
    setPendingConfirm(null);
    await dispatchTool(pc.callId, pc.toolName, pc.args, pc.confirmToken);
  }, [pendingConfirm, dispatchTool]);

  const deny = useCallback(() => {
    const pc = pendingConfirm;
    if (!pc) return;
    setPendingConfirm(null);
    // Tell the model the user declined so it doesn't hang waiting on output.
    sendEvent({
      type: 'conversation.item.create',
      item: {
        type: 'function_call_output',
        call_id: pc.callId,
        output: JSON.stringify({ cancelled: true, reason: 'User declined the action.' }),
      },
    });
    sendEvent({ type: 'response.create' });
  }, [pendingConfirm, sendEvent]);

  return { status, error, transcript, pendingConfirm, start, stop, confirm, deny, getElapsedSeconds };
}
