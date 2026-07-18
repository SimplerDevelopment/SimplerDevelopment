import { LinearGradient } from 'expo-linear-gradient';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  Text,
  TouchableWithoutFeedback,
  View,
  type ScrollView as ScrollViewType,
} from 'react-native';

import { AiAvatar, Avatar, AvatarStack, Chip, MIcon } from '@/components/atoms';
import {
  BrainContextStrip,
  Composer,
  type ComposerMode,
  MessageActions,
  MessageBubble,
  ToolUseCard,
} from '@/components/chat';
import { EntitlementUpsell, Screen } from '@/components/ui';
import { streamChat, type StreamEvent } from '@/lib/api/chat-stream';
import { useConversation } from '@/lib/api/conversations';
import type { AiMessage } from '@/lib/api/types/chat';
import {
  conversations,
  messagesByConversation,
  type Conversation,
  type Message,
} from '@/lib/mock';
import { Gradients, T, linearGradientProps } from '@/lib/theme';

/**
 * Route ids fall into three buckets:
 *  - `ai-<n>`  → real persisted AI conversation (from useConversations())
 *  - `new`     → compose-a-new-AI-thread sentinel
 *  - anything else → mock DM / group conversation (Phase 2 mock data)
 *
 * Returns the numeric portal id when applicable, else null.
 */
