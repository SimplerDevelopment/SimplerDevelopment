'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AgentFrame =
  | { type: 'tool_start'; name: string; label: string }
  | { type: 'tool_end'; name: string }
  | { type: 'token'; text: string }
  | { type: 'done'; conversationId: number; tokensUsed: number }
  | { type: 'error'; message: string }
  | { type: 'intent'; intent: string; complexity: 'simple' | 'complex'; reasoning: string }
  | { type: 'plan'; steps: Array<{ action: string; tool: string; reasoning: string }> }
  | { type: 'confidence'; score: number; grounded: boolean; uncertain: boolean };

interface ToolChipState {
  name: string;
  label: string;
  done: boolean;
}

interface Message {
  role: 'user' | 'assistant' | 'error';
  content: string;
  toolChips?: ToolChipState[];
  intent?: { intent: string; complexity: string; reasoning: string };
  plan?: Array<{ action: string; tool: string; reasoning: string }>;
  confidence?: { score: number; grounded: boolean; uncertain: boolean };
}

// ---------------------------------------------------------------------------
// Starter prompts
// ---------------------------------------------------------------------------

const STARTER_PROMPTS = [
  'What decisions were made last quarter?',
  'Find experts in Stripe integration',
  "What's in our glossary for DORA metrics?",
  'Show me active initiatives',
];

// ---------------------------------------------------------------------------
// Tool chip icon map
// ---------------------------------------------------------------------------

const TOOL_ICONS: Record<string, string> = {
  search_brain: 'manage_search',
  search_decisions: 'gavel',
  search_people: 'group',
  search_glossary: 'menu_book',
  search_initiatives: 'rocket_launch',
  search_playbooks: 'auto_stories',
  search_documents: 'description',
  search_topics: 'topic',
  default: 'search',
};

function toolIcon(name: string): string {
  return TOOL_ICONS[name] ?? TOOL_ICONS.default;
}

// ---------------------------------------------------------------------------
// Intent icon map
// ---------------------------------------------------------------------------

const INTENT_ICONS: Record<string, string> = {
  lookup: 'search',
  capture: 'edit',
  planning: 'flag',
  people: 'group',
  procedural: 'play_circle',
  summary: 'dashboard',
};

