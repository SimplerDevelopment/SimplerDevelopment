'use client';

/**
 * VoiceAssistant — floating push-to-talk voice widget mounted across the portal.
 *
 * Sits to the left of the text AIChatWidget. Tapping the mic starts a WebRTC
 * session to OpenAI Realtime (via `useRealtimeVoice`); the user speaks, the
 * assistant replies by voice, and mutating actions surface an in-widget confirm
 * card before anything is written.
 *
 * Meeting mode (toggle): also captures shared-tab audio and, after the session,
 * lets the user save the transcript into the Company Brain as a meeting — which
 * runs the existing extraction pipeline (decisions / tasks → review queue).
 */
import { useCallback, useState } from 'react';
import { usePathname } from 'next/navigation';

import { useRealtimeVoice } from './useRealtimeVoice';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export default function VoiceAssistant() {
  const pathname = usePathname();
  const getPageContext = useCallback(
    () => `The user is currently on the portal page: ${pathname}`,
    [pathname],
  );
  const { status, error, transcript, pendingConfirm, start, stop, confirm, deny, getElapsedSeconds } =
    useRealtimeVoice(getPageContext);

  const [meetingMode, setMeetingMode] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const active = status === 'listening' || status === 'connecting';
  const open = active || transcript.length > 0 || !!error;
  const showSaveButton = meetingMode && transcript.length > 0;
  const canSave = showSaveButton && saveState !== 'saving';

  const buttonIcon =
    status === 'connecting' ? 'hourglass_empty' : status === 'listening' ? 'stop' : 'mic';

  const toggle = () => {
    if (active) stop();
    else {
      setSaveState('idle');
      setSaveMessage(null);
      void start({ captureTabAudio: meetingMode });
    }
  };

  const saveToBrain = useCallback(async () => {
    if (transcript.length === 0) return;
    if (active) stop(); // finalize the session first
    setSaveState('saving');
    setSaveMessage(null);
    try {
      const text = transcript
        .map((e) => `${e.role === 'user' ? 'Speaker' : 'Assistant'}: ${e.text}`)
        .join('\n');
      const title = `Voice session — ${new Date().toLocaleString()}`;

      // 1. Create the meeting via the live_voice adapter.
      const createRes = await fetch('/api/portal/brain/communications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adapterId: 'live_voice',
          input: { transcript: text, title, durationSeconds: getElapsedSeconds() },
        }),
      });
      const createJson = (await createRes.json().catch(() => null)) as
        | { success?: boolean; data?: { id?: number }; message?: string }
        | null;
      if (!createRes.ok || !createJson?.success || !createJson.data?.id) {
        throw new Error(createJson?.message ?? 'Could not save the meeting.');
      }
      const meetingId = createJson.data.id;

      // 2. Kick off extraction (decisions / tasks → review queue).
      await fetch(`/api/portal/brain/communications/${meetingId}/process`, { method: 'POST' });

      setSaveState('saved');
      setSaveMessage('Saved to Brain — processing decisions & tasks.');
    } catch (err) {
      setSaveState('error');
      setSaveMessage(err instanceof Error ? err.message : 'Failed to save.');
    }
  }, [transcript, active, stop, getElapsedSeconds]);

  return (
    <>
      {/* Transcript / confirm panel */}
      {open && (
        <div className="fixed bottom-20 right-20 sm:bottom-24 sm:right-24 z-50 w-[calc(100vw-1rem)] sm:w-[340px] max-w-[340px] max-h-[460px] bg-card border border-border rounded-2xl shadow-2xl flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <div className="flex items-center gap-2">
              <span className="material-icons text-primary text-base">
                {status === 'listening' ? 'graphic_eq' : 'record_voice_over'}
              </span>
              <span className="text-sm font-medium">Voice assistant</span>
            </div>
            <span className="text-xs text-muted-foreground capitalize">{status}</span>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
            {error && (
              <div className="text-xs text-destructive bg-destructive/10 rounded-lg px-3 py-2">
                {error}
              </div>
            )}
            {transcript.length === 0 && !error && (
              <p className="text-xs text-muted-foreground">
                {status === 'listening'
                  ? 'Listening… try "what deals are open" or "add a task to follow up with Acme".'
                  : 'Connecting…'}
              </p>
            )}
            {transcript.map((entry) => (
              <div
                key={entry.id}
                className={
                  entry.role === 'user'
                    ? 'text-sm text-foreground'
                    : 'text-sm text-foreground bg-muted rounded-lg px-3 py-2'
                }
              >
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground mr-1">
                  {entry.role === 'user' ? 'You' : 'AI'}
                </span>
                {entry.text}
              </div>
            ))}
          </div>

          {/* Confirm card for mutating actions */}
          {pendingConfirm && (
            <div className="border-t border-border bg-amber-50 px-4 py-3">
              <div className="flex items-start gap-2">
                <span className="material-icons text-amber-600 text-base">help_outline</span>
                <p className="text-sm text-amber-900 flex-1">{pendingConfirm.summary}</p>
              </div>
              <div className="flex justify-end gap-2 mt-3">
                <button
                  onClick={deny}
                  className="text-xs px-3 py-1.5 rounded-lg border border-border bg-card hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => void confirm()}
                  className="text-xs px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  Confirm
                </button>
              </div>
            </div>
          )}

          {/* Footer: meeting-mode toggle + save-to-Brain */}
          <div className="border-t border-border px-4 py-2.5 flex items-center justify-between gap-2">
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
              <input
                type="checkbox"
                className="accent-primary"
                checked={meetingMode}
                disabled={active}
                onChange={(e) => setMeetingMode(e.target.checked)}
              />
              Meeting mode
            </label>
            {saveMessage ? (
              <span
                className={`text-xs ${saveState === 'error' ? 'text-destructive' : 'text-emerald-600'}`}
              >
                {saveMessage}
              </span>
            ) : (
              showSaveButton && (
                <button
                  onClick={() => void saveToBrain()}
                  disabled={!canSave}
                  className="text-xs px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors inline-flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span className="material-icons text-sm">psychology</span>
                  {saveState === 'saving' ? 'Saving…' : 'Save to Brain'}
                </button>
              )
            )}
          </div>
        </div>
      )}

      {/* Floating mic button (sits left of the text chat widget) */}
      <button
        onClick={toggle}
        aria-label={active ? 'Stop voice assistant' : 'Start voice assistant'}
        className={`fixed bottom-2 right-20 sm:bottom-6 sm:right-24 z-50 w-14 h-14 rounded-full shadow-lg transition-all flex items-center justify-center ${
          active
            ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
            : 'bg-primary text-primary-foreground hover:bg-primary/90'
        }`}
      >
        <span className={`material-icons text-2xl ${status === 'listening' ? 'animate-pulse' : ''}`}>
          {buttonIcon}
        </span>
      </button>
    </>
  );
}