function parseAiId(id: string | undefined): number | null {
  if (!id) return null;
  if (id.startsWith('ai-')) {
    const n = Number(id.slice(3));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * Chat detail. Branches on conversation kind:
 *  - ai     → BrainContextStrip + persisted history (when from API) +
 *             live streaming via /api/portal/ai/chat/stream
 *  - dm     → no brain strip, group composer (no toggle), regular bubbles
 *  - group  → group composer with Direct-to-AI toggle, bubbles + AI replies
 *
 * Phase 4 (Agent A): real AI conversations come from
 * `GET /api/portal/ai/conversations/[id]` and prime the live thread with
 * their persisted message history. The new-conversation route (`/chat/new`)
 * still works — the first send mints a row server-side and the streaming
 * `done` frame returns the new conversation id.
 *
 * dm + group remain mock-data-driven (no backend tables yet).
 */
export default function ChatDetail() {
  const { id, prompt, autoSend } = useLocalSearchParams<{
    id: string;
    prompt?: string;
    /** When `'1'` AND `id === 'new'` AND `prompt` is present, the composer
     *  fires once on mount instead of just pre-filling the draft. Used by
     *  deep-link callers (e.g. brain → "Ask the assistant") that want the
     *  conversation to start without the user having to tap send. */
    autoSend?: string;
  }>();
  const router = useRouter();

  const apiConvId = parseAiId(id);
  const isNew = id === 'new';
  const isApiAi = apiConvId !== null;

  // Hydrate real AI conversations from the portal. Disabled for mock /
  // 'new' ids — the hook handles those internally.
  const detailQuery = useConversation(isApiAi ? apiConvId : null);

  // Mock fallback (DM / group / pre-existing mock AI rows).
  const mockConversation = useMemo<Conversation | undefined>(
    () => conversations.find((c) => c.id === id),
    [id],
  );

  // Synthesize a Conversation shell for API-backed AI threads so the rest
  // of the screen (Header, AiChatScreen) can keep its existing prop shape.
  const conversation = useMemo<Conversation | undefined>(() => {
    if (isApiAi && detailQuery.data) {
      const c = detailQuery.data.conversation;
      return {
        id: `ai-${c.id}`,
        kind: 'ai',
        title: c.title?.trim() || 'New Conversation',
        preview: '',
        time: '',
        participantIds: [],
        tag: 'AI',
      };
    }
    if (isApiAi && !detailQuery.data) {
      // Placeholder until the detail load completes — lets the header
      // render without a "not found" flash.
      return {
        id: id ?? '',
        kind: 'ai',
        title: 'Assistant',
        preview: '',
        time: '',
        participantIds: [],
        tag: 'AI',
      };
    }
    if (isNew) {
      return {
        id: 'new',
        kind: 'ai',
        title: 'New Conversation',
        preview: '',
        time: '',
        participantIds: [],
        tag: 'AI',
      };
    }
    return mockConversation;
  }, [isApiAi, isNew, detailQuery.data, id, mockConversation]);

  // Mock messages remain the source for DM/group; API messages flow through
  // detailQuery for real AI.
  const mockSeed = id ? messagesByConversation[id] ?? [] : [];

  // For real AI conversations, convert persisted messages into the seed
  // shape AiChatScreen expects. Tool_calls aren't surfaced as bubbles here
  // (live streaming has the richer ToolUseCard rendering) — we just bring
  // user + assistant content forward.
  const apiSeed = useMemo<Message[]>(() => {
    if (!isApiAi || !detailQuery.data) return [];
    return detailQuery.data.messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => persistedToMockMessage(m));
  }, [isApiAi, detailQuery.data]);

  const seedMessages = isApiAi ? apiSeed : mockSeed;

  const [actionTarget, setActionTarget] = useState<Message | null>(null);
  const [composerMode, setComposerMode] = useState<ComposerMode>(
    conversation?.kind === 'ai'
      ? 'ai-1on1'
      : conversation?.kind === 'group'
        ? 'group-open'
        : 'group-open', // dm uses 'group-open' (no toggle) — visual is identical
  );

  // Loading state for the initial AI detail fetch — show a soft spinner
  // instead of flashing "not found" while the request is in flight.
  if (isApiAi && detailQuery.isLoading && !detailQuery.data) {
    return (
      <Screen bg={T.bgCard}>
        <Stack.Screen options={{ headerShown: false }} />
        <View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
          }}
        >
          <AiAvatar size={40} />
          <Text style={{ color: T.textSecondary, fontSize: 13 }}>
            Loading conversation…
          </Text>
        </View>
      </Screen>
    );
  }

  if (!conversation) {
    return (
      <Screen bg={T.bgCard}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={{ flexDirection: 'row', alignItems: 'center', padding: 8 }}>
          <Pressable
            accessibilityLabel="Back to chats"
            onPress={() => router.replace('/(tabs)')}
            hitSlop={10}
            style={{ flexDirection: 'row', alignItems: 'center', padding: 8 }}
          >
            <MIcon name="chevron_left" size={22} color={T.ai} />
            <Text style={{ color: T.ai, fontSize: 16, marginLeft: -2 }}>Chats</Text>
          </Pressable>
        </View>
        <View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            padding: 32,
            gap: 12,
          }}
        >
          <MIcon name="chat_bubble" size={36} color={T.textTertiary} />
          <Text style={{ fontSize: 16, fontWeight: '600', color: T.textPrimary }}>
            Conversation not found
          </Text>
          <Text
            style={{
              fontSize: 13,
              color: T.textTertiary,
              textAlign: 'center',
              lineHeight: 18,
            }}
          >
            It may have been deleted or it belongs to a different workspace.
          </Text>
        </View>
      </Screen>
    );
  }

  const isAi = conversation.kind === 'ai';
  const isGroup = conversation.kind === 'group';

  if (isAi) {
    return (
      <AiChatScreen
        conversation={conversation}
        seedMessages={seedMessages}
        initialConversationId={isApiAi ? apiConvId : undefined}
        // Real AI threads with persisted messages render their actual
        // history instead of the canonical mock seed. The mock seed still
        // appears for the legacy mock-id flow (`assistant-primary`, etc.)
        // and for brand-new threads ('new') where the user hasn't sent
        // anything yet.
        useMockSeed={!isApiAi}
        initialDraft={isNew && typeof prompt === 'string' ? prompt : undefined}
        autoSendInitialDraft={
          isNew && typeof prompt === 'string' && autoSend === '1'
        }
        onBack={() => router.back()}
        actionTarget={actionTarget}
        onLongPressMessage={setActionTarget}
        onCloseActions={() => setActionTarget(null)}
      />
    );
  }

  // ── Human (dm / group) thread — unchanged from Phase 2 ───────────────────
  return (
    <Screen bg={T.bgCard}>
      <Stack.Screen options={{ headerShown: false }} />
      <Header conversation={conversation} onBack={() => router.back()} />
      <ScrollView
        style={{ flex: 1, backgroundColor: T.bgApp }}
        contentContainerStyle={{ paddingVertical: 14 }}
        keyboardShouldPersistTaps="handled"
      >
        <DateDivider label="TODAY · 10:24" />
        {renderHumanThread({
          messages: mockSeed,
          onLongPress: setActionTarget,
        })}
      </ScrollView>

      <Composer
        mode={isGroup ? composerMode : 'group-open'}
        showDirectToAiToggle={isGroup}
        groupTitle={
          conversation.title.startsWith('#')
            ? conversation.title.replace(/^#\s*/, '')
            : conversation.title
        }
        memberCount={conversation.participantIds.length + 1}
        onChangeMode={setComposerMode}
      />

      <MessageActions
        visible={!!actionTarget}
        onClose={() => setActionTarget(null)}
        targetText={actionTarget?.text}
        onAction={(id) => {
          console.log('[message-action]', id, 'on', actionTarget?.id);
        }}
      />
    </Screen>
  );
}