function intentIcon(intent: string): string {
  return INTENT_ICONS[intent] ?? 'psychology';
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ToolChip({ chip }: { chip: ToolChipState }) {
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs rounded px-2 py-0.5 my-0.5 ${
        chip.done
          ? 'text-muted-foreground opacity-60 bg-muted/50'
          : 'text-muted-foreground bg-muted/50 opacity-70'
      }`}
    >
      {chip.done ? (
        <span className="material-icons text-xs">check_circle</span>
      ) : (
        <span className="material-icons text-xs animate-spin">{toolIcon(chip.name)}</span>
      )}
      {chip.label}
    </span>
  );
}

function StreamingToolChips({ chips }: { chips: ToolChipState[] }) {
  if (chips.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1 mb-2">
      {chips.map((chip, i) => (
        <ToolChip key={`${chip.name}-${i}`} chip={chip} />
      ))}
    </div>
  );
}

function ThinkingIndicator() {
  return (
    <div className="flex items-start gap-2">
      <div className="bg-card border border-border rounded-2xl rounded-tl-sm px-3 py-2">
        <div className="flex gap-1 items-center h-4">
          <span className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce [animation-delay:0ms]" />
          <span className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce [animation-delay:150ms]" />
          <span className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce [animation-delay:300ms]" />
        </div>
      </div>
    </div>
  );
}

function IntentBadge({ intent }: { intent: NonNullable<Message['intent']> }) {
  return (
    <div className="flex items-center gap-1 mb-1.5">
      <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground bg-muted/50 rounded px-1.5 py-0.5">
        <span className="material-icons text-xs">{intentIcon(intent.intent)}</span>
        {intent.intent}
      </span>
      <span className="inline-flex items-center text-xs text-muted-foreground bg-muted/50 rounded px-1.5 py-0.5">
        {intent.complexity}
      </span>
    </div>
  );
}

function PlanSteps({ steps }: { steps: NonNullable<Message['plan']> }) {
  const [expanded, setExpanded] = useState(false);
  if (steps.length === 0) return null;
  return (
    <div className="mb-1.5">
      <button
        onClick={() => setExpanded(v => !v)}
        className="flex items-center gap-1 text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors"
      >
        <span className="material-icons text-xs">
          {expanded ? 'expand_more' : 'chevron_right'}
        </span>
        Plan ({steps.length} step{steps.length !== 1 ? 's' : ''})
      </button>
      {expanded && (
        <ol className="mt-1 space-y-1 pl-4">
          {steps.map((step, i) => (
            <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
              <span className="shrink-0 text-muted-foreground/60">{i + 1}.</span>
              <span>{step.action}</span>
              <span className="font-mono text-xs bg-muted rounded px-1 shrink-0">{step.tool}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function ConfidenceBar({ confidence }: { confidence: NonNullable<Message['confidence']> }) {
  const score = confidence.score;
  const filled = Math.round(score * 5);
  const colorClass =
    score >= 0.7 ? 'text-green-500' : score >= 0.5 ? 'text-amber-500' : 'text-red-500';

  return (
    <div className="mt-2 pt-2 border-t border-border/50">
      <div className={`flex items-center gap-1 text-xs ${colorClass}`}>
        {Array.from({ length: 5 }).map((_, i) => (
          <span key={i} className="material-icons text-xs">
            {i < filled ? 'radio_button_checked' : 'radio_button_unchecked'}
          </span>
        ))}
        <span className="ml-0.5 text-muted-foreground">
          {score.toFixed(2)} confidence
        </span>
      </div>
      {confidence.uncertain && (
        <p className="mt-0.5 text-xs text-amber-600">
          Low confidence — treat as a starting point
        </p>
      )}
    </div>
  );
}

const markdownComponents = {
  p: ({ children }: { children?: React.ReactNode }) => (
    <p className="mb-1.5 last:mb-0">{children}</p>
  ),
  strong: ({ children }: { children?: React.ReactNode }) => (
    <strong className="font-semibold">{children}</strong>
  ),
  em: ({ children }: { children?: React.ReactNode }) => (
    <em className="italic">{children}</em>
  ),
  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul className="list-disc pl-4 mb-1.5 space-y-0.5">{children}</ul>
  ),
  ol: ({ children }: { children?: React.ReactNode }) => (
    <ol className="list-decimal pl-4 mb-1.5 space-y-0.5">{children}</ol>
  ),
  li: ({ children }: { children?: React.ReactNode }) => <li>{children}</li>,
  code: ({ children }: { children?: React.ReactNode }) => (
    <code className="bg-black/10 dark:bg-white/10 rounded px-1 py-0.5 text-xs font-mono">
      {children}
    </code>
  ),
  a: ({ href, children }: { href?: string; children?: React.ReactNode }) => (
    <a
      href={href}
      className="underline text-primary hover:opacity-80 transition-opacity"
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
    </a>
  ),
};

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === 'user';
  const isError = msg.role === 'error';

  if (isUser) {
    return (
      <div className="flex flex-col items-end gap-1">
        <div className="max-w-[80%] rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm break-words bg-primary text-primary-foreground">
          <span className="whitespace-pre-wrap">{msg.content}</span>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-start gap-1">
        <div className="max-w-[80%] rounded-2xl rounded-tl-sm px-4 py-2.5 text-sm break-words bg-destructive/10 border border-destructive/30 text-destructive">
          <div className="flex items-center gap-1.5 font-medium mb-1">
            <span className="material-icons text-sm">error_outline</span>
            Error
          </div>
          <span className="whitespace-pre-wrap">{msg.content}</span>
        </div>
      </div>
    );
  }

  // Assistant
  return (
    <div className="flex flex-col items-start gap-1">
      {msg.toolChips && msg.toolChips.length > 0 && (
        <div className="flex flex-wrap gap-1 max-w-[80%]">
          {msg.toolChips.map((chip, i) => (
            <ToolChip key={`${chip.name}-${i}`} chip={chip} />
          ))}
        </div>
      )}
      <div className="max-w-[80%] rounded-2xl rounded-tl-sm px-4 py-2.5 text-sm break-words bg-card border border-border text-foreground">
        {msg.intent && <IntentBadge intent={msg.intent} />}
        {msg.plan && msg.plan.length > 0 && <PlanSteps steps={msg.plan} />}
        <ReactMarkdown components={markdownComponents}>{msg.content}</ReactMarkdown>
        {msg.confidence && <ConfidenceBar confidence={msg.confidence} />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Streaming message bubble (live, before done)
// ---------------------------------------------------------------------------

function StreamingMessageBubble({
  content,
  toolChips,
  intent,
  plan,
  confidence,
}: {
  content: string;
  toolChips: ToolChipState[];
  intent?: Message['intent'];
  plan?: Message['plan'];
  confidence?: Message['confidence'];
}) {
  return (
    <div className="flex flex-col items-start gap-1">
      {toolChips.length > 0 && (
        <div className="flex flex-wrap gap-1 max-w-[80%]">
          <StreamingToolChips chips={toolChips} />
        </div>
      )}
      <div className="max-w-[80%] rounded-2xl rounded-tl-sm px-4 py-2.5 text-sm break-words bg-card border border-border text-foreground">
        {intent && <IntentBadge intent={intent} />}
        {plan && plan.length > 0 && <PlanSteps steps={plan} />}
        {content ? (
          <ReactMarkdown components={markdownComponents}>{content}</ReactMarkdown>
        ) : (
          <ThinkingIndicator />
        )}
        {confidence && <ConfidenceBar confidence={confidence} />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function BrainAgentChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);

  // Streaming state — kept separate so we don't cause a re-render per token
  // (we update the ref directly and only sync to state periodically)
  const streamingContentRef = useRef('');
  const [streamingContent, setStreamingContent] = useState('');
  const [streamingToolChips, setStreamingToolChips] = useState<ToolChipState[]>([]);
  const [streamingIntent, setStreamingIntent] = useState<Message['intent']>(undefined);
  const [streamingPlan, setStreamingPlan] = useState<Message['plan']>(undefined);
  const [streamingConfidence, setStreamingConfidence] = useState<Message['confidence']>(undefined);

  // Refs to track streaming intent/plan/confidence for use in the done handler
  const streamingIntentRef = useRef<Message['intent']>(undefined);
  const streamingPlanRef = useRef<Message['plan']>(undefined);
  const streamingConfidenceRef = useRef<Message['confidence']>(undefined);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, streaming, scrollToBottom]);

  async function sendMessage(text?: string) {
    const messageText = (text ?? input).trim();
    if (!messageText || streaming) return;

    setInput('');
    setStreaming(true);
    streamingContentRef.current = '';
    setStreamingContent('');
    setStreamingToolChips([]);
    setStreamingIntent(undefined);
    setStreamingPlan(undefined);
    setStreamingConfidence(undefined);
    streamingIntentRef.current = undefined;
    streamingPlanRef.current = undefined;
    streamingConfidenceRef.current = undefined;

    // Optimistic user message
    setMessages(prev => [...prev, { role: 'user', content: messageText }]);

    try {
      const res = await fetch('/api/portal/brain/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: messageText,
          ...(conversationId !== null ? { conversationId } : {}),
        }),
      });

      if (!res.ok || !res.body) {
        throw new Error(`Request failed: ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data:')) continue;

          const jsonStr = trimmed.slice(5).trim();
          if (!jsonStr) continue;

          let frame: AgentFrame;
          try {
            frame = JSON.parse(jsonStr) as AgentFrame;
          } catch {
            continue;
          }

          if (frame.type === 'token') {
            streamingContentRef.current += frame.text;
            setStreamingContent(streamingContentRef.current);
          } else if (frame.type === 'tool_start') {
            setStreamingToolChips(prev => [
              ...prev,
              { name: frame.name, label: frame.label, done: false },
            ]);
          } else if (frame.type === 'tool_end') {
            setStreamingToolChips(prev =>
              prev.map(c => (c.name === frame.name ? { ...c, done: true } : c))
            );
          } else if (frame.type === 'intent') {
            const intentVal = {
              intent: frame.intent,
              complexity: frame.complexity,
              reasoning: frame.reasoning,
            };
            streamingIntentRef.current = intentVal;
            setStreamingIntent(intentVal);
          } else if (frame.type === 'plan') {
            streamingPlanRef.current = frame.steps;
            setStreamingPlan(frame.steps);
          } else if (frame.type === 'confidence') {
            const confVal = {
              score: frame.score,
              grounded: frame.grounded,
              uncertain: frame.uncertain,
            };
            streamingConfidenceRef.current = confVal;
            setStreamingConfidence(confVal);
          } else if (frame.type === 'done') {
            if (!conversationId) setConversationId(frame.conversationId);
            // Finalize: move streaming buffer → committed messages
            const finalContent = streamingContentRef.current;
            const finalIntent = streamingIntentRef.current;
            const finalPlan = streamingPlanRef.current;
            const finalConfidence = streamingConfidenceRef.current;
            setStreamingToolChips(prev => {
              const finalChips = prev.map(c => ({ ...c, done: true }));
              setMessages(msgs => [
                ...msgs,
                {
                  role: 'assistant',
                  content: finalContent,
                  toolChips: finalChips,
                  intent: finalIntent,
                  plan: finalPlan,
                  confidence: finalConfidence,
                },
              ]);
              return [];
            });
            streamingContentRef.current = '';
            setStreamingContent('');
            streamingIntentRef.current = undefined;
            streamingPlanRef.current = undefined;
            streamingConfidenceRef.current = undefined;
            setStreamingIntent(undefined);
            setStreamingPlan(undefined);
            setStreamingConfidence(undefined);
            setStreaming(false);
          } else if (frame.type === 'error') {
            setMessages(prev => [
              ...prev,
              { role: 'error', content: frame.message },
            ]);
            streamingContentRef.current = '';
            setStreamingContent('');
            setStreamingToolChips([]);
            streamingIntentRef.current = undefined;
            streamingPlanRef.current = undefined;
            streamingConfidenceRef.current = undefined;
            setStreamingIntent(undefined);
            setStreamingPlan(undefined);
            setStreamingConfidence(undefined);
            setStreaming(false);
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to reach the Brain Agent.';
      setMessages(prev => [
        ...prev,
        { role: 'error', content: msg },
      ]);
      setStreaming(false);
      streamingContentRef.current = '';
      setStreamingContent('');
      setStreamingToolChips([]);
      streamingIntentRef.current = undefined;
      streamingPlanRef.current = undefined;
      streamingConfidenceRef.current = undefined;
      setStreamingIntent(undefined);
      setStreamingPlan(undefined);
      setStreamingConfidence(undefined);
    } finally {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
    }
  }

  function handleStarterPrompt(prompt: string) {
    void sendMessage(prompt);
  }

  const showStarters = messages.length === 0 && !streaming;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* ----------------------------------------------------------------- */}
      {/* Message area                                                        */}
      {/* ----------------------------------------------------------------- */}
      <div className="flex-1 overflow-y-auto min-h-0 px-4 py-6 space-y-4">
        {showStarters ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-12 gap-4 min-h-[300px]">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
              <span className="material-icons text-primary text-3xl">psychology</span>
            </div>
            <div>
              <p className="text-lg font-semibold text-foreground">Brain Agent</p>
              <p className="text-sm text-muted-foreground mt-1 max-w-xs">
                Ask anything about your company knowledge base. I can search decisions, people,
                glossary, initiatives, and more.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-lg mt-2">
              {STARTER_PROMPTS.map(prompt => (
                <button
                  key={prompt}
                  onClick={() => handleStarterPrompt(prompt)}
                  className="text-sm text-left px-4 py-3 rounded-xl bg-card border border-border hover:border-primary/40 hover:bg-accent transition-colors text-foreground"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map((msg, i) => (
              <MessageBubble key={i} msg={msg} />
            ))}
            {streaming && (
              <StreamingMessageBubble
                content={streamingContent}
                toolChips={streamingToolChips}
                intent={streamingIntent}
                plan={streamingPlan}
                confidence={streamingConfidence}
              />
            )}
          </>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* ----------------------------------------------------------------- */}
      {/* Input area                                                          */}
      {/* ----------------------------------------------------------------- */}
      <div className="shrink-0 border-t border-border bg-background px-4 py-3">
        <div className="flex items-end gap-2 max-w-3xl mx-auto">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything about your company knowledge base…"
            rows={1}
            disabled={streaming}
            className="flex-1 resize-none rounded-xl border border-border bg-background px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50 max-h-36 overflow-y-auto"
            onInput={e => {
              const el = e.currentTarget;
              el.style.height = 'auto';
              el.style.height = `${Math.min(el.scrollHeight, 144)}px`;
            }}
          />
          <button
            onClick={() => void sendMessage()}
            disabled={streaming || !input.trim()}
            className="w-10 h-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 disabled:opacity-40 transition-colors shrink-0"
            title="Send message"
          >
            {streaming ? (
              <span className="material-icons text-base animate-spin">autorenew</span>
            ) : (
              <span className="material-icons text-base">send</span>
            )}
          </button>
        </div>
        <p className="text-xs text-muted-foreground text-center mt-2">
          Enter to send · Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}