/* ============================================================
   AI 1-on-1 — live streaming
   ============================================================ */

/**
 * The AI thread keeps the canonical mock exchange visible on first render
 * (so the screen still matches the mockup) and *appends* live user /
 * assistant turns as the user chats with the real backend.
 *
 * Local state shape:
 *  - `liveTurns` — every turn since first send: user, assistant (possibly
 *    streaming), and tool_call cards. Rendered AFTER the canonical sample.
 *  - `streamingText` — current accumulator for the in-flight assistant
 *    bubble. Reset on `done`.
 *  - `streaming` — boolean lock; disables the composer + shows the typing
 *    pulse on the streaming bubble.
 *  - `error` — last terminal error message, surfaced inline with retry.
 */

interface LiveAssistant {
  kind: 'ai';
  id: string;
  text: string;
  /** True while tokens are still arriving for this bubble. */
  streaming: boolean;
  /** Filled when stream ends with a terminal `error` event. */
  errored?: boolean;
  /** Stable machine code from the underlying envelope (e.g.
   *  `AI_CREDITS_EXHAUSTED`). Lets the bubble swap to an upsell card. */
  errorCode?: string;
  errorUpsellUrl?: string;
}

interface LiveUser {
  kind: 'user';
  id: string;
  text: string;
}

interface LiveTool {
  kind: 'tool';
  id: string;
  tool: string;
  args: Array<[string, string]>;
  scope?: string;
  /** Drives the ToolUseCard live UI: running spinner → done/error/pending footer. */
  status: 'running' | 'done' | 'error' | 'pending';
  /** Short summary of the tool_result output, filled when it arrives. */
  result?: string;
  /** When the write was staged for approval, the pending-change id to deep-link to. */
  pendingId?: number;
}

type LiveTurn = LiveUser | LiveAssistant | LiveTool;

function AiChatScreen({
  conversation,
  seedMessages,
  initialConversationId,
  useMockSeed,
  initialDraft,
  autoSendInitialDraft,
  onBack,
  actionTarget,
  onLongPressMessage,
  onCloseActions,
}: {
  conversation: Conversation;
  seedMessages: Message[];
  /** Persisted portal conversation id. Forwarded to every stream request so
   *  the server appends to the existing thread instead of forking a new one. */
  initialConversationId?: number;
  /** When true, render the canonical mock exchange (legacy mock-id flow and
   *  brand-new 'new' threads). When false, render the real persisted seed. */
  useMockSeed: boolean;
  /** Optional seed text for the composer (deep-link prompts). */
  initialDraft?: string;
  /** When true, fire `sendMessage(initialDraft)` once on mount instead of
   *  pre-filling. Requires `initialDraft` to be set. Backs `?autoSend=1`
   *  deep links from the brain detail screens. */
  autoSendInitialDraft?: boolean;
  onBack: () => void;
  actionTarget: Message | null;
  onLongPressMessage: (m: Message) => void;
  onCloseActions: () => void;
}) {
  const router = useRouter();
  const [liveTurns, setLiveTurns] = useState<LiveTurn[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [conversationId, setConversationId] = useState<number | undefined>(
    initialConversationId,
  );
  const [lastUserText, setLastUserText] = useState<string | null>(null);

  // Keep state in sync if the route param changes (e.g. user navigates
  // from one conversation to another without unmounting). React Query
  // already keys by id; this just lifts the streaming-thread id alongside.
  useEffect(() => {
    setConversationId(initialConversationId);
    setLiveTurns([]);
    setLastUserText(null);
  }, [initialConversationId]);

  const scrollRef = useRef<ScrollViewType | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Auto-scroll on new content. Slight delay so layout pass completes.
  useEffect(() => {
    const t = setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 50);
    return () => clearTimeout(t);
  }, [liveTurns.length, streaming]);

  // Cancel any in-flight stream on unmount.
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  /**
   * Send a fresh user message + start streaming the assistant reply.
   * Uses the cumulative chat history (live turns only — server holds the
   * canonical conversation, we just hand it the latest turn).
   */
  const sendMessage = useCallback(
    (text: string) => {
      if (streaming) return;
      const trimmed = text.trim();
      if (!trimmed) return;

      // Cancel previous stream if any.
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;

      setLastUserText(trimmed);

      // Build the full transcript to send: every prior live user/assistant
      // turn that successfully completed, plus the new user turn.
      const transcript: { role: 'user' | 'assistant'; content: string }[] = [];
      for (const t of liveTurns) {
        if (t.kind === 'user') transcript.push({ role: 'user', content: t.text });
        else if (t.kind === 'ai' && !t.errored && t.text)
          transcript.push({ role: 'assistant', content: t.text });
      }
      transcript.push({ role: 'user', content: trimmed });

      const userId = `live-user-${Date.now()}`;
      const aiId = `live-ai-${Date.now()}`;

      setLiveTurns((prev) => [
        ...prev,
        { kind: 'user', id: userId, text: trimmed },
        { kind: 'ai', id: aiId, text: '', streaming: true },
      ]);
      setStreaming(true);

      (async () => {
        try {
          for await (const ev of streamChat({
            messages: transcript,
            conversationId,
            signal: ac.signal,
          })) {
            handleStreamEvent(ev, aiId, setLiveTurns, setConversationId);
            if (ev.type === 'done' || ev.type === 'error') break;
          }
        } catch (err) {
          // Defensive — streamChat surfaces errors as events, but a fatal
          // throw before any event still needs to be marked on the bubble.
          const msg = err instanceof Error ? err.message : 'Stream failed';
          setLiveTurns((prev) =>
            prev.map((t) =>
              t.id === aiId && t.kind === 'ai'
                ? { ...t, streaming: false, errored: true, text: t.text || `(${msg})` }
                : t,
            ),
          );
        } finally {
          setStreaming(false);
        }
      })();
    },
    [streaming, liveTurns, conversationId],
  );

  // Fire the initial draft as a real message exactly once on mount when the
  // caller passed `?autoSend=1`. Guarded by a ref so React 19's
  // strict-mode-style double-invocation can't double-send. We also guard on
  // `streaming` to avoid clobbering an in-flight stream from upstream state.
  const autoSentRef = useRef(false);
  useEffect(() => {
    if (autoSentRef.current) return;
    if (!autoSendInitialDraft) return;
    if (!initialDraft || !initialDraft.trim()) return;
    if (streaming) return;
    autoSentRef.current = true;
    sendMessage(initialDraft);
    // `sendMessage` is intentionally NOT in the dep list — its identity
    // changes on every liveTurns update, which would re-fire this effect
    // after the first real assistant token lands. The ref above is the
    // canonical "did we already fire" gate.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSendInitialDraft, initialDraft]);

  const retryLast = useCallback(() => {
    if (!lastUserText) return;
    // Trim the last (failed) assistant + user pair, then resend.
    setLiveTurns((prev) => {
      const trimmed = [...prev];
      while (trimmed.length > 0) {
        const last = trimmed[trimmed.length - 1];
        trimmed.pop();
        if (last.kind === 'user') break;
      }
      return trimmed;
    });
    sendMessage(lastUserText);
  }, [lastUserText, sendMessage]);

  return (
    <Screen bg={T.bgCard}>
      <Stack.Screen options={{ headerShown: false }} />
      <Header conversation={conversation} onBack={onBack} />
      <BrainContextStrip />

      <ScrollView
        ref={scrollRef}
        style={{ flex: 1, backgroundColor: T.bgApp }}
        contentContainerStyle={{ paddingVertical: 14 }}
        keyboardShouldPersistTaps="handled"
      >
        <DateDivider label="TODAY · 9:38" />

        {/* Seed: either the canonical mock exchange (legacy + brand-new
            threads) or the persisted history loaded from the portal. */}
        {useMockSeed
          ? renderAiSeed({
              conversation,
              messages: seedMessages,
              onLongPress: onLongPressMessage,
            })
          : renderPersistedAiSeed({
              messages: seedMessages,
              onLongPress: onLongPressMessage,
            })}

        {/* Live turns. */}
        {liveTurns.map((turn) => {
          if (turn.kind === 'user') {
            return (
              <MessageBubble
                key={turn.id}
                kind="user"
                text={turn.text}
              />
            );
          }
          if (turn.kind === 'tool') {
            return (
              <ToolUseCard
                key={turn.id}
                tool={turn.tool}
                scope={turn.scope ?? 'tool.run'}
                args={turn.args}
                status={turn.status}
                result={turn.result}
                onReview={
                  turn.status === 'pending' && turn.pendingId != null
                    ? () =>
                        router.push({
                          pathname: '/approvals/[id]',
                          params: { id: String(turn.pendingId) },
                        })
                    : undefined
                }
              />
            );
          }
          // ai
          if (turn.streaming && !turn.text) {
            return <TypingBubble key={turn.id} />;
          }
          // Credits-exhausted → render the upsell card in place of a bubble.
          if (turn.errored && turn.errorCode === 'AI_CREDITS_EXHAUSTED') {
            return (
              <EntitlementUpsell
                key={turn.id}
                variant="ai_credits"
                upsellUrl={turn.errorUpsellUrl}
                secondaryLabel="Retry"
                onSecondaryPress={retryLast}
              />
            );
          }
          return (
            <View key={turn.id}>
              <MessageBubble
                kind="ai"
                text={turn.text || (turn.errored ? '(connection lost)' : '…')}
                authorName="Assistant"
                aiPill
              />
              {turn.errored ? (
                <Pressable
                  onPress={retryLast}
                  style={{
                    marginLeft: 36 + 14,
                    marginRight: 14,
                    marginTop: -4,
                    marginBottom: 10,
                    alignSelf: 'flex-start',
                    paddingHorizontal: 10,
                    paddingVertical: 5,
                    borderRadius: 999,
                    backgroundColor: T.bgSubtle,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 5,
                  }}
                >
                  <MIcon name="refresh" size={13} color={T.textSecondary} />
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: '600',
                      color: T.textSecondary,
                    }}
                  >
                    Retry
                  </Text>
                </Pressable>
              ) : null}
            </View>
          );
        })}
      </ScrollView>

      <Composer
        mode="ai-1on1"
        showDirectToAiToggle={false}
        onSubmit={sendMessage}
        disabled={streaming}
        // When autoSend fires the draft on mount the user message already
        // lands in the thread as a bubble — don't pre-fill the composer too
        // or we'd show the same text twice.
        initialDraft={autoSendInitialDraft ? undefined : initialDraft}
      />

      <MessageActions
        visible={!!actionTarget}
        onClose={onCloseActions}
        targetText={actionTarget?.text}
        onAction={(id) => {
          console.log('[message-action]', id, 'on', actionTarget?.id);
        }}
      />
    </Screen>
  );
}

/**
 * Reducer-ish helper: apply one SSE event to the live turns list. Pulled
 * out so the consumer effect stays readable.
 */
function handleStreamEvent(
  ev: StreamEvent,
  aiTurnId: string,
  setLiveTurns: React.Dispatch<React.SetStateAction<LiveTurn[]>>,
  setConversationId: React.Dispatch<React.SetStateAction<number | undefined>>,
) {
  switch (ev.type) {
    case 'token':
      setLiveTurns((prev) =>
        prev.map((t) =>
          t.id === aiTurnId && t.kind === 'ai'
            ? { ...t, text: t.text + ev.text }
            : t,
        ),
      );
      return;
    case 'tool_call':
      // Insert a tool card BEFORE the still-streaming AI bubble so the
      // order reads naturally: assistant says "doing X" → tool card → more
      // assistant text.
      setLiveTurns((prev) => {
        const idx = prev.findIndex((t) => t.id === aiTurnId);
        const card: LiveTool = {
          kind: 'tool',
          id: `tool-${ev.id}`,
          tool: ev.tool,
          args: argsToPairs(ev.args),
          scope: undefined,
          status: 'running',
        };
        if (idx < 0) return [...prev, card];
        const out = [...prev];
        out.splice(idx, 0, card);
        return out;
      });
      return;
    case 'tool_result': {
      // Resolve the matching running card into its done/error state with a
      // short summary of the output.
      const { status, result, pendingId } = summarizeToolResult(ev.output);
      setLiveTurns((prev) =>
        prev.map((t) =>
          t.kind === 'tool' && t.id === `tool-${ev.id}`
            ? { ...t, status, result, pendingId }
            : t,
        ),
      );
      return;
    }
    case 'done':
      setConversationId(ev.conversationId);
      setLiveTurns((prev) =>
        prev.map((t) =>
          t.id === aiTurnId && t.kind === 'ai'
            ? { ...t, streaming: false }
            : t,
        ),
      );
      return;
    case 'error':
      setLiveTurns((prev) =>
        prev.map((t) =>
          t.id === aiTurnId && t.kind === 'ai'
            ? {
                ...t,
                streaming: false,
                errored: true,
                errorCode: ev.code,
                errorUpsellUrl: ev.upsellUrl,
                text: t.text || ev.message,
              }
            : t,
        ),
      );
      return;
  }
}

function argsToPairs(args: unknown): Array<[string, string]> {
  if (!args || typeof args !== 'object') return [];
  return Object.entries(args as Record<string, unknown>).map(
    ([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)] as [string, string],
  );
}

/**
 * Condense a tool_result payload into a one-line summary + status for the
 * ToolUseCard footer. The portal serializes tool failures as
 * `{ error: string }` (see the stream route's tool loop), so that shape maps
 * to the error state; everything else is a success with a best-effort label.
 */
function summarizeToolResult(output: unknown): {
  status: 'done' | 'error' | 'pending';
  result: string;
  pendingId?: number;
} {
  if (output && typeof output === 'object') {
    const o = output as Record<string, unknown>;
    // P0.3: a write that was staged for human approval instead of committing.
    if (o.pending === true || o.status === 'pending_approval') {
      return {
        status: 'pending',
        result: 'Queued for approval',
        pendingId: typeof o.pendingId === 'number' ? o.pendingId : undefined,
      };
    }
  }
  if (output && typeof output === 'object' && 'error' in output) {
    const e = (output as { error?: unknown }).error;
    return { status: 'error', result: typeof e === 'string' ? e : 'Tool failed' };
  }
  if (Array.isArray(output)) {
    return {
      status: 'done',
      result: `${output.length} result${output.length === 1 ? '' : 's'}`,
    };
  }
  if (output && typeof output === 'object') {
    const obj = output as Record<string, unknown>;
    const named = obj.title ?? obj.name ?? obj.id;
    if (named != null) return { status: 'done', result: String(named) };
    const n = Object.keys(obj).length;
    return { status: 'done', result: `${n} field${n === 1 ? '' : 's'}` };
  }
  if (typeof output === 'string') {
    return {
      status: 'done',
      result: output.length > 120 ? `${output.slice(0, 117)}…` : output,
    };
  }
  return { status: 'done', result: 'Done' };
}

/* ============================================================
   Typing pulse (placeholder bubble while waiting for first token)
   ============================================================ */
function TypingBubble() {
  return (
    <View
      style={{
        marginLeft: 14,
        marginRight: 14,
        marginBottom: 10,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
      }}
    >
      <AiAvatar size={28} />
      <View
        style={{
          paddingHorizontal: 14,
          paddingVertical: 10,
          backgroundColor: T.aiSoft,
          borderRadius: 14,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
        }}
      >
        <Dot delay={0} />
        <Dot delay={150} />
        <Dot delay={300} />
      </View>
    </View>
  );
}

function Dot({ delay }: { delay: number }) {
  // Tiny opacity pulse without pulling reanimated — visible enough as a
  // "still thinking" affordance.
  const [on, setOn] = useState(false);
  useEffect(() => {
    const t = setInterval(() => setOn((v) => !v), 500);
    const start = setTimeout(() => setOn(true), delay);
    return () => {
      clearInterval(t);
      clearTimeout(start);
    };
  }, [delay]);
  return (
    <View
      style={{
        width: 5,
        height: 5,
        borderRadius: 2.5,
        backgroundColor: T.aiDark,
        opacity: on ? 1 : 0.35,
      }}
    />
  );
}

/* ============================================================
   Header
   ============================================================ */

function Header({
  conversation,
  onBack,
}: {
  conversation: Conversation;
  onBack: () => void;
}) {
  const subtitle =
    conversation.kind === 'ai'
      ? 'Always on · Brain connected'
      : conversation.kind === 'group'
        ? `${conversation.participantIds.length + 1} members${conversation.hasAi ? ' · Assistant on' : ''}`
        : 'Direct message';

  return (
    <View
      style={{
        paddingTop: 4,
        paddingBottom: 12,
        paddingHorizontal: 12,
        backgroundColor: T.bgCard,
        borderBottomWidth: 0.5,
        borderBottomColor: T.borderLight,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
      }}
    >
      <Pressable
        accessibilityLabel="Back"
        onPress={onBack}
        hitSlop={10}
        style={{
          width: 36,
          height: 36,
          borderRadius: 18,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <MIcon name="chevron_left" size={26} color={T.textPrimary} />
      </Pressable>

      <View style={{ flexShrink: 0 }}>
        {conversation.kind === 'ai' ? (
          <AiAvatar size={34} />
        ) : conversation.kind === 'group' ? (
          <AvatarStack ids={conversation.participantIds.slice(0, 2)} size={26} />
        ) : (
          <Avatar id={conversation.participantIds[0] ?? 7} size={34} />
        )}
      </View>

      <View style={{ flex: 1, minWidth: 0 }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <Text
            numberOfLines={1}
            style={{
              fontSize: 15,
              fontWeight: '700',
              color: T.textPrimary,
              letterSpacing: -0.2,
            }}
          >
            {conversation.title}
          </Text>
          {conversation.tag === 'AI' ? (
            <Chip bg={T.aiSoft} color={T.aiDark} fontSize={9}>
              AI
            </Chip>
          ) : null}
        </View>
        <Text
          numberOfLines={1}
          style={{ fontSize: 11, color: T.textSecondary, marginTop: 1 }}
        >
          {subtitle}
        </Text>
      </View>

      <Pressable
        accessibilityLabel="More conversation actions"
        hitSlop={10}
        style={{
          width: 34,
          height: 34,
          borderRadius: 17,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <MIcon name="more_horiz" size={20} color={T.textSecondary} />
      </Pressable>
    </View>
  );
}

function DateDivider({ label }: { label: string }) {
  return (
    <Text
      style={{
        textAlign: 'center',
        fontSize: 10,
        color: T.textTertiary,
        fontWeight: '600',
        letterSpacing: 1,
        marginBottom: 14,
      }}
    >
      {label}
    </Text>
  );
}

/* ============================================================
   AI seed — the canonical mock exchange (kept for visual parity on first
   render, per Phase 3 spec). Becomes the static "history" the live thread
   appends to.
   ============================================================ */
function renderAiSeed({
  conversation,
  messages,
  onLongPress,
}: {
  conversation: Conversation;
  messages: Message[];
  onLongPress: (m: Message) => void;
}) {
  if (conversation.id === 'assistant-primary' || messages.length === 0) {
    const samples: Array<Message | { kind: 'tool' }> = [
      {
        id: 'user-create-deal',
        conversationId: conversation.id,
        kind: 'user',
        text: 'Create a deal for Northpoint Studio — $42K, MarTech Audit, in Discovery',
        time: '9:38',
      },
      {
        id: 'ai-got-it',
        conversationId: conversation.id,
        kind: 'ai',
        text: 'Got it — drafting the deal now.',
        time: '9:38',
      },
      { kind: 'tool' as const },
      {
        id: 'ai-follow-up',
        conversationId: conversation.id,
        kind: 'ai',
        text:
          "Once approved I'll add the Discovery call to your calendar and link Sarah's intake notes from May 12.",
        time: '9:39',
      },
    ];

    return samples.map((s, idx) => {
      if ('id' in s) {
        return (
          <LongPressMessage
            key={s.id}
            message={s}
            onLongPress={onLongPress}
            aiPill={s.kind === 'ai'}
            authorName={s.kind === 'ai' ? 'Assistant' : undefined}
          />
        );
      }
      return (
        <ToolUseCard
          key={`tool-${idx}`}
          tool="crm_deals_create"
          scope="crm.write"
          args={[
            ['name', 'Northpoint Studio — MarTech Audit'],
            ['value', '$42,000'],
            ['stage', 'Discovery'],
            ['contact', 'Sarah Kim'],
            ['pipeline', 'Agency Services'],
          ]}
          confirmText="Created Northpoint Studio · $42K"
        />
      );
    });
  }

  return messages.map((m) => (
    <LongPressMessage
      key={m.id}
      message={m}
      onLongPress={onLongPress}
      aiPill={m.kind === 'ai'}
      authorName={m.kind === 'ai' ? 'Assistant' : m.authorName}
    />
  ));
}

/* ============================================================
   Persisted AI seed — real ai_messages from the portal.
   Renders bubbles only; tool_calls captured server-side aren't surfaced as
   inline ToolUseCards here (the live streaming path is the canonical
   place for those). Empty history shows a soft "say hi" affordance so the
   user has something to scroll past on a brand-new thread.
   ============================================================ */
function renderPersistedAiSeed({
  messages,
  onLongPress,
}: {
  messages: Message[];
  onLongPress: (m: Message) => void;
}) {
  if (messages.length === 0) {
    return (
      <View style={{ padding: 24, alignItems: 'center' }}>
        <Text style={{ color: T.textTertiary, fontSize: 13 }}>
          No messages yet — say hi to the assistant.
        </Text>
      </View>
    );
  }
  return messages.map((m) => (
    <LongPressMessage
      key={m.id}
      message={m}
      onLongPress={onLongPress}
      aiPill={m.kind === 'ai'}
      authorName={m.kind === 'ai' ? 'Assistant' : undefined}
    />
  ));
}

/**
 * Convert a persisted `ai_messages` row into the local `Message` shape used
 * by the bubble components. `assistant` → `ai`, `user` → `user`. Anything
 * else (system / tool, if those ever land in this table) is treated as
 * 'other' so we don't lose it on render.
 */
function persistedToMockMessage(m: AiMessage): Message {
  const kind: Message['kind'] =
    m.role === 'assistant' ? 'ai' : m.role === 'user' ? 'user' : 'other';
  return {
    id: `persisted-${m.id}`,
    conversationId: `ai-${m.conversationId}`,
    kind,
    text: m.content,
    time: formatBubbleTime(m.createdAt),
  };
}

function formatBubbleTime(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  return new Date(t).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

/* ============================================================
   Group / DM thread (unchanged from Phase 2)
   ============================================================ */
function renderHumanThread({
  messages,
  onLongPress,
}: {
  messages: Message[];
  onLongPress: (m: Message) => void;
}) {
  if (messages.length === 0) {
    return (
      <View style={{ padding: 24, alignItems: 'center' }}>
        <Text style={{ color: T.textTertiary, fontSize: 13 }}>
          No messages yet — say hi.
        </Text>
      </View>
    );
  }
  return messages.map((m) => (
    <LongPressMessage
      key={m.id}
      message={m}
      onLongPress={onLongPress}
      authorName={m.kind === 'ai' ? 'Assistant' : m.authorName}
      aiPill={m.kind === 'ai'}
    />
  ));
}

function LongPressMessage({
  message,
  onLongPress,
  authorName,
  aiPill,
}: {
  message: Message;
  onLongPress: (m: Message) => void;
  authorName?: string;
  aiPill?: boolean;
}) {
  return (
    <TouchableWithoutFeedback onLongPress={() => onLongPress(message)}>
      <View>
        <MessageBubble
          kind={message.kind}
          text={message.text}
          authorName={authorName}
          authorAvatarId={message.authorId}
          time={message.time}
          aiPill={aiPill}
        />
      </View>
    </TouchableWithoutFeedback>
  );
}

// Keep gradient imports live to avoid tree-shake; used by sub-components that
// might import T-only when refactored.
void LinearGradient;
void Gradients;
void linearGradientProps;
